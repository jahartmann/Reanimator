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
    tags?: string[];
    // New: Network and Storage info for mapping display
    networks?: string[];   // e.g., ['vmbr0', 'vmbr1']
    storages?: string[];   // e.g., ['local-lvm', 'nas-storage']
}

export interface MigrationOptions {
    targetServerId: number;
    targetStorage: string;
    targetBridge: string;
    online: boolean;
    targetVmid?: string;  // Custom VMID on target (optional)
    autoVmid?: boolean;   // If true, automatically use next available VMID
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

        // Helper to extract networks and storages from VM config
        const extractResources = (config: any) => {
            const networks: string[] = [];
            const storages: string[] = [];

            for (const [key, val] of Object.entries(config)) {
                // Network interfaces: net0, net1, etc.
                if (/^net\d+$/.test(key) && typeof val === 'string') {
                    const bridgeMatch = val.match(/bridge=([^,\s]+)/);
                    if (bridgeMatch) networks.push(bridgeMatch[1]);
                }
                // Storage: scsi0, sata0, virtio0, ide0, rootfs, mp0-mp9
                if (/^(scsi|sata|virtio|ide|efidisk|rootfs|mp)\d*$/.test(key) && typeof val === 'string') {
                    const storageMatch = val.match(/^([^:]+):/);
                    if (storageMatch) storages.push(storageMatch[1]);
                }
            }
            return { networks: [...new Set(networks)], storages: [...new Set(storages)] };
        };

        // Fetch configs for all VMs in parallel (batched)
        const allVmIds = [
            ...qemuList.map((v: any) => ({ vmid: v.vmid, type: 'qemu' })),
            ...lxcList.map((v: any) => ({ vmid: v.vmid, type: 'lxc' }))
        ];

        const configPromises = allVmIds.map(async (vm) => {
            try {
                const cmd = vm.type === 'qemu'
                    ? `pvesh get /nodes/${nodeName}/qemu/${vm.vmid}/config --output-format json 2>/dev/null || echo "{}"`
                    : `pvesh get /nodes/${nodeName}/lxc/${vm.vmid}/config --output-format json 2>/dev/null || echo "{}"`;
                const raw = await ssh.exec(cmd);
                return { vmid: vm.vmid, config: JSON.parse(raw) };
            } catch {
                return { vmid: vm.vmid, config: {} };
            }
        });

        const configs = await Promise.all(configPromises);
        const configMap = new Map(configs.map(c => [c.vmid.toString(), c.config]));

        const vms: VirtualMachine[] = [
            ...qemuList.map((vm: any) => {
                const cfg = configMap.get(vm.vmid.toString()) || {};
                const { networks, storages } = extractResources(cfg);
                return {
                    vmid: vm.vmid,
                    name: vm.name,
                    status: vm.status,
                    type: 'qemu' as const,
                    cpus: vm.cpus,
                    memory: vm.maxmem,
                    uptime: vm.uptime,
                    tags: vm.tags ? vm.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
                    networks,
                    storages
                };
            }),
            ...lxcList.map((lxc: any) => {
                const cfg = configMap.get(lxc.vmid.toString()) || {};
                const { networks, storages } = extractResources(cfg);
                return {
                    vmid: lxc.vmid,
                    name: lxc.name,
                    status: lxc.status,
                    type: 'lxc' as const,
                    cpus: lxc.cpus,
                    memory: lxc.maxmem,
                    uptime: lxc.uptime,
                    tags: lxc.tags ? lxc.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
                    networks,
                    storages
                };
            })
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

    let debugCmd = ''; // Variable to hold the command for debugging

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
        // let debugCmd assigned inside try, moving out

        if (sameCluster) {
            // ========== INTRA-CLUSTER MIGRATION ==========
            // Use standard qm/pct migrate (no need for API tokens)
            console.log(`[Migration] Using intra-cluster migration to ${targetNode}`);

            // Check if source and target are on the same node
            if (sourceNode === targetNode) {
                return {
                    success: false,
                    message: `VM befindet sich bereits auf Node ${targetNode}. Wählen Sie einen anderen Ziel-Server.`
                };
            }

            // Build storage mapping if specified
            const storageFlag = options.targetStorage ? `--target-storage ${options.targetStorage}` : '';

            if (type === 'qemu') {
                cmd = `/usr/sbin/qm migrate ${vmid} ${targetNode} ${storageFlag}`;
                if (options.online) cmd += ` --online`;
            } else {
                cmd = `/usr/sbin/pct migrate ${vmid} ${targetNode} ${storageFlag}`;
                if (options.online) cmd += ` --restart`; // LXC uses --restart for live migration
            }
            debugCmd = cmd;
            // ...
        } else {
            // ... (cross-cluster logic)
            // ...
            // Construct pvesh command
            // CRITICAL: Use single quotes for target-endpoint to prevent shell expansion of '!' in the token
            let migrateCmd = `pvesh create /nodes/${sourceNode}/qemu/${vmid}/remote_migrate --target-vmid ${targetVmid} --target-endpoint '${safeEndpoint}' --online ${options.online ? 1 : 0}`;

            if (finalBridge) migrateCmd += ` --target-bridge ${finalBridge}`;
            if (finalStorage) migrateCmd += ` --target-storage ${finalStorage}`;

            debugCmd = migrateCmd;

            // Execute migration command
            console.log('[Migration] Executing:', migrateCmd.replace(cleanToken, '***'));
            const upid = (await sourceSsh.exec(migrateCmd)).trim();
            // ...
        }

        return { success: true, message: output };

    } catch (e: any) {
        if (debugCmd) {
            console.error('[Migration] Debug Command:', debugCmd);
            e.message = `${e.message || e}\nDEBUG COMMAND: ${debugCmd}`;
        }
        console.error('[Migration] Failed:', e);

        // Auto-Unlock and Retry Logic
        if (String(e).includes('locked') || String(e).includes('lock')) {
            console.log('[Migration] VM is locked. Attempting to unlock and retry...');
            try {
                // Try to unlock via qm/pct unlock
                const unlockCmd = type === 'qemu' ? `qm unlock ${vmid}` : `pct unlock ${vmid}`;
                await sourceSsh.exec(unlockCmd);
                console.log('[Migration] Unlock successful. Retrying migration...');

                // Retry the original command
                // Note: We need to reconstruct the command or just recurse/retry. 
                // Since we can't easily recurse cleanly without infinite loop risk, 
                // we'll just try the command execution again here.
                // Re-using the 'cmd' variable from above scope would be ideal but it's block-scoped in the try block
                // So we will just return a specific error telling the user we unlocked it
                return {
                    success: false,
                    message: `VM was locked. I have unlocked it. Please try again.`
                };

            } catch (unlockErr) {
                console.warn('[Migration] Failed to unlock:', unlockErr);
                return { success: false, message: `VM is locked and could not be unlocked: ${e}` };
            }
        }

        return { success: false, message: String(e) };
    } finally {
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
