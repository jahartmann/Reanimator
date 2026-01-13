'use server';

import { createSSHClient, SSHClient } from '@/lib/ssh';
import db from '@/lib/db';

// --- Interfaces ---

export interface VirtualMachine {
    vmid: string;
    name: string;
    status: 'running' | 'stopped';
    type: 'qemu' | 'lxc';
    cpus?: number;
    memory?: number;
    uptime?: number;
    tags?: string[];
    networks?: string[];
    storages?: string[];
}

export interface MigrationOptions {
    targetServerId: number;
    targetStorage: string;
    targetBridge: string;
    online: boolean;
    targetVmid?: string;
    autoVmid?: boolean;
}

interface MigrationContext {
    sourceId: number;
    vmid: string;
    type: 'qemu' | 'lxc';
    options: MigrationOptions;
    source: any;
    target: any;
    sourceSsh: SSHClient;
    targetSsh: SSHClient;
    sourceNode: string;
    targetNode: string;
}

// --- Helper: Get Server ---

async function getServer(id: number) {
    const stmt = db.prepare('SELECT * FROM servers WHERE id = ?');
    const server = stmt.get(id) as any;
    if (!server) throw new Error(`Server ${id} not found`);
    return server;
}

// --- Helper: Poll Task ---

async function pollTaskStatus(client: SSHClient, node: string, upid: string) {
    let status = 'running';
    let exitStatus = '';

    // Poll every 2s
    while (status === 'running') {
        await new Promise(r => setTimeout(r, 2000));
        const checkCmd = `pvesh get /nodes/${node}/tasks/${upid}/status --output-format json`;
        try {
            const resJson = await client.exec(checkCmd);
            const res = JSON.parse(resJson);
            status = res.status;
            exitStatus = res.exitstatus;

            if (status !== 'running') {
                console.log(`[Migration] Task finished: ${status}, Exit: ${exitStatus}`);
            }
        } catch (e) {
            console.warn('[Migration] Failed to poll status, ignoring transient error...', e);
        }
    }

    if (exitStatus !== 'OK') {
        let errorLog = `Migration failed with exit status: ${exitStatus}`;
        try {
            const logCmd = `pvesh get /nodes/${node}/tasks/${upid}/log --output-format json`;
            const logsJson = await client.exec(logCmd);
            const logs = JSON.parse(logsJson);
            errorLog += '\nRecent Logs:\n' + logs.slice(-15).map((l: any) => l.t).join('\n');
        } catch (e) {
            errorLog += ' (Could not fetch detailed logs)';
        }
        throw new Error(errorLog);
    }
}

// --- Strategies ---

async function migrateLocal(ctx: MigrationContext): Promise<string> {
    const { sourceSsh, type, vmid, targetNode, options } = ctx;

    // Check if moving to same node
    if (ctx.sourceNode === ctx.targetNode) {
        throw new Error(`VM befindet sich bereits auf Node ${ctx.targetNode}.`);
    }

    let cmd = '';
    const storageFlag = options.targetStorage ? `--target-storage ${options.targetStorage}` : '';

    const apiPath = type === 'qemu' ? 'qemu' : 'lxc';
    const migrateApiCmd = `pvesh create /nodes/${ctx.sourceNode}/${apiPath}/${vmid}/migrate --target ${targetNode} ${options.online ? '--online 1' : ''} ${options.targetStorage ? '--target-storage ' + options.targetStorage : ''}`;

    console.log('[Migration] Executing Intra-Cluster migration:', migrateApiCmd);
    const upid = (await sourceSsh.exec(migrateApiCmd)).trim();
    console.log(`[Migration] Started UPID: ${upid}`);

    await pollTaskStatus(sourceSsh, ctx.sourceNode, upid);
    return `Intra-cluster migration completed (UPID: ${upid})`;
}

