'use server';

import db from '@/lib/db';
import { createSSHClient } from '@/lib/ssh';
import { getServer, determineNodeName } from './vm';
import { getVMs, getVMConfig } from './vm';
import { analyzeConfigWithAI, analyzeHostWithAI, HealthResult } from './ai';

export interface ScanResult {
    id: number;
    server_id: number;
    vmid: string | null; // NULL for host
    type: 'qemu' | 'lxc' | 'host';
    result: HealthResult;
    created_at: string;
}

export async function getScanResults(serverId: number): Promise<ScanResult[]> {
    const rows = db.prepare('SELECT * FROM scan_results WHERE server_id = ? ORDER BY created_at DESC').all(serverId) as any[];
    return rows.map(row => ({
        ...row,
        result: JSON.parse(row.result_json)
    }));
}

export async function scanAllVMs(serverId: number) {
    try {
        const vms = await getVMs(serverId);

        for (const vm of vms) {
            // Fetch Config
            const config = await getVMConfig(serverId, vm.vmid, vm.type);
            if (!config) continue;

            // Analyze
            const analysis = await analyzeConfigWithAI(config, vm.type);

            // Save
            const stmt = db.prepare(`
                INSERT INTO scan_results (server_id, vmid, type, result_json)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run(serverId, vm.vmid, vm.type, JSON.stringify(analysis));
        }

        return { success: true, count: vms.length };
    } catch (e: any) {
        console.error('VM Scan Error:', e);
        return { success: false, error: e.message };
    }
}

export async function scanHost(serverId: number) {
    const server = await getServer(serverId);
    if (!server) throw new Error('Server not found');

    const ssh = createSSHClient(server);
    try {
        await ssh.connect();

        // Fetch critical files
        const filesToFetch = [
            '/etc/network/interfaces',
            '/etc/pve/storage.cfg',
            '/etc/sysctl.conf',
            '/etc/hosts'
        ];

        const files = [];

        for (const file of filesToFetch) {
            try {
                const content = await ssh.exec(`cat ${file} 2>/dev/null`);
                if (content && content.length > 0) {
                    files.push({ filename: file, content });
                }
            } catch { }
        }

        // Get ZFS status if exists
        try {
            const zpool = await ssh.exec('zpool status 2>/dev/null');
            if (zpool) files.push({ filename: 'zpool status', content: zpool });
        } catch { }

        // Get Storage status
        try {
            const pvesm = await ssh.exec('pvesm status 2>/dev/null');
            if (pvesm) files.push({ filename: 'pvesm status', content: pvesm });
        } catch { }

        // Analyze
        const analysis = await analyzeHostWithAI(files);

        // Save
        const stmt = db.prepare(`
            INSERT INTO scan_results (server_id, vmid, type, result_json)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(serverId, null, 'host', JSON.stringify(analysis));

        return { success: true, result: analysis };

    } catch (e: any) {
        console.error('Host Scan Error:', e);
        return { success: false, error: e.message };
    } finally {
        await ssh.disconnect();
    }
}
