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

        // 1. Get Node Name (Robustly)
        // cat /etc/hostname is safer than `hostname` as it usually matches the PVE internal node name (no FQDN)
        const nodeName = (await ssh.exec('cat /etc/hostname', 5000)).trim();
        console.log(`[Sync] Connected to ${server.name} (Determined Node Name: "${nodeName}")`);

        // 2. Try Cluster Resources API (Best Source)
        let resources: any[] = [];
        try {
            const json = await ssh.exec('pvesh get /cluster/resources --output-format json 2>/dev/null', 10000);
            resources = JSON.parse(json);
        } catch (e) {
            console.error('[Sync] Failed to fetch /cluster/resources, falling back to local files', e);
        }

        const vms: any[] = [];

        // Filter resources for this node
        const nodeResources = resources.filter(r => r.node === nodeName && (r.type === 'qemu' || r.type === 'lxc'));

        if (nodeResources.length > 0) {
            console.log(`[Sync] Found ${nodeResources.length} VMs on node ${nodeName} via API`);
            nodeResources.forEach(r => {
                vms.push({
                    vmid: r.vmid,
                    name: r.name || (r.type === 'qemu' ? `VM ${r.vmid}` : `CT ${r.vmid}`),
                    status: r.status,
                    type: r.type
                });
            });
        } else {
            // FALLBACK: File System Check
            // If the API thinks this node is empty (or we failed to match names), check config files.
            // This ensures we at least show "Unknown" status VMs if they exist.
            console.log('[Sync] No VMs found via API (or mismatched node name). Checking config files...');

            try {
                // QEMU Configs
                const qmFiles = await ssh.exec('ls /etc/pve/qemu-server/*.conf 2>/dev/null || echo ""', 5000);
                qmFiles.split('\n').forEach(line => {
                    const match = line.match(/\/(\d+)\.conf$/);
                    if (match) {
                        const vmid = parseInt(match[1]);
                        // Check if we already have it (from API)
                        if (!vms.find(v => v.vmid === vmid)) {
                            vms.push({ vmid, name: `VM-${vmid} (Config Found)`, status: 'unknown', type: 'qemu' });
                        }
                    }
                });

                // LXC Configs
                const lxcFiles = await ssh.exec('ls /etc/pve/lxc/*.conf 2>/dev/null || echo ""', 5000);
                lxcFiles.split('\n').forEach(line => {
                    const match = line.match(/\/(\d+)\.conf$/);
                    if (match) {
                        const vmid = parseInt(match[1]);
                        if (!vms.find(v => v.vmid === vmid)) {
                            vms.push({ vmid, name: `CT-${vmid} (Config Found)`, status: 'unknown', type: 'lxc' });
                        }
                    }
                });
            } catch (err) {
                console.error('[Sync] File fallback failed:', err);
            }
        }

        await ssh.disconnect();
        console.log(`[Sync] Total VMs identified: ${vms.length}`);

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
