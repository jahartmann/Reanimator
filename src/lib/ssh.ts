/**
 * SSH Utility Module
 * Handles SSH connections to Proxmox servers for config backup
 */

import { Client, SFTPWrapper } from 'ssh2';
import fs from 'fs';
import path from 'path';

interface SSHConfig {
    host: string;
    port: number;
    username: string;
    privateKey?: string;
    password?: string;
}

interface FileInfo {
    path: string;
    size: number;
    isDirectory: boolean;
}

export class SSHClient {
    private config: SSHConfig;
    private client: Client;

    constructor(config: SSHConfig) {
        this.config = config;
        this.client = new Client();
    }

    // Connect to the server
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.on('ready', () => {
                console.log(`[SSH] Connected to ${this.config.host}`);
                resolve();
            });

            this.client.on('error', (err) => {
                console.error(`[SSH] Connection error:`, err);
                reject(err);
            });

            const connectConfig: any = {
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
            };

            if (this.config.privateKey) {
                connectConfig.privateKey = this.config.privateKey;
            } else if (this.config.password) {
                connectConfig.password = this.config.password;
            }

            this.client.connect(connectConfig);
        });
    }

    // Disconnect
    disconnect(): void {
        this.client.end();
    }

    // Execute a command
    async exec(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.client.exec(command, (err, stream) => {
                if (err) return reject(err);

                let output = '';
                let errorOutput = '';

                stream.on('data', (data: Buffer) => {
                    output += data.toString();
                });

                stream.stderr.on('data', (data: Buffer) => {
                    errorOutput += data.toString();
                });

                stream.on('close', (code: number) => {
                    if (code !== 0 && errorOutput) {
                        reject(new Error(errorOutput));
                    } else {
                        resolve(output);
                    }
                });
            });
        });
    }

    // Get SFTP session
    private async getSFTP(): Promise<SFTPWrapper> {
        return new Promise((resolve, reject) => {
            this.client.sftp((err, sftp) => {
                if (err) reject(err);
                else resolve(sftp);
            });
        });
    }

    // List files in a directory
    async listDir(remotePath: string): Promise<FileInfo[]> {
        const sftp = await this.getSFTP();
        return new Promise((resolve, reject) => {
            sftp.readdir(remotePath, (err, list) => {
                if (err) return reject(err);

                const files: FileInfo[] = list.map(item => ({
                    path: path.join(remotePath, item.filename),
                    size: item.attrs.size,
                    isDirectory: item.attrs.isDirectory()
                }));

                resolve(files);
            });
        });
    }

    // Download a single file
    async downloadFile(remotePath: string, localPath: string): Promise<void> {
        const sftp = await this.getSFTP();

        // Ensure local directory exists
        const localDir = path.dirname(localPath);
        if (!fs.existsSync(localDir)) {
            fs.mkdirSync(localDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            sftp.fastGet(remotePath, localPath, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // Upload a file
    async uploadFile(localPath: string, remotePath: string): Promise<void> {
        const sftp = await this.getSFTP();
        return new Promise((resolve, reject) => {
            sftp.fastPut(localPath, remotePath, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // Download a directory recursively
    async downloadDir(remotePath: string, localPath: string, progress?: (file: string) => void): Promise<number> {
        const sftp = await this.getSFTP();
        let fileCount = 0;

        const downloadRecursive = async (remote: string, local: string): Promise<void> => {
            // Ensure local directory exists
            if (!fs.existsSync(local)) {
                fs.mkdirSync(local, { recursive: true });
            }

            const listDir = (dirPath: string): Promise<any[]> => {
                return new Promise((resolve, reject) => {
                    sftp.readdir(dirPath, (err, list) => {
                        if (err) reject(err);
                        else resolve(list || []);
                    });
                });
            };

            try {
                const items = await listDir(remote);

                for (const item of items) {
                    const remoteFull = path.posix.join(remote, item.filename);
                    const localFull = path.join(local, item.filename);

                    if (item.attrs.isDirectory()) {
                        await downloadRecursive(remoteFull, localFull);
                    } else {
                        await new Promise<void>((resolve, reject) => {
                            sftp.fastGet(remoteFull, localFull, (err) => {
                                if (err) reject(err);
                                else {
                                    fileCount++;
                                    if (progress) progress(remoteFull);
                                    resolve();
                                }
                            });
                        });
                    }
                }
            } catch (err) {
                console.error(`[SSH] Error downloading ${remote}:`, err);
                // Continue with other directories
            }
        };

        await downloadRecursive(remotePath, localPath);
        return fileCount;
    }

    // Read file content directly
    async readFile(remotePath: string): Promise<string> {
        const sftp = await this.getSFTP();
        return new Promise((resolve, reject) => {
            let content = '';
            const readStream = sftp.createReadStream(remotePath);

            readStream.on('data', (chunk: Buffer) => {
                content += chunk.toString();
            });

            readStream.on('end', () => {
                resolve(content);
            });

            readStream.on('error', (err: Error) => {
                reject(err);
            });
        });
    }
}

// Helper to create SSH client from server config
export function createSSHClient(server: {
    ssh_host?: string;
    ssh_port?: number;
    ssh_user?: string;
    ssh_key?: string;
    url?: string;
}): SSHClient {
    // Extract host from URL if ssh_host not set
    let host = server.ssh_host;
    if (!host && server.url) {
        try {
            const url = new URL(server.url);
            host = url.hostname;
        } catch (e) {
            throw new Error('No SSH host configured and could not extract from URL');
        }
    }

    if (!host) {
        throw new Error('No SSH host configured');
    }

    return new SSHClient({
        host,
        port: server.ssh_port || 22,
        username: server.ssh_user || 'root',
        privateKey: server.ssh_key
    });
}
