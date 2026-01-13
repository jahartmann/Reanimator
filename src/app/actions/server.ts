'use server';

import db from '@/lib/db';

export interface Server {
    id: number;
    name: string;
    host: string;
    type: 'pve' | 'pbs';
    url: string;
    ssh_host: string;
    ssh_port: number;
    ssh_user: string;
    ssh_key?: string;
    group_name?: string;
    auth_token?: string; // API Token for migrations (format: user@realm!tokenid=secret)
}

export async function getServers(): Promise<Server[]> {
    const rows = db.prepare('SELECT * FROM servers ORDER BY name').all() as any[];
    return rows.map(row => ({
        id: row.id,
        name: row.name,
        host: row.ssh_host,
        type: row.type,
        url: row.url,
        ssh_host: row.ssh_host,
        ssh_port: row.ssh_port,
        ssh_user: row.ssh_user,
        ssh_key: row.ssh_key,
        group_name: row.group_name,
        auth_token: row.auth_token
    }));
}

export async function getServer(id: number): Promise<Server | null> {
    const row = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        host: row.ssh_host,
        type: row.type,
        url: row.url,
        ssh_host: row.ssh_host,
        ssh_port: row.ssh_port,
        ssh_user: row.ssh_user,
        ssh_key: row.ssh_key,
        group_name: row.group_name,
        auth_token: row.auth_token
    };
}