async function migrateRemote(ctx: MigrationContext): Promise<string> {
    const { sourceSsh, targetSsh, target, type, vmid, options } = ctx;

    // 1. Validate Token
    if (!target.auth_token) throw new Error('Zielserver hat keinen API-Token.');

    // 2. Prepare Endpoint
    let cleanToken = target.auth_token.trim().replace('PVEAPIToken=', '');

    // Fetch Fingerprint
    let fingerprint = target.ssl_fingerprint;
    if (!fingerprint) {
        fingerprint = (await targetSsh.exec(`openssl x509 -noout -fingerprint -sha256 -in /etc/pve/local/pve-ssl.pem | cut -d= -f2`)).trim();
    }

    let migrationHost = target.ssh_host;
    if (!migrationHost && target.url) {
        try { migrationHost = new URL(target.url).hostname; } catch { migrationHost = target.url; }
    }

    // 3. Determine Target VMID (and check cleanliness)
    let targetVmid = options.targetVmid;

    if (!targetVmid && options.autoVmid !== false) {
        // Auto-select
        const nextIdRaw = await targetSsh.exec(`pvesh get /cluster/nextid --output-format json 2>/dev/null || echo "100"`);
        let candidateId = parseInt(nextIdRaw.replace(/"/g, '').trim(), 10);

        // Loop to find clean ID
        let isClean = false;
        let attempts = 0;

        while (!isClean && attempts < 20) {
            // Check if ID is taken in cluster
            const clusterResources = await targetSsh.exec(`pvesh get /cluster/resources --type vm --output-format json`);
            const resources = JSON.parse(clusterResources);
            const taken = resources.some((r: any) => r.vmid === candidateId);

            if (taken) {
                candidateId++;
                attempts++;
                continue;
            }

            // Check for stray volumes using a safe, non-throwing command sequence
            // We use semicolons to run all checks, and 'true' to ensure exit code 0
            // Stderr is redirected to null to avoid 'no datasets available' or 'command not found' errors
            const volCmd = `
                (lvs -a 2>/dev/null | grep "vm-${candidateId}-");
                (zfs list 2>/dev/null | grep "vm-${candidateId}-");
                (ls /var/lib/vz/images/${candidateId} 2>/dev/null);
                true
            `.replace(/\n/g, ' ');

            const volCheck = await targetSsh.exec(volCmd);
            if (volCheck.trim().length > 0) {
                console.log(`[Migration] ID ${candidateId} has stray volumes. Skipping.`);
                candidateId++;
                attempts++;
            } else {
                isClean = true;
            }
        }
        targetVmid = candidateId.toString();
    } else if (!targetVmid) {
        targetVmid = vmid; // Keep original
    }

    console.log(`[Migration] Target VMID selected: ${targetVmid}`);

    // 4. Pre-Flight Token Check
    const verifyCmd = `curl -k -s -o /dev/null -w "%{http_code}" --max-time 5 -H "Authorization: PVEAPIToken=${cleanToken}" https://${migrationHost}:8006/api2/json/version`;
    const verifyStatus = (await sourceSsh.exec(verifyCmd)).trim();
    if (verifyStatus === '401') throw new Error(`Target rejected API Token (401). Check credentials.`);

    // 5. Streaming Backup & Restore Strategy
    // This bypasses the unreliable 'qm remote-migrate' tunnel by streaming data directly via SSH
    console.log('[Migration] Starting robust Streaming Backup/Restore migration...');

    // 0. Unlock Source VM if needed
    // The user reported "broken pipe" can happen if the VM is locked (backup/migrate/snapshot lock)
    try {
        const conf = await sourceSsh.exec(`qm config ${vmid}`);
        if (conf.includes('lock:')) {
            console.log('[Migration] Source VM is locked. Attempting to unlock...');
            await sourceSsh.exec(`qm unlock ${vmid}`);
            console.log('[Migration] Unlocked successfully.');
        }
    } catch (e) {
        console.warn('[Migration] Failed to check/unlock source VM, proceeding anyway...', e);
    }

    const restoreStorage = options.targetStorage || 'local-lvm';
    // Ensure storage is valid? qmrestore checks it.

    // Commands
    // qmrestore reads from stdin (-)
    // --force allows overwriting if we cleaned up (which we did) or if it exists
    const restoreCmd = `qmrestore - ${targetVmid} --storage ${restoreStorage} --force --unique`;

    // vzdump writes to stdout
    // --mode: snapshot (minimal downtime) vs stop (consistent)
    const dumpMode = options.online ? 'snapshot' : 'stop';
    const dumpCmd = `/usr/sbin/vzdump ${vmid} --stdout --compress zstd --mode ${dumpMode}`;

    // 0b. Clean up Target clean slate
    // If the target VMID exists (e.g. from a failed previous attempt), it might be locked or partially created.
    // 'qmrestore --force' usually handles overwrite, but 'qm destroy' is cleaner and ensures no lock conflicts.
    try {
        await targetSsh.exec(`qm config ${targetVmid}`);
        // If we get here, VM exists.
        console.log(`[Migration] Target VM ${targetVmid} exists. Cleaning up (Unlock & Destroy)...`);
        try { await targetSsh.exec(`qm stop ${targetVmid} --timeout 10`); } catch { }
        try { await targetSsh.exec(`qm unlock ${targetVmid}`); } catch { }
        try { await targetSsh.exec(`qm destroy ${targetVmid} --purge`); } catch { }
        console.log('[Migration] Target cleanup complete.');
    } catch (e) {
        // VM does not exist (normal case), proceed.
    }

    console.log(`[Migration] Pipeline: ${dumpCmd} | SSH | ${restoreCmd}`);

    try {
        const targetStream = await targetSsh.getExecStream(restoreCmd);
        const sourceStream = await sourceSsh.getExecStream(dumpCmd);

        // Pipe Source STDOUT -> Target STDIN
        sourceStream.pipe(targetStream);

        // Monitor logs
        sourceStream.stderr.on('data', (data) => {
            const log = data.toString().trim();
            if (log) console.log(`[Source] ${log}`);
        });

        targetStream.stderr.on('data', (data) => {
            const log = data.toString().trim();
            if (log) console.log(`[Target] ${log}`);
        });

        // Wait for Target to finish (Consumer)
        await new Promise<void>((resolve, reject) => {
            targetStream.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Restore process exited with code ${code}`));
                }
            });

            targetStream.on('error', (err) => reject(new Error(`Target Stream Error: ${err.message}`)));
            sourceStream.on('error', (err) => reject(new Error(`Source Stream Error: ${err.message}`)));
        });

        // Post-Migration: Stop Source VM if "online" migration intended to move it?
        // Traditional migration moves the VM. Backup/Restore CLONES it.
        // User expects migration (move).
        // If success, we should stop source VM and maybe lock it / rename it?
        // Safety: Just stop it.
        if (options.online) {
            console.log('[Migration] Success. Stopping source VM...');
            try {
                await sourceSsh.exec(`qm stop ${vmid} --timeout 30`);
            } catch (e) {
                console.warn('[Migration] Could not stop source VM:', e);
            }
        }

        return `Migration (Streaming) completed successfully. Target VMID: ${targetVmid}`;

    } catch (streamErr: any) {
        throw new Error(`Streaming Migration Failed: ${streamErr.message}`);
    }
}


// --- Main Entry Point ---

export async function migrateVM(
    sourceId: number,
    vmid: string,
    type: 'qemu' | 'lxc',
    options: MigrationOptions
) {
    const source = await getServer(sourceId);
    const target = await getServer(options.targetServerId);

    const sourceSsh = createSSHClient(source);
    const targetSsh = createSSHClient(target);

    try {
        await Promise.all([sourceSsh.connect(), targetSsh.connect()]);

        const sourceNode = (await sourceSsh.exec('hostname')).trim();
        const targetNode = (await targetSsh.exec('hostname')).trim();

        // Detect Cluster
        let sameCluster = false;
        try {
            const sCluster = await sourceSsh.exec('pvecm status 2>/dev/null | grep "Cluster name:" | awk \'{print $3}\'');
            const tCluster = await targetSsh.exec('pvecm status 2>/dev/null | grep "Cluster name:" | awk \'{print $3}\'');
            if (sCluster.trim() && sCluster.trim() === tCluster.trim()) sameCluster = true;
        } catch { }

        const ctx: MigrationContext = {
            sourceId, vmid, type, options,
            source, target,
            sourceSsh, targetSsh,
            sourceNode, targetNode
        };

        if (sameCluster) {
            return { success: true, message: await migrateLocal(ctx) };
        } else {
            return { success: true, message: await migrateRemote(ctx) };
        }

    } catch (e: any) {
        console.error('[Migration] Failed:', e);
        // Clean error message
        const msg = e.message || String(e);
        return { success: false, message: msg };
    } finally {
        await sourceSsh.disconnect();
        await targetSsh.disconnect();
    }
}

// --- Public Info Fetchers ---

export async function getVMs(serverId: number): Promise<VirtualMachine[]> {
    const server = await getServer(serverId);
    const ssh = createSSHClient(server);

    try {
        await ssh.connect();
        const nodeName = (await ssh.exec('hostname')).trim();

        const [qemuJson, lxcJson] = await Promise.all([
            ssh.exec(`pvesh get /nodes/${nodeName}/qemu --output-format json 2>/dev/null || echo "[]"`),
            ssh.exec(`pvesh get /nodes/${nodeName}/lxc --output-format json 2>/dev/null || echo "[]"`)
        ]);

        const qemuList = JSON.parse(qemuJson);
        const lxcList = JSON.parse(lxcJson);

        const mapVM = (vm: any, type: 'qemu' | 'lxc') => ({
            vmid: vm.vmid.toString(),
            name: vm.name,
            status: vm.status,
            type,
            cpus: vm.cpus,
            memory: vm.maxmem,
            uptime: vm.uptime,
            tags: vm.tags ? vm.tags.split(',') : [],
            networks: [],
            storages: []
        });

        return [
            ...qemuList.map((x: any) => mapVM(x, 'qemu')),
            ...lxcList.map((x: any) => mapVM(x, 'lxc'))
        ].sort((a, b) => parseInt(a.vmid) - parseInt(b.vmid));

    } catch (e) {
        console.error(e);
        return [];
    } finally {
        await ssh.disconnect();
    }
}

export async function getTargetResources(serverId: number) {
    const server = await getServer(serverId);
    const ssh = createSSHClient(server);
    try {
        await ssh.connect();
        // Fetch Storages
        const st = await ssh.exec(`pvesm status -content images -enabled 1 2>/dev/null | awk 'NR>1 {print $1}'`);
        // Fetch Bridges
        const br = await ssh.exec(`ls /sys/class/net/ | grep "^vmbr" || echo "vmbr0"`);

        return {
            storages: st.split('\n').filter(Boolean),
            bridges: br.split('\n').filter(Boolean)
        };
    } catch {
        return { storages: [], bridges: [] };
    } finally {
        await ssh.disconnect();
    }
}
