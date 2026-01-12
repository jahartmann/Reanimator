import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { Client } from 'ssh2';

export const dynamic = 'force-dynamic';

interface ServerItem {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    url: string;
    ssh_host?: string;
    ssh_port?: number;
    ssh_user?: string;
    ssh_key?: string;
    group_name?: string | null;
}

interface ConfigBackup {
    id: number;
    server_id: number;
    backup_date: string;
    file_count: number;
    total_size: number;
}

interface ServerStatus {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    group_name: string | null;
    online: boolean;
    lastBackup: string | null;
    backupAge: number | null; // in hours
    backupHealth: 'good' | 'warning' | 'critical' | 'none';
    totalBackups: number;
    totalSize: number;
}

async function checkServerOnline(server: ServerItem): Promise<boolean> {
    if (!server.ssh_key) return false;

    return new Promise((resolve) => {
        const conn = new Client();
        const timeout = setTimeout(() => {
            conn.end();
            resolve(false);
        }, 3000);

        conn.on('ready', () => {
            clearTimeout(timeout);
            conn.end();
            resolve(true);
        }).on('error', () => {
            clearTimeout(timeout);
            resolve(false);
        }).connect({
            host: server.ssh_host || new URL(server.url).hostname,
            port: server.ssh_port || 22,
            username: server.ssh_user || 'root',
            password: server.ssh_key,
            readyTimeout: 3000
        });
    });
}

function getBackupHealth(backupDate: string | null): { health: 'good' | 'warning' | 'critical' | 'none'; ageHours: number | null } {
    if (!backupDate) {
        return { health: 'none', ageHours: null };
    }

    const now = new Date();
    const backup = new Date(backupDate);
    const ageHours = Math.floor((now.getTime() - backup.getTime()) / (1000 * 60 * 60));

    if (ageHours <= 24) {
        return { health: 'good', ageHours };
    } else if (ageHours <= 72) {
        return { health: 'warning', ageHours };
    } else {
        return { health: 'critical', ageHours };
    }
}

export async function GET() {
    try {
        const servers = db.prepare('SELECT * FROM servers ORDER BY group_name, name').all() as ServerItem[];
        const allBackups = db.prepare('SELECT * FROM config_backups ORDER BY backup_date DESC').all() as ConfigBackup[];

        // Group backups by server
        const backupsByServer: Record<number, ConfigBackup[]> = {};
        for (const backup of allBackups) {
            if (!backupsByServer[backup.server_id]) {
                backupsByServer[backup.server_id] = [];
            }
            backupsByServer[backup.server_id].push(backup);
        }

        // Check server status in parallel (with limit)
        const serverStatuses: ServerStatus[] = await Promise.all(
            servers.map(async (server) => {
                const online = await checkServerOnline(server);
                const serverBackups = backupsByServer[server.id] || [];
                const lastBackup = serverBackups[0]?.backup_date || null;
                const { health, ageHours } = getBackupHealth(lastBackup);

                return {
                    id: server.id,
                    name: server.name,
                    type: server.type,
                    group_name: server.group_name || null,
                    online,
                    lastBackup,
                    backupAge: ageHours,
                    backupHealth: health,
                    totalBackups: serverBackups.length,
                    totalSize: serverBackups.reduce((sum, b) => sum + b.total_size, 0)
                };
            })
        );

        // Calculate aggregates
        const totalServers = servers.length;
        const onlineServers = serverStatuses.filter(s => s.online).length;
        const totalBackups = allBackups.length;
        const totalSize = allBackups.reduce((sum, b) => sum + b.total_size, 0);

        const healthCounts = {
            good: serverStatuses.filter(s => s.backupHealth === 'good').length,
            warning: serverStatuses.filter(s => s.backupHealth === 'warning').length,
            critical: serverStatuses.filter(s => s.backupHealth === 'critical').length,
            none: serverStatuses.filter(s => s.backupHealth === 'none').length
        };

        // Get groups
        const groups = [...new Set(servers.map(s => s.group_name).filter(Boolean))].sort() as string[];

        return NextResponse.json({
            servers: serverStatuses,
            summary: {
                totalServers,
                onlineServers,
                offlineServers: totalServers - onlineServers,
                totalBackups,
                totalSize,
                healthCounts,
                groups
            }
        });
    } catch (error) {
        console.error('Monitoring error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch monitoring data' },
            { status: 500 }
        );
    }
}
