'use server';

import fs from 'fs';
import path from 'path';
import { backupDir } from '@/lib/db';

interface StorageStats {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
    backupCount: number;
    lastBackup: string | null;
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
