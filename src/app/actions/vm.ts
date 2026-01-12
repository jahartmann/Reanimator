'use server';

import { createSSHClient } from '@/lib/ssh';
import db from '@/lib/db';

export interface VirtualMachine {
    vmid: string;
    name: string;
    status: 'running' | 'stopped';
    type: 'qemu' | 'lxc';
    cpus?: number;
    memory?: number;
    uptime?: number;
}

export interface MigrationOptions {
    targetServerId: number;
    targetStorage: string;
    targetBridge: string;
    online: boolean;
}

// Helper to get server details
async function getServer(id: number) {
    const stmt = db.prepare('SELECT * FROM servers WHERE id = ?');
    const server = stmt.get(id) as any;
    if (!server) throw new Error(`Server ${id} not found`);
    return server;
}

export async function getVMs(serverId: number): Promise<VirtualMachine[]> {
    const server = await getServer(serverId);
    const ssh = createSSHClient({
        ssh_host: server.ssh_host,
        ssh_port: server.ssh_port,
        ssh_user: server.ssh_user,
        ssh_key: server.ssh_key
    });

    try {
        await ssh.connect();

        // Determine local node name
        const nodeName = (await ssh.exec('hostname')).trim();

        // Fetch QEMU (VMs) and LXC (Containers) in parallel
        // using pvesh for structured JSON output
        const [qemuJson, lxcJson] = await Promise.all([
            ssh.exec(`pvesh get /nodes/${nodeName}/qemu --output-format json 2>/dev/null || echo "[]"`),
            ssh.exec(`pvesh get /nodes/${nodeName}/lxc --output-format json 2>/dev/null || echo "[]"`)
        ]);

        const qemuList = JSON.parse(qemuJson);
        const lxcList = JSON.parse(lxcJson);

        const vms: VirtualMachine[] = [
            ...qemuList.map((vm: any) => ({
                vmid: vm.vmid,
                name: vm.name,
                status: vm.status,
                type: 'qemu',
                cpus: vm.cpus,
                memory: vm.maxmem, // maxmem is usually what we see as "Memory"
                uptime: vm.uptime
            })),
            ...lxcList.map((lxc: any) => ({
                vmid: lxc.vmid,
                name: lxc.name,
                status: lxc.status,
                type: 'lxc',
                cpus: lxc.cpus,
                memory: lxc.maxmem,
                uptime: lxc.uptime
            }))
        ];

        // Sort by VMID
        return vms.sort((a, b) => parseInt(a.vmid) - parseInt(b.vmid));

    } catch (error) {
        console.error('Failed to fetch VMs:', error);
        return [];
    } finally {
        await ssh.disconnect();
    }
}

