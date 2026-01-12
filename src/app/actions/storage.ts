'use server';

import fs from 'fs';
import path from 'path';
import db, { backupDir } from '@/lib/db';
import { createSSHClient } from '@/lib/ssh';

interface StorageStats {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
    backupCount: number;
    lastBackup: string | null;
}

interface ServerStorage {
    serverId: number;
    serverName: string;
    serverType: 'pve' | 'pbs';
    storages: {
        name: string;
        type: string;
        total: number;
        used: number;
        available: number;
        usagePercent: number;
        active: boolean;
        isShared?: boolean; // For cluster-wide shared storage (Ceph)
    }[];
}

// Get storage statistics for the backup directory
export async function getStorageStats(): Promise<StorageStats> {
    let used = 0;
    let backupCount = 0;
    let lastBackupTime: Date | null = null;

    // Calculate size of backup directory
    const walkDir = (dir: string): number => {
        let size = 0;
        if (!fs.existsSync(dir)) return 0;

        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    size += walkDir(fullPath);
                } else {
                    size += stat.size;
                }
            } catch (e) {
                // Skip inaccessible files
            }
        }
        return size;
    };

    // Walk backup directory and count backups
    if (fs.existsSync(backupDir)) {
        const serverDirs = fs.readdirSync(backupDir);
        for (const serverDir of serverDirs) {
            const serverPath = path.join(backupDir, serverDir);
            const stat = fs.statSync(serverPath);
            if (stat.isDirectory()) {
                const backupDirs = fs.readdirSync(serverPath);
                for (const backupName of backupDirs) {
                    if (/^\d{4}-\d{2}-\d{2}/.test(backupName)) {
                        backupCount++;
                        const backupPath = path.join(serverPath, backupName);
                        const backupStat = fs.statSync(backupPath);
                        if (!lastBackupTime || backupStat.mtime > lastBackupTime) {
                            lastBackupTime = backupStat.mtime;
                        }
                    }
                }
            }
        }
        used = walkDir(backupDir);
    }

    // Placeholder total - should be configurable or read from disk
    const total = 10 * 1024 * 1024 * 1024; // 10GB
    const free = total - used;
    const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;

    const lastBackupStr = lastBackupTime ? lastBackupTime.toISOString() : null;

    return {
        total,
        used,
        free,
        usagePercent,
        backupCount,
        lastBackup: lastBackupStr
    };
}

function parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^([\d.]+)([KMGTP]?)$/i);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = (match[2] || '').toUpperCase();
    const multipliers: Record<string, number> = { 'K': 1024, 'M': 1024 ** 2, 'G': 1024 ** 3, 'T': 1024 ** 4, 'P': 1024 ** 5 };
    return Math.round(num * (multipliers[unit] || 1));
}

// Get storage pools from all servers via SSH
export async function getServerStorages(): Promise<ServerStorage[]> {
    const servers = db.prepare(`
        SELECT id, name, type, ssh_host, ssh_port, ssh_user, ssh_key 
        FROM servers 
        WHERE ssh_key IS NOT NULL
    `).all() as any[];

    const results: ServerStorage[] = [];

    for (const server of servers) {
        try {
            const ssh = createSSHClient(server);
            await ssh.connect();

            const storages: ServerStorage['storages'] = [];

            // ZFS pools
            try {
                const zfsOutput = await ssh.exec(`zpool list -Hp -o name,size,alloc,free,health 2>/dev/null || echo ""`, 10000);
                for (const line of zfsOutput.trim().split('\n').filter(Boolean)) {
                    const parts = line.split('\t');
                    if (parts.length >= 5) {
                        const total = parseInt(parts[1]) || 0;
                        const used = parseInt(parts[2]) || 0;
                        storages.push({
                            name: parts[0],
                            type: 'zfs',
                            total,
                            used,
                            available: parseInt(parts[3]) || 0,
                            usagePercent: total > 0 ? (used / total) * 100 : 0,
                            active: parts[4] === 'ONLINE'
                        });
                    }
                }
            } catch { /* ZFS not available */ }

            // LVM volume groups
            try {
                const lvmOutput = await ssh.exec(`vgs --noheadings --units b -o vg_name,vg_size,vg_free 2>/dev/null || echo ""`, 10000);
                for (const line of lvmOutput.trim().split('\n').filter(Boolean)) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 3) {
                        const total = parseSize(parts[1].replace('B', ''));
                        const available = parseSize(parts[2].replace('B', ''));
                        const used = total - available;
                        storages.push({
                            name: parts[0],
                            type: 'lvm',
                            total,
                            used,
                            available,
                            usagePercent: total > 0 ? (used / total) * 100 : 0,
                            active: true
                        });
                    }
                }
            } catch { /* LVM not available */ }

            // Ceph pools (detect via rados or ceph df)
            try {
                const cephOutput = await ssh.exec(`ceph df -f json 2>/dev/null || echo ""`, 10000);
                if (cephOutput.trim() && cephOutput.trim().startsWith('{')) {
                    const cephData = JSON.parse(cephOutput);
                    if (cephData.stats) {
                        const total = cephData.stats.total_bytes || 0;
                        const used = cephData.stats.total_used_bytes || 0;
                        const available = cephData.stats.total_avail_bytes || 0;
                        storages.push({
                            name: 'ceph-cluster',
                            type: 'ceph',
                            total,
                            used,
                            available,
                            usagePercent: total > 0 ? (used / total) * 100 : 0,
                            active: true,
                            isShared: true // Mark as cluster-wide shared storage
                        });
                    }
                }
            } catch { /* Ceph not available */ }

            // Filesystem mounts (major ones)
            try {
                const dfOutput = await ssh.exec(`df -B1 --output=target,size,used,avail / /var /home 2>/dev/null | tail -n +2 || echo ""`, 10000);
                for (const line of dfOutput.trim().split('\n').filter(Boolean)) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 4) {
                        const total = parseInt(parts[1]) || 0;
                        const used = parseInt(parts[2]) || 0;
                        storages.push({
                            name: parts[0],
                            type: 'fs',
                            total,
                            used,
                            available: parseInt(parts[3]) || 0,
                            usagePercent: total > 0 ? (used / total) * 100 : 0,
                            active: true
                        });
                    }
                }
            } catch { /* df failed */ }

            ssh.disconnect();

            if (storages.length > 0) {
                results.push({
                    serverId: server.id,
                    serverName: server.name,
                    serverType: server.type,
                    storages
                });
            }
        } catch (e) {
            console.error(`Failed to fetch storage for ${server.name}:`, e);
        }
    }

    // Deduplicate shared storage (Ceph) across cluster nodes
    // If multiple servers report the same ceph-cluster, only show it once
    const seenSharedStorages = new Set<string>();
    for (const server of results) {
        server.storages = server.storages.filter(storage => {
            if ((storage as any).isShared) {
                const key = `${storage.type}:${storage.name}:${storage.total}`;
                if (seenSharedStorages.has(key)) {
                    return false; // Skip duplicate
                }
                seenSharedStorages.add(key);
            }
            return true;
        });
    }

    return results;
}


