'use server';

import db from '@/lib/db';
import { createSSHClient, SSHClient } from '@/lib/ssh';

export interface LibraryItem {
    name: string;
    type: 'iso' | 'vztmpl';
    size: number; // bytes
    format: string;
    locations: {
        serverId: number;
        serverName: string;
        storage: string;
        volid: string;
        size: number;
        path: string;
    }[];
}

interface Server {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    ssh_host?: string;
    ssh_port?: number;
    ssh_user?: string;
    ssh_key?: string;
    url: string;
}

export async function getLibraryContent(): Promise<LibraryItem[]> {
    const servers = db.prepare('SELECT * FROM servers WHERE type = ?').all('pve') as Server[];

    // Parallelize server scanning
    const results = await Promise.all(servers.map(async (server) => {
        if (!server.ssh_key) return [];

        let client: SSHClient | null = null;
        try {
            client = createSSHClient({
                ssh_host: server.ssh_host || new URL(server.url).hostname,
                ssh_port: server.ssh_port || 22,
                ssh_user: server.ssh_user || 'root',
                ssh_key: server.ssh_key,
            });
            await client.connect();

            // Get active storages
            let statusOutput = '';
            try {
                // Reduced timeout to 5s to avoid hanging
                statusOutput = await client.exec('pvesm status', 5000);
            } catch (e) {
                console.error(`[Library] Failed to get storage status on ${server.name}`, e);
                client.disconnect();
                return [];
            }

            const activeStorages = statusOutput.split('\n')
                .slice(1)
                .filter(line => line.trim())
                .map(line => {
                    const parts = line.split(/\s+/);
                    return { name: parts[0], type: parts[1], status: parts[2] };
                })
                .filter(s => s.status === 'active');

            const serverItems: LibraryItem[] = [];

            if (!client) throw new Error("SSH Client not initialized");
            const ssh = client;

            // Parallelize storage scanning within server
            await Promise.all(activeStorages.map(async (storage) => {
                // ISOs
                try {
                    const isoJson = await ssh.exec(`pvesm list ${storage.name} --content iso --output-format json 2>/dev/null`, 10000);
                    const isos = JSON.parse(isoJson);
                    isos.forEach((iso: any) => {
                        serverItems.push({
                            volid: iso.volid,
                            name: iso.volid.split('/').pop() || iso.volid,
                            format: iso.format,
                            size: iso.size,
                            type: 'iso',
                            locations: [{ serverId: server.id, serverName: server.name, storage: storage.name, volid: iso.volid, size: iso.size, path: iso.volid }]
                        });
                    });
                } catch (e) {
                    try {
                        // Fallback text parsing
                        const txt = await ssh.exec(`pvesm list ${storage.name} --content iso 2>/dev/null`, 5000);
                        txt.split('\n').slice(1).forEach(line => {
                            const p = line.trim().split(/\s+/);
                            if (p.length < 2) return;
                            serverItems.push({
                                volid: p[0],
                                name: p[0].split('/').pop() || p[0],
                                format: p[1],
                                size: parseInt(p[2] || '0'),
                                type: 'iso',
                                locations: [{ serverId: server.id, serverName: server.name, storage: storage.name, volid: p[0], size: parseInt(p[2] || '0'), path: p[0] }]
                            });
                        });
                    } catch (ex) { }
                }

                // Templates
                try {
                    const tplJson = await ssh.exec(`pvesm list ${storage.name} --content vztmpl --output-format json 2>/dev/null`, 10000);
                    const tpls = JSON.parse(tplJson);
                    tpls.forEach((tpl: any) => {
                        serverItems.push({
                            volid: tpl.volid,
                            name: tpl.volid.split('/').pop() || tpl.volid,
                            format: tpl.format,
                            size: tpl.size,
                            type: 'vztmpl',
                            locations: [{ serverId: server.id, serverName: server.name, storage: storage.name, volid: tpl.volid, size: tpl.size, path: tpl.volid }]
                        });
                    });
                } catch (e) {
                    try {
                        const txt = await ssh.exec(`pvesm list ${storage.name} --content vztmpl 2>/dev/null`, 5000);
                        txt.split('\n').slice(1).forEach(line => {
                            const p = line.trim().split(/\s+/);
                            if (p.length < 2) return;
                            serverItems.push({
                                volid: p[0],
                                name: p[0].split('/').pop() || p[0],
                                format: p[1],
                                size: parseInt(p[2] || '0'),
                                type: 'vztmpl',
                                locations: [{ serverId: server.id, serverName: server.name, storage: storage.name, volid: p[0], size: parseInt(p[2] || '0'), path: p[0] }]
                            });
                        });
                    } catch (ex) { }
                }
            }));

            client.disconnect();
            return serverItems;

        } catch (e) {
            console.error(`[Library] Error scanning server ${server.name}:`, e);
            if (client) client.disconnect();
            return [];
        }
    }));

    // Aggregate results
    const allItems: LibraryItem[] = [];
    results.flat().forEach(item => {
        const existing = allItems.find(i => i.name === item.name && i.type === item.type);
        if (existing) {
            existing.locations.push(...item.locations);
        } else {
            allItems.push(item);
        }
    });

    return allItems.sort((a, b) => a.name.localeCompare(b.name));
}