export async function migrateVM(
    sourceId: number,
    vmid: string,
    type: 'qemu' | 'lxc',
    options: MigrationOptions
) {
    const source = await getServer(sourceId);
    const target = await getServer(options.targetServerId);

    const sourceSsh = createSSHClient({
        ssh_host: source.ssh_host,
        ssh_port: source.ssh_port,
        ssh_user: source.ssh_user,
        ssh_key: source.ssh_key
    });
    const targetSsh = createSSHClient({
        ssh_host: target.ssh_host,
        ssh_port: target.ssh_port,
        ssh_user: target.ssh_user,
        ssh_key: target.ssh_key
    });

    let tempTokenId = `mig${Date.now()}`;
    let tempTokenSecret = '';

    try {
        // 1. Connect to both servers
        await Promise.all([sourceSsh.connect(), targetSsh.connect()]);

        const sourceNode = (await sourceSsh.exec('hostname')).trim();
        const targetNode = (await targetSsh.exec('hostname')).trim();

        // 2. Detect if both are in the same cluster
        // pvecm status returns cluster info; if not in cluster, it fails or returns "not in a cluster"
        let sameCluster = false;
        try {
            const sourceCluster = await sourceSsh.exec('pvecm status 2>/dev/null | grep "Cluster name:" | awk \'{print $3}\'', 5000);
            const targetCluster = await targetSsh.exec('pvecm status 2>/dev/null | grep "Cluster name:" | awk \'{print $3}\'', 5000);

            if (sourceCluster.trim() && targetCluster.trim() && sourceCluster.trim() === targetCluster.trim()) {
                sameCluster = true;
                console.log(`[Migration] Same cluster detected: ${sourceCluster.trim()}`);
            }
        } catch (e) {
            // Not in a cluster or pvecm not available
            console.log('[Migration] Cluster detection failed, assuming cross-cluster migration');
        }

        let cmd = '';
        let output = '';

        if (sameCluster) {
            // ========== INTRA-CLUSTER MIGRATION ==========
            // Use standard qm/pct migrate (no need for API tokens)
            console.log(`[Migration] Using intra-cluster migration to ${targetNode}`);

            if (type === 'qemu') {
                cmd = `/usr/sbin/qm migrate ${vmid} ${targetNode} --target-storage ${options.targetStorage}`;
                if (options.online) cmd += ` --online`;
            } else {
                cmd = `/usr/sbin/pct migrate ${vmid} ${targetNode} --target-storage ${options.targetStorage}`;
                if (options.online) cmd += ` --restart`; // LXC uses --restart for live migration
            }

            console.log('[Migration] Running:', cmd);
            output = await sourceSsh.exec(cmd, 600 * 1000);

        } else {
            // ========== CROSS-CLUSTER / STANDALONE MIGRATION ==========
            // Use qm remote-migrate with API token
            console.log(`[Migration] Using cross-cluster remote-migrate`);

            // Generate temporary API Token on Target
            const tokenCmd = `pveum user token add root@pam ${tempTokenId} --privsep 0 --output-format json`;
            const tokenJson = await targetSsh.exec(tokenCmd);
            const tokenData = JSON.parse(tokenJson);
            tempTokenSecret = tokenData.value;

            const apiToken = `root@pam!${tempTokenId}=${tempTokenSecret}`;

            // Get SSL Fingerprint
            const fpCmd = `openssl x509 -noout -fingerprint -sha256 -in /etc/pve/local/pve-ssl.pem | cut -d= -f2`;
            const fingerprint = (await targetSsh.exec(fpCmd)).trim();

            // Check if VMID is free on target, if not, get next available VMID
            let targetVmid = vmid;
            try {
                const checkCmd = `pvesh get /cluster/resources --type vm 2>/dev/null | grep -q '"vmid":${vmid}' && echo "exists" || echo "free"`;
                const checkResult = (await targetSsh.exec(checkCmd, 5000)).trim();
                if (checkResult === 'exists') {
                    // Get next free VMID
                    const nextIdCmd = `pvesh get /cluster/nextid`;
                    targetVmid = (await targetSsh.exec(nextIdCmd, 5000)).trim();
                    console.log(`[Migration] VMID ${vmid} exists on target, using ${targetVmid} instead`);
                }
            } catch (e) {
                console.log('[Migration] Could not check VMID availability, using same VMID');
            }

            const apiEndpoint = `host=${target.ssh_host},apitoken=${apiToken},fingerprint=${fingerprint}`;

            if (type === 'qemu') {
                cmd = `/usr/sbin/qm remote-migrate ${vmid} ${targetVmid} '${apiEndpoint}' --target-bridge ${options.targetBridge} --target-storage ${options.targetStorage}`;
                if (options.online) cmd += ` --online`;
            } else {
                cmd = `/usr/sbin/pct remote-migrate ${vmid} ${targetVmid} '${apiEndpoint}' --target-bridge ${options.targetBridge} --target-storage ${options.targetStorage}`;
            }

            console.log('[Migration] Running:', cmd);
            output = await sourceSsh.exec(cmd, 600 * 1000);
        }

        return { success: true, message: output };

    } catch (e) {
        console.error('[Migration] Failed:', e);
        return { success: false, message: String(e) };
    } finally {
        // Cleanup Token on Target (only for cross-cluster)
        try {
            if (tempTokenSecret) {
                await targetSsh.exec(`pveum user token delete root@pam ${tempTokenId}`);
            }
        } catch (cleanupErr) {
            console.error('Failed to cleanup temp token:', cleanupErr);
        }

        await sourceSsh.disconnect();
        await targetSsh.disconnect();
    }
}

export async function getTargetResources(serverId: number) {
    const server = await getServer(serverId);
    const ssh = createSSHClient({
        ssh_host: server.ssh_host,
        ssh_port: server.ssh_port,
        ssh_user: server.ssh_user,
        ssh_key: server.ssh_key
    });

    try {
        await ssh.connect();
        const nodeName = (await ssh.exec('hostname')).trim();

        // 1. Fetch Storages (pvesm status)
        const storageCmd = `pvesm status -content images -enabled 1 2>/dev/null | awk 'NR>1 {print $1}'`;
        const storageOutput = await ssh.exec(storageCmd);
        const storages = storageOutput.split('\n').map(s => s.trim()).filter(s => s.length > 0);

        // 2. Fetch Bridges
        const bridgeCmd = `ls /sys/class/net/ | grep "^vmbr" || echo "vmbr0"`;
        const bridgeOutput = await ssh.exec(bridgeCmd);
        const bridges = bridgeOutput.split('\n').map(s => s.trim()).filter(s => s.length > 0);

        return { storages, bridges };
    } catch (error) {
        console.error('Failed to fetch target resources:', error);
        return { storages: ['local', 'local-lvm'], bridges: ['vmbr0'] }; // Fallback
    } finally {
        await ssh.disconnect();
    }
}
