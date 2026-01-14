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

        // 1. Get Qemu VMs
        const qmList = await ssh.exec('/usr/sbin/qm list --full 2>/dev/null || echo ""');
        console.log('[Sync] Raw QM List:', qmList);

        // 2. Get LXC Containers
        const lxcList = await ssh.exec('/usr/sbin/pct list 2>/dev/null || echo ""');
        console.log('[Sync] Raw LXC List:', lxcList);

        await ssh.disconnect();

        // Parse Output
        const vms: any[] = [];

        // Parse Qemu
        qmList.split('\n').slice(1).forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 3) return;
            const vmid = parseInt(parts[0]);
            if (isNaN(vmid)) return;

            // QM List: VMID NAME STATUS ...
            vms.push({
                vmid: vmid,
                name: parts[1],
                status: parts[2],
                type: 'qemu'
            });
        });

        // Parse LXC
        lxcList.split('\n').slice(1).forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) return;
            const vmid = parseInt(parts[0]);
            if (isNaN(vmid)) return;

            // PCT List: VMID Status Lock Name
            // Beware: Lock is optional.
            // If 4 parts: VMID Status Lock Name
            // If 3 parts: VMID Status Name

            let status = parts[1];
            let name = parts.length >= 4 ? parts[3] : parts[2];

            if (!name) name = `CT-${vmid}`;

            vms.push({
                vmid: vmid,
                status: status,
                name: name,
                type: 'lxc'
            });
        });

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