// The parsePvesmContent function is no longer used with the new pvesh JSON output approach.
// It can be removed if not used elsewhere.
function parsePvesmContent(output: string, type: 'iso' | 'vztmpl', server: Server, storage: string, allItems: Record<string, LibraryItem>) {
    const lines = output.split('\n');
    if (lines.length < 2) return;

    lines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(/\s+/);
        if (parts.length < 4) return;

        const volid = parts[0];
        const format = parts[1];
        const size = parseInt(parts[3] || '0');

        // Extract filename from volid (storage:content/filename)
        const namePart = volid.split('/')[1] || volid.split(':')[1];
        if (!namePart) return;

        if (!allItems[namePart]) {
            allItems[namePart] = {
                name: namePart,
                type: type,
                size: size,
                format: format,
                volid: volid, // Assuming the first volid found is the primary one for the top-level item
                locations: []
            };
        }

        allItems[namePart].locations.push({
            serverId: server.id,
            serverName: server.name,
            storage: storage,
            volid: volid,
            size: size,
            path: volid // Assuming volid is the path here
        });
    });
}

// --- Sync Capabilities ---

export async function getEligibleStorages(serverId: number, type: 'iso' | 'vztmpl'): Promise<string[]> {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as Server;
    if (!server || !server.ssh_key) return [];

    let ssh;
    try {
        ssh = createSSHClient({
            ssh_host: server.ssh_host || new URL(server.url).hostname,
            ssh_port: server.ssh_port || 22,
            ssh_user: server.ssh_user || 'root',
            ssh_key: server.ssh_key,
        });
        await ssh.connect();

        // Check storages that support this content type
        // Trick: try `pvesm list <storage> --content <type>` on all active storages.
        // Or better, parse storage.cfg. Parsing storage.cfg is robust.

        const cfgOutput = await ssh.exec('cat /etc/pve/storage.cfg', 5000);
        // dir: local
        //      content iso,vztmpl,backup

        const eligible: string[] = [];
        let currentStorage: string | null = null;

        cfgOutput.split('\n').forEach(line => {
            if (line.match(/^[a-z]+:\s+\S+/)) {
                currentStorage = line.split(':')[1].trim();
            } else if (line.trim().startsWith('content') && currentStorage) {
                const content = line.trim().split(/\s+/).slice(1).join('').split(',');
                if (content.includes(type)) {
                    eligible.push(currentStorage);
                }
            } else if (line.trim() === '') {
                // reset? No need.
            }
        });

        // Filter for only ACTIVE ones
        const statusOutput = await ssh.exec('pvesm status', 5000);
        const activeStorages = new Set(statusOutput.split('\n').filter(l => l.includes('active')).map(l => l.split(/\s+/)[0]));

        ssh.disconnect();
        return eligible.filter(s => activeStorages.has(s));

    } catch (e) {
        if (ssh) ssh.disconnect();
        console.error("Get Eligible Storages Failed", e);
        return [];
    }
}

