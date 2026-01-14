'use server';

import db from '@/lib/db';
import { createSSHClient } from '@/lib/ssh';
import { revalidatePath } from 'next/cache';

export async function syncServerVMs(serverId: number) {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    if (!server) throw new Error('Server not found');

    if (!server.ssh_key) throw new Error('No SSH Key configured');

    const ssh = createSSHClient({
        ssh_host: server.ssh_host || new URL(server.url).hostname,
        ssh_port: server.ssh_port || 22,
        ssh_user: server.ssh_user || 'root',
        ssh_key: server.ssh_key,
    });

    try {
        await ssh.connect();

        // 1. Get Node Name (required for pvesh API calls)
        const nodeName = (await ssh.exec('hostname', 5000)).trim();
        console.log(`[Sync] Connected to ${server.name} (Node: ${nodeName})`);

        // 2. Get VMs and CTs via API (JSON) - Much more robust than qm list parsing
        // /nodes/{node}/qemu and /nodes/{node}/lxc

        // QEMU
        const qmJson = await ssh.exec(`pvesh get /nodes/${nodeName}/qemu --output-format json 2>/dev/null`, 10000);
        const lxcJson = await ssh.exec(`pvesh get /nodes/${nodeName}/lxc --output-format json 2>/dev/null`, 10000);

        await ssh.disconnect();

        const vms: any[] = [];

        // Parse Qemu
        try {
            const qmList = JSON.parse(qmJson);
            qmList.forEach((vm: any) => {
                vms.push({
                    vmid: vm.vmid,
                    name: vm.name,
                    status: vm.status,
                    type: 'qemu'
                });
            });
        } catch (e) {
            console.error('[Sync] Failed to parse QEMU JSON', e);
        }

        // Parse LXC
        try {
            const lxcList = JSON.parse(lxcJson);
            lxcList.forEach((ct: any) => {
                vms.push({
                    vmid: ct.vmid,
                    name: ct.name,
                    status: ct.status,
                    type: 'lxc'
                });
            });
        } catch (e) {
            console.error('[Sync] Failed to parse LXC JSON', e);
        }

        console.log(`[Sync] Found ${vms.length} VMs/CTs on ${server.name}`);

        // Update DB
        const insert = db.prepare(`
            INSERT INTO vms (vmid, name, server_id, type, status, tags)
            VALUES (@vmid, @name, @server_id, @type, @status, '[]')
            ON CONFLICT(vmid, server_id) DO UPDATE SET
                name = excluded.name,
                status = excluded.status,
                type = excluded.type
        `);

        // We should also remove VMs that no longer exist on this server?
        // But handling cross-cluster migration where ID moves from A to B:
        // If we sync A, we remove ID. If we sync B, we add ID.
        // If we don't sync A, ID exists on both in DB?
        // Yes. So we should sync.

        // Transaction
        const transaction = db.transaction(() => {
            // Get existing IDs for this server
            const existing = db.prepare('SELECT vmid FROM vms WHERE server_id = ?').all(serverId) as { vmid: number }[];
            const currentVmids = new Set(vms.map(v => v.vmid));

            // Delete removed
            for (const row of existing) {
                if (!currentVmids.has(row.vmid)) {
                    db.prepare('DELETE FROM vms WHERE server_id = ? AND vmid = ?').run(serverId, row.vmid);
                }
            }

            // Insert/Update new
            for (const vm of vms) {
                insert.run({
                    vmid: vm.vmid,
                    name: vm.name,
                    server_id: serverId,
                    type: vm.type,
                    status: vm.status
                });
            }
        });

        transaction();

        revalidatePath(`/servers/${serverId}`);
        revalidatePath('/servers');
        return { success: true, count: vms.length };

    } catch (e: any) {
        if (ssh) ssh.disconnect();
        console.error('Sync failed:', e);
        throw new Error(`Sync failed: ${e.message}`);
    }
}
