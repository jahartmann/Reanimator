'use server';

import db, { backupDir } from '@/lib/db';
import { createSSHClient } from '@/lib/ssh';
import path from 'path';
import fs from 'fs';

interface Server {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    url: string;
    ssh_host?: string;
    ssh_port?: number;
    ssh_user?: string;
    ssh_key?: string;
}

interface ConfigBackup {
    id: number;
    server_id: number;
    backup_path: string;
    backup_date: string;
    file_count: number;
    total_size: number;
    status: string;
}

// Paths to backup based on server type
const PVE_PATHS = [
    '/etc/pve',
    '/etc/network/interfaces',
    '/etc/hostname',
    '/etc/hosts',
    '/etc/resolv.conf',
    '/etc/ssh/sshd_config',
];

const PBS_PATHS = [
    '/etc/proxmox-backup',
    '/etc/network/interfaces',
    '/etc/hostname',
    '/etc/hosts',
    '/etc/resolv.conf',
    '/etc/ssh/sshd_config',
];

// Get all config backups for a server
export async function getConfigBackups(serverId: number): Promise<ConfigBackup[]> {
    const backups = db.prepare(`
        SELECT * FROM config_backups 
        WHERE server_id = ? 
        ORDER BY backup_date DESC
    `).all(serverId) as ConfigBackup[];
    return backups;
}

// Create a new config backup
export async function createConfigBackup(serverId: number): Promise<{ success: boolean; message: string; backupId?: number }> {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as Server | undefined;

    if (!server) {
        return { success: false, message: 'Server nicht gefunden' };
    }

    // Check if SSH is configured
    if (!server.ssh_host && !server.url) {
        return { success: false, message: 'Kein SSH-Host konfiguriert' };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `server-${serverId}`, timestamp);

    console.log(`[ConfigBackup] Starting backup for ${server.name} to ${backupPath}`);

    try {
        // Create backup directory
        fs.mkdirSync(backupPath, { recursive: true });

        // Connect via SSH
        const ssh = createSSHClient(server);
        await ssh.connect();

        const pathsToBackup = server.type === 'pve' ? PVE_PATHS : PBS_PATHS;
        let totalFiles = 0;
        let totalSize = 0;
        const errors: string[] = [];

        // Backup each path
        for (const remotePath of pathsToBackup) {
            try {
                const localPath = path.join(backupPath, remotePath);
                console.log(`[ConfigBackup] Backing up ${remotePath}...`);

                // Check if path is a file or directory
                const checkResult = await ssh.exec(`test -d "${remotePath}" && echo "dir" || test -f "${remotePath}" && echo "file" || echo "none"`);
                const pathType = checkResult.trim();

                if (pathType === 'dir') {
                    const files = await ssh.downloadDir(remotePath, localPath, (file) => {
                        console.log(`[ConfigBackup] Downloaded: ${file}`);
                    });
                    totalFiles += files;
                } else if (pathType === 'file') {
                    await ssh.downloadFile(remotePath, localPath);
                    totalFiles += 1;
                } else {
                    console.log(`[ConfigBackup] Path does not exist: ${remotePath}`);
                }
            } catch (err) {
                console.error(`[ConfigBackup] Error backing up ${remotePath}:`, err);
                errors.push(`${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        ssh.disconnect();

        // Calculate total size
        const calculateSize = (dir: string): number => {
            let size = 0;
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    if (stat.isDirectory()) {
                        size += calculateSize(filePath);
                    } else {
                        size += stat.size;
                    }
                }
            }
            return size;
        };

        totalSize = calculateSize(backupPath);

        // Save to database
        const result = db.prepare(`
            INSERT INTO config_backups (server_id, backup_path, file_count, total_size, status, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(serverId, backupPath, totalFiles, totalSize, 'complete', errors.length > 0 ? errors.join('\n') : null);

        console.log(`[ConfigBackup] Backup complete: ${totalFiles} files, ${totalSize} bytes`);

        return {
            success: true,
            message: `Backup erfolgreich: ${totalFiles} Dateien gesichert${errors.length > 0 ? ` (${errors.length} Fehler)` : ''}`,
            backupId: result.lastInsertRowid as number
        };

    } catch (err) {
        console.error('[ConfigBackup] Backup failed:', err);
        return {
            success: false,
            message: `Backup fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
        };
    }
}

// Get files in a backup
export async function getBackupFiles(backupId: number): Promise<{ path: string; size: number }[]> {
    const backup = db.prepare('SELECT * FROM config_backups WHERE id = ?').get(backupId) as ConfigBackup | undefined;

    if (!backup) return [];

    const files: { path: string; size: number }[] = [];

    const walkDir = (dir: string, basePath: string) => {
        if (!fs.existsSync(dir)) return;

        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = path.join(basePath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                walkDir(fullPath, relativePath);
            } else {
                files.push({
                    path: relativePath,
                    size: stat.size
                });
            }
        }
    };

    walkDir(backup.backup_path, '');
    return files;
}

// Read a file from backup
export async function readBackupFile(backupId: number, filePath: string): Promise<string | null> {
    const backup = db.prepare('SELECT * FROM config_backups WHERE id = ?').get(backupId) as ConfigBackup | undefined;

    if (!backup) return null;

    const fullPath = path.join(backup.backup_path, filePath);

    if (!fs.existsSync(fullPath)) return null;

    // Security check - prevent path traversal
    const realPath = fs.realpathSync(fullPath);
    if (!realPath.startsWith(backup.backup_path)) {
        return null;
    }

    return fs.readFileSync(fullPath, 'utf-8');
}

// Delete a backup
export async function deleteConfigBackup(backupId: number): Promise<{ success: boolean; message: string }> {
    const backup = db.prepare('SELECT * FROM config_backups WHERE id = ?').get(backupId) as ConfigBackup | undefined;

    if (!backup) {
        return { success: false, message: 'Backup nicht gefunden' };
    }

    try {
        // Delete files
        if (fs.existsSync(backup.backup_path)) {
            fs.rmSync(backup.backup_path, { recursive: true });
        }

        // Delete from database
        db.prepare('DELETE FROM config_backups WHERE id = ?').run(backupId);

        return { success: true, message: 'Backup gelöscht' };
    } catch (err) {
        return { success: false, message: `Löschen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` };
    }
}

// Restore a file to server
export async function restoreFile(backupId: number, filePath: string, serverId: number): Promise<{ success: boolean; message: string }> {
    const backup = db.prepare('SELECT * FROM config_backups WHERE id = ?').get(backupId) as ConfigBackup | undefined;
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as Server | undefined;

    if (!backup || !server) {
        return { success: false, message: 'Backup oder Server nicht gefunden' };
    }

    const localPath = path.join(backup.backup_path, filePath);

    if (!fs.existsSync(localPath)) {
        return { success: false, message: 'Datei nicht im Backup gefunden' };
    }

    try {
        const ssh = createSSHClient(server);
        await ssh.connect();

        // The file path in backup corresponds to remote path
        await ssh.uploadFile(localPath, filePath);

        ssh.disconnect();

        return { success: true, message: `Datei ${filePath} wiederhergestellt` };
    } catch (err) {
        return { success: false, message: `Wiederherstellung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` };
    }
}