export async function syncLibraryItem(sourceServerId: number, targetServerId: number, sourceVolid: string, targetStorage: string, type: 'iso' | 'vztmpl') {
    const sourceServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(sourceServerId) as Server;
    const targetServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(targetServerId) as Server;

    if (!sourceServer?.ssh_key || !targetServer?.ssh_key) throw new Error("Missing SSH Credentials");

    let sourceSSH, targetSSH;
    try {
        // 1. Connect Source & Get Path
        sourceSSH = createSSHClient({
            ssh_host: sourceServer.ssh_host || new URL(sourceServer.url).hostname,
            ssh_port: sourceServer.ssh_port || 22,
            ssh_user: sourceServer.ssh_user || 'root',
            ssh_key: sourceServer.ssh_key,
        });
        await sourceSSH.connect();

        const sourcePath = (await sourceSSH.exec(`pvesm path ${sourceVolid}`, 5000)).trim();
        if (!sourcePath || sourcePath.includes('Error')) throw new Error(`Could not resolve source path for ${sourceVolid}`);

        // 2. Connect Target & Determine Path
        targetSSH = createSSHClient({
            ssh_host: targetServer.ssh_host || new URL(targetServer.url).hostname,
            ssh_port: targetServer.ssh_port || 22,
            ssh_user: targetServer.ssh_user || 'root',
            ssh_key: targetServer.ssh_key,
        });
        await targetSSH.connect();

        // Get Mountpoint of target storage
        // We can use a trick: `pvesm path <storage>:iso/test` might fail if file doesn't exist.
        // Parse storage.cfg to find 'path'.
        const cfgOutput = await targetSSH.exec('cat /etc/pve/storage.cfg', 5000);
        const storagePath = parseStoragePath(cfgOutput, targetStorage);
        if (!storagePath) throw new Error(`Could not find path for storage ${targetStorage} on target`);

        const filename = sourceVolid.split('/').pop()?.split(':')[1] || sourceVolid.split('/').pop() || 'image';
        // subdir: template/iso for ISO, template/cache for VZTMPL
        const subdir = type === 'iso' ? 'template/iso' : 'template/cache';
        const targetFullPath = `${storagePath}/${subdir}/${filename}`;

        // 3. Execute Copy (Stream)
        // We can't easily pipe two SSH sessions in Node SSH2 directly without streaming data through Node.
        // We will read from source and write to target using streams.

        // This function needs to be implemented using Streams in `lib/ssh.ts`? 
        // Or we can use `ssh.spawn` to get a stream.

        // Simplified approach: Trigger a remote command on Target that SSHs to Source?
        // NO, keys might not be exchanged.

        // Controller as Relay: Source -> Controller -> Target.
        // Use `cat` on source, pipe to `cat >` on target.
        // Requires updating `lib/ssh.ts` to support raw streams or `exec` returning stdout stream.
        // My `exec` returns Promise<string>.
        // I need to modify `createSSHClient` or add a streaming method?
        // Wait, `ssh2` Client supports `exec` which gives a stream.

        // Since I can't easily modify `lib/ssh.ts` deeply right now without risk, 
        // I will use a simplified fallback: `scp` download to tmp and upload.
        // LIMITATION: Use `/tmp` (might run out of space).
        // BETTER: Use `cwd/data/tmp`.

        // Actually, let's try to add a `stream` method to `lib/ssh.ts`? 
        // No, let's keep it simple. If files are large, this is bad.
        // But for ISOs (1-4GB), it's manageable if we stream.
        // If I can't stream, I'll download/upload.

        // Actually, I can execute: `ssh -i key ... source cat ... | ssh -i key ... target cat ...` 
        // via `child_process.exec` on the CONTROLLER (Mac).
        // This is much better! The controller (me) has the keys and connectivity.
        // I just need the temporary private key files?
        // I have the keys in the DB. I can write them to temp files.

        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);

        const tmpDir = os.tmpdir();
        const sourceKeyPath = path.join(tmpDir, `key_source_${sourceServerId}`);
        const targetKeyPath = path.join(tmpDir, `key_target_${targetServerId}`);

        fs.writeFileSync(sourceKeyPath, sourceServer.ssh_key, { mode: 0o600 });
        fs.writeFileSync(targetKeyPath, targetServer.ssh_key, { mode: 0o600 });

        const sourceHost = sourceServer.ssh_host || new URL(sourceServer.url).hostname;
        const targetHost = targetServer.ssh_host || new URL(targetServer.url).hostname;

        const cmd = `ssh -o StrictHostKeyChecking=no -i ${sourceKeyPath} -p ${sourceServer.ssh_port || 22} root@${sourceHost} "cat ${sourcePath}" | ssh -o StrictHostKeyChecking=no -i ${targetKeyPath} -p ${targetServer.ssh_port || 22} root@${targetHost} "cat > ${targetFullPath}"`;

        await execPromise(cmd);

        // Cleanup
        fs.unlinkSync(sourceKeyPath);
        fs.unlinkSync(targetKeyPath);

        sourceSSH.disconnect();
        targetSSH.disconnect();
        return { success: true };

    } catch (e: any) {
        if (sourceSSH) sourceSSH.disconnect();
        if (targetSSH) targetSSH.disconnect();
        console.error("Sync Failed", e);
        throw new Error(e.message || "Sync Failed");
    }
}

function parseStoragePath(cfg: string, storage: string): string | null {
    let currentStorage: string | null = null;
    let path: string | null = null;

    // Simple parser
    const lines = cfg.split('\n');
    for (const line of lines) {
        if (line.match(/^[a-z]+:\s+\S+/)) {
            // New block
            const name = line.split(':')[1].trim();
            if (currentStorage === storage) {
                // We were in the block and finished it? No, checking properties.
                // If we found path before, return it.
                if (path) return path;
                // If not, maybe we missed it.
            }
            currentStorage = name;
            path = null; // reset for new block
        }
        if (currentStorage === storage) {
            if (line.trim().startsWith('path')) {
                path = line.trim().split(/\s+/)[1];
                return path; // Found it!
            }
        }
    }
    return null;
}
