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
            // ========== CROSS-CLUSTER / STANDALONE MIGRATION ==========
            // Use the pre-configured API token from the target server (stored during server setup)
            console.log(`[Migration] Using cross-cluster remote-migrate with stored token`);

            // Validate that target server has an API token configured
            if (!target.auth_token) {
                return {
                    success: false,
                    message: 'Zielserver hat keinen API-Token konfiguriert. Bitte in den Server-Einstellungen einen Token hinterlegen.'
                };
            }

            // Use the stored token directly (format: user@realm!tokenid=secret)
            const apiToken = target.auth_token;

            // Get SSL Fingerprint: Prefer stored fingerprint, fallback to dynamic fetch
            let fingerprint = target.ssl_fingerprint;
            if (!fingerprint) {
                console.log('[Migration] No stored fingerprint found, fetching dynamically...');
                const fpCmd = `openssl x509 -noout -fingerprint -sha256 -in /etc/pve/local/pve-ssl.pem | cut -d= -f2`;
                fingerprint = (await targetSsh.exec(fpCmd)).trim();
            } else {
                console.log('[Migration] Using stored SSL fingerprint.');
            }

            // Determine target VMID based on options
            let targetVmid: string;

            if (options.targetVmid) {
                // User specified a custom VMID
                targetVmid = options.targetVmid;
                console.log(`[Migration] Using user-specified VMID: ${targetVmid}`);
            } else if (options.autoVmid !== false) {
                // Auto-select next available VMID (default behavior for cross-cluster)
                try {
                    const nextIdCmd = `pvesh get /cluster/nextid --output-format json 2>/dev/null`;
                    const nextIdResult = await targetSsh.exec(nextIdCmd, 5000);
                    let candidateId = parseInt(nextIdResult.trim().replace(/"/g, ''), 10);

                    // Safety Check: Ensure no stray volumes exist for this ID (orphaned disks)
                    // The user encountered a crash because 101 had existing "vm-101-disk-*" volumes.
                    let isClean = false;
                    let attempts = 0;

                    while (!isClean && attempts < 20) {
                        try {
                            // Check for LVM or ZFS volumes containing "vm-ID-" or "subvol-ID-"
                            const checkCmd = `lvs -a | grep "vm-${candidateId}-" || zfs list | grep "vm-${candidateId}-" || ls /var/lib/vz/images/${candidateId} 2>/dev/null`;
                            const checkResult = await targetSsh.exec(checkCmd, 5000);

                            if (checkResult && checkResult.trim().length > 0) {
                                console.log(`[Migration] VMID ${candidateId} is dirty (orphan resources found). Skipping...`);
                                candidateId++;
                                attempts++;
                            } else {
                                isClean = true;
                            }
                        } catch (checkErr) {
                            // grep returns exit code 1 if no match -> logic assumes it's clean if error (no grep match)
                            isClean = true;
                        }
                    }

                    targetVmid = candidateId.toString();
                    console.log(`[Migration] Using clean, verified VMID: ${targetVmid}`);
                } catch (e) {
                    // Fallback to simpler logic if complex check fails
                    console.warn('[Migration] Strict VMID check failed, falling back to basic nextid', e);
                    targetVmid = "105"; // Fail-safe default
                }
            } else {
                // Keep original VMID (user unchecked auto-select)
                targetVmid = vmid;
                console.log(`[Migration] Keeping original VMID: ${targetVmid}`);
            }

            console.log(`[Migration] Final Target VMID: ${targetVmid}`); // Explicit log for user visibility

            // Sanitize Token: Remove "PVEAPIToken=" prefix if present to avoid double prefixing
            let cleanToken = apiToken.trim();
            if (cleanToken.startsWith('PVEAPIToken=')) {
                cleanToken = cleanToken.replace('PVEAPIToken=', '');
            }

            // Ensure Host is valid (prefer SSH host, fallback to URL hostname)
            let migrationHost = target.ssh_host;
            if (!migrationHost && target.url) {
                try {
                    migrationHost = new URL(target.url).hostname;
                } catch (e) {
                    migrationHost = target.url;
                }
            }

            // --- TOKEN VERIFICATION (Pre-Flight Check) ---
            console.log('[Migration] Verifying API Token validity via curl from source...');
            try {
                // Check version endpoint on target (lightweight, auth-protected)
                // -k: allow insecure (self-signed)
                // -s: silent
                // -o /dev/null: discard body
                // -w "%{http_code}": print status code
                // Timeout 5s
                const verifyCmd = `curl -k -s -o /dev/null -w "%{http_code}" --max-time 5 -H "Authorization: PVEAPIToken=${cleanToken}" https://${migrationHost}:8006/api2/json/version`;
                const verifyStatus = (await sourceSsh.exec(verifyCmd)).trim();

                console.log(`[Migration] Token verification status: ${verifyStatus}`);

                if (verifyStatus === '401') {
                    throw new Error(`Target rejected API Token (401 Unauthorized). The token is invalid, expired, or has insufficient permissions.\nToken ID: ${cleanToken.split('=')[0]}`);
                }

                if (verifyStatus !== '200') {
                    console.warn(`[Migration] Token verification returned unexpected status ${verifyStatus}, but proceeding...`);
                } else {
                    console.log('[Migration] Token verified successfully.');
                }

            } catch (verifyErr: any) {
                // Determine if we should block
                if (verifyErr.message && verifyErr.message.includes('401')) {
                    throw verifyErr; // Block migration
                }
                console.warn('[Migration] Could not verify token (curl failed or network issue), proceeding with risk...', verifyErr);
            }

            // Construct Endpoint String
            // Note: We use the raw token.
            // Escape single quotes in the endpoint string just in case, though unlikely in token/host.
            // Re-adding PVEAPIToken= prefix as it is standard for the value expected by PVE
            const apiEndpoint = `host=${migrationHost},apitoken=PVEAPIToken=${cleanToken},fingerprint=${fingerprint}`;
            const safeEndpoint = apiEndpoint.replace(/'/g, "'\\''");

            console.log(`[Migration] Constructed Remote Endpoint: host=${migrationHost}, fingerprint=${fingerprint}, token=...`);

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
                        // Prefer local-lvm as target (more reliable for remote-migrate)
                        // Fallback hierarchy: local-lvm > local > first available
                        let defaultStorage = 'local-lvm';
                        if (!targetStorages.includes('local-lvm')) {
                            if (targetStorages.includes('local')) {
                                defaultStorage = 'local';
                            } else if (targetStorages.length > 0) {
                                defaultStorage = targetStorages[0];
                            }
                        }


                        // SIMPLIFICATION: Use single target storage syntax if possible
                        // This matches the manual command that worked: --target-storage local-lvm
                        // instead of --target-storage source=target,source2=target

                        // If we are mapping everything to the same default storage, just use that storage name
                        storageParam = `--target-storage ${defaultStorage}`;
                        console.log(`[Migration] Using global target storage: ${defaultStorage}`);
                    }
                } catch (mapErr) {
                    console.warn('[Migration] Failed to detect storages, using local-lvm fallback', mapErr);
                    storageParam = '--target-storage local-lvm';
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


            // API Endpoint String (already defined above)
            // const apiEndpoint = ...

            let finalBridge: string | undefined = undefined;
            let finalStorage: string | undefined = undefined;

            if (options.targetStorage) {
                finalStorage = options.targetStorage;
            } else if (storageParam.includes('--target-storage')) {
                finalStorage = storageParam.split(' ')[1];
            }

            if (options.targetBridge) {
                finalBridge = options.targetBridge;
            } else if (bridgeParam.includes('--target-bridge')) {
                finalBridge = bridgeParam.split(' ')[1];
            }

            console.log(`[Migration] API Params - Bridge: ${finalBridge}, Storage: ${finalStorage}, VMID: ${targetVmid}`);

            console.log('[Migration] Starting remote-migrate via pvesh (SSH)...');

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
