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

            // Check if source and target are on the same node
            if (sourceNode === targetNode) {
                return {
                    success: false,
                    message: `VM befindet sich bereits auf Node ${targetNode}. Wählen Sie einen anderen Ziel-Server.`
                };
            }

            // Check if VMID exists on another node in the cluster (shouldn't happen in proper cluster setup)
            // But just in case, verify the VM is actually on sourceNode
            try {
                const checkLoc = await sourceSsh.exec(`pvesh get /cluster/resources --type vm --output-format json 2>/dev/null`);
                const resources = JSON.parse(checkLoc);
                const vmResource = resources.find((r: any) => r.vmid.toString() === vmid.toString());

                if (!vmResource) {
                    return {
                        success: false,
                        message: `VM ${vmid} nicht im Cluster gefunden.`
                    };
                }

                if (vmResource.node !== sourceNode) {
                    return {
                        success: false,
                        message: `VM ${vmid} befindet sich auf Node ${vmResource.node}, nicht auf ${sourceNode}. Migration vom falschen Node angefordert.`
                    };
                }
            } catch (e) {
                console.log('[Migration] Could not verify VM location, proceeding anyway...');
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

            // Check if VMID is free on target cluster, if not, get next available VMID
            let targetVmid = vmid;
            try {
                // Get all VMs in target cluster and check if our VMID is taken
                const checkCmd = `pvesh get /cluster/resources --type vm --output-format json 2>/dev/null || echo "[]"`;
                const checkResult = await targetSsh.exec(checkCmd, 10000);
                const clusterVms = JSON.parse(checkResult);

                // Check if any VM has our VMID
                const vmIdExists = clusterVms.some((vm: any) =>
                    vm.vmid !== undefined && vm.vmid.toString() === vmid.toString()
                );

                if (vmIdExists) {
                    // Get next free VMID from target cluster
                    const nextIdCmd = `pvesh get /cluster/nextid 2>/dev/null || echo "100"`;
                    const nextIdResult = await targetSsh.exec(nextIdCmd, 5000);
                    targetVmid = nextIdResult.trim();
                    console.log(`[Migration] VMID ${vmid} exists on target cluster, using ${targetVmid} instead`);
                }
            } catch (e) {
                console.log('[Migration] Could not check VMID availability:', e);
                // As a fallback, try to get next available ID anyway
                try {
                    const nextIdCmd = `pvesh get /cluster/nextid 2>/dev/null || echo "100"`;
                    const nextIdResult = await targetSsh.exec(nextIdCmd, 5000);
                    targetVmid = nextIdResult.trim();
                    console.log(`[Migration] Using fallback VMID: ${targetVmid}`);
                } catch {
                    console.log('[Migration] Using original VMID as last resort');
                }
            }

            const apiEndpoint = `host=${target.ssh_host},apitoken=${apiToken},fingerprint=${fingerprint}`;

            let cmd = '';

            // Auto-Map Storage/Bridge if not specified (Same-Name Logic)
            let storageParam = '';
            let bridgeParam = '';


            // 3. Fetch Target Resources for Validation/Fallback
            let targetBridges: string[] = [];
            let targetStorages: string[] = [];
            try {
                // Determine target bridges
                const brOut = await targetSsh.exec(`ls /sys/class/net/ | grep "^vmbr" || echo "vmbr0"`);
                targetBridges = brOut.split('\n').map(s => s.trim()).filter(Boolean);

                // Determine target storages
                const stOut = await targetSsh.exec(`pvesh get /storage --output-format json 2>/dev/null || echo "[]"`);
                const stJson = JSON.parse(stOut);
                targetStorages = stJson.map((s: any) => s.storage);
            } catch (e) {
                console.warn('[Migration] Failed to fetch target resources, assuming defaults', e);
                targetBridges = ['vmbr0'];
            }


            if (options.targetStorage) {
                storageParam = `--target-storage ${options.targetStorage}`;
            } else {
                try {
                    const confCmd = type === 'qemu' ? `qm config ${vmid}` : `pct config ${vmid}`;
                    const confOutput = await sourceSsh.exec(confCmd);
                    const lines = confOutput.split('\n');

                    const usedStorages = new Set<string>();
                    for (const line of lines) {
                        if (/^(scsi|ide|sata|virtio|rootfs|mp)\d*:/.test(line)) {
                            const val = line.split(':')[1].trim();
                            if (val.includes(':')) {
                                const store = val.split(':')[0];
                                usedStorages.add(store);
                            }
                        }
                    }

                    if (usedStorages.size > 0) {
                        // Filter mappings: Only map if target has storage with same name
                        const validMappings = Array.from(usedStorages)
                            .filter(s => targetStorages.includes(s))
                            .map(s => `${s}=${s}`);

                        if (validMappings.length > 0) {
                            storageParam = `--target-storage ${validMappings.join(',')}`;
                            console.log(`[Migration] Auto-mapped storages: ${validMappings.join(',')}`);
                        } else {
                            console.warn(`[Migration] Warning: No matching storages found on target for ${Array.from(usedStorages).join(',')}`);
                        }
                    }
                } catch (mapErr) {
                    console.warn('[Migration] Failed to detect storages', mapErr);
                }
            }

            if (options.targetBridge) {
                bridgeParam = `--target-bridge ${options.targetBridge}`;
            } else {
                try {
                    const confCmd = type === 'qemu' ? `qm config ${vmid}` : `pct config ${vmid}`;
                    const confOutput = await sourceSsh.exec(confCmd);
                    const net0 = confOutput.split('\n').find(l => l.startsWith('net0:'));

                    let desiredBridge = 'vmbr0';
                    if (net0) {
                        const match = net0.match(/bridge=([a-zA-Z0-9]+)/);
                        if (match && match[1]) {
                            desiredBridge = match[1];
                        }
                    }

                    // Smart Fallback: Check if desired bridge exists on target
                    if (targetBridges.includes(desiredBridge)) {
                        bridgeParam = `--target-bridge ${desiredBridge}`;
                        console.log(`[Migration] Using matched bridge: ${desiredBridge}`);
                    } else {
                        bridgeParam = `--target-bridge vmbr0`; // Required Fallback
                        console.log(`[Migration] Bridge ${desiredBridge} missing on target. Falling back to vmbr0.`);
                    }
                } catch (e) {
                    bridgeParam = '--target-bridge vmbr0';
                }
            }


            // apiEndpoint already defined above at line 190


            if (type === 'qemu') {
                cmd = `/usr/sbin/qm remote-migrate ${vmid} ${targetVmid} '${apiEndpoint}' ${bridgeParam} ${storageParam}`;
                if (options.online) cmd += ` --online`;
            } else {
                cmd = `/usr/sbin/pct remote-migrate ${vmid} ${targetVmid} '${apiEndpoint}' ${bridgeParam} ${storageParam}`;
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
