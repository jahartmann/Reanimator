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
    onLog?: (msg: string) => void;
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
    const { sourceSsh, type, vmid, targetNode, options, onLog } = ctx;
    const log = (msg: string) => { console.log(msg); if (onLog) onLog(msg); };

    // Check if moving to same node
    if (ctx.sourceNode === ctx.targetNode) {
        throw new Error(`VM befindet sich bereits auf Node ${ctx.targetNode}.`);
    }

    let cmd = '';
    const storageFlag = options.targetStorage ? `--target-storage ${options.targetStorage}` : '';

    const apiPath = type === 'qemu' ? 'qemu' : 'lxc';
    const migrateApiCmd = `pvesh create /nodes/${ctx.sourceNode}/${apiPath}/${vmid}/migrate --target ${targetNode} ${options.online ? '--online 1' : ''} ${options.targetStorage ? '--target-storage ' + options.targetStorage : ''}`;

    log(`[Migration] Executing Intra-Cluster migration: ${migrateApiCmd}`);
    // Execute API call with PTY to properly handle output buffering/tunnel init
    // The PTY is often required for 'pvesh' to correctly handle the websocket tunnel startup without hanging
    const upid = (await sourceSsh.exec(migrateApiCmd, 60000, { pty: true })).trim();
    log(`[Migration] Started UPID: ${upid}`);

    await pollTaskStatus(sourceSsh, ctx.sourceNode, upid);
    return `Intra-cluster migration completed (UPID: ${upid})`;
}

async function migrateRemote(ctx: MigrationContext): Promise<string> {
    const { sourceSsh, targetSsh, source, target, type, vmid, options, onLog, sourceNode } = ctx;
    const log = (msg: string) => { console.log(msg); if (onLog) onLog(msg); };

    // ============================================================
    // PDM-STYLE API-BASED MIGRATION
    // Uses Proxmox REST API (via pvesh) instead of SSH stream commands
    // This is more reliable and matches how PDM handles migrations
    // ============================================================

    log('[Migration] Using API-based migration (PDM-Style)');

    // 1. Validate Source has API Token
    if (!source.auth_token) {
        throw new Error('Quellserver hat keinen API-Token. Bitte in Server-Einstellungen hinzufügen.');
    }

    // 2. Validate Target has API Token
    if (!target.auth_token) {
        throw new Error('Zielserver hat keinen API-Token. Bitte in Server-Einstellungen hinzufügen.');
    }

    // 3. Prepare Target Endpoint String (for remote_migrate API)
    let cleanTargetToken = target.auth_token.trim().replace('PVEAPIToken=', '');

    // Get Target Host
    let targetHost = target.ssh_host;
    if (!targetHost && target.url) {
        try { targetHost = new URL(target.url).hostname; } catch { targetHost = target.url; }
    }
    if (!targetHost) throw new Error('Zielserver hat keine Host-IP konfiguriert.');

    // Get Target Fingerprint (required for secure connection)
    let fingerprint = target.ssl_fingerprint;
    if (!fingerprint) {
        log('[Migration] Fetching target SSL fingerprint...');
        try {
            fingerprint = (await targetSsh.exec(`openssl x509 -noout -fingerprint -sha256 -in /etc/pve/local/pve-ssl.pem | cut -d= -f2`)).trim();
            log(`[Migration] Fingerprint: ${fingerprint}`);
        } catch (e) {
            throw new Error('Konnte SSL-Fingerprint nicht ermitteln. Bitte manuell in Server-Einstellungen eintragen.');
        }
    }

    // 4. Determine Target VMID
    let targetVmid = options.targetVmid;
    if (!targetVmid && options.autoVmid !== false) {
        log('[Migration] Auto-selecting target VMID...');
        try {
            const nextIdRaw = await targetSsh.exec(`pvesh get /cluster/nextid --output-format json 2>/dev/null || echo "100"`);
            targetVmid = nextIdRaw.replace(/"/g, '').trim();
            log(`[Migration] Auto-selected VMID: ${targetVmid}`);
        } catch {
            targetVmid = vmid;
        }
    } else if (!targetVmid) {
        targetVmid = vmid;
    }

    // 5. Pre-flight: Unlock source VM if locked
    try {
        const conf = await sourceSsh.exec(`/usr/sbin/qm config ${vmid}`);
        if (conf.includes('lock:')) {
            log('[Migration] Source VM is locked. Unlocking...');
            await sourceSsh.exec(`/usr/sbin/qm unlock ${vmid}`);
            log('[Migration] Unlocked successfully.');
        }
    } catch (e) {
        log('[Migration] Could not check/unlock source VM, proceeding anyway...');
    }

    // 6. Pre-flight: Clean up target if exists
    try {
        await targetSsh.exec(`/usr/sbin/qm config ${targetVmid}`);
        log(`[Migration] Target VM ${targetVmid} exists. Cleaning up...`);
        try { await targetSsh.exec(`/usr/sbin/qm stop ${targetVmid} --timeout 10`); } catch { }
        try { await targetSsh.exec(`/usr/sbin/qm unlock ${targetVmid}`); } catch { }
        try { await targetSsh.exec(`/usr/sbin/qm destroy ${targetVmid} --purge`); } catch { }
        log('[Migration] Target cleanup complete.');
    } catch {
        // VM doesn't exist - normal case
    }

    // 7. Build the target-endpoint string for API
    const targetEndpoint = `host=${targetHost},apitoken=PVEAPIToken=${cleanTargetToken},fingerprint=${fingerprint}`;

    log('[Migration] Starting API-based remote migration...');
    log(`[Migration] Source Node: ${sourceNode}`);
    log(`[Migration] Target Host: ${targetHost}`);
    log(`[Migration] VMID: ${vmid} -> ${targetVmid}`);
    log(`[Migration] Storage: ${options.targetStorage || 'default'}, Bridge: ${options.targetBridge || 'default'}`);

    // 8. Call the remote_migrate API endpoint via pvesh
    const apiPath = type === 'qemu' ? 'qemu' : 'lxc';

    // Build the API command - this matches what PDM does
    let migrateCmd = `pvesh create /nodes/${sourceNode}/${apiPath}/${vmid}/remote_migrate`;
    migrateCmd += ` --target-vmid ${targetVmid}`;
    migrateCmd += ` --target-endpoint '${targetEndpoint}'`;
    if (options.targetStorage) migrateCmd += ` --target-storage ${options.targetStorage}`;
    if (options.targetBridge) migrateCmd += ` --target-bridge ${options.targetBridge}`;
    if (options.online) migrateCmd += ` --online 1`;

    log(`[Migration] Calling API: /nodes/${sourceNode}/${apiPath}/${vmid}/remote_migrate`);
    log(`[DEBUG] Full command (token hidden):\n${migrateCmd.replace(cleanTargetToken, '***')}`);

    try {
        // Execute the API call - this returns a UPID (task ID)
        const upidRaw = await sourceSsh.exec(migrateCmd, 120000); // 2 min timeout for initial call
        const upid = upidRaw.trim().replace(/"/g, '');

        if (!upid || !upid.startsWith('UPID:')) {
            throw new Error(`Unexpected API response: ${upidRaw}`);
        }

        log(`[Migration] Task started successfully!`);
        log(`[Migration] UPID: ${upid}`);

        // 9. Poll task status and stream logs (like PDM)
        await pollMigrationTaskWithLogs(sourceSsh, sourceNode, upid, log);

        log('[Migration] ✓ Migration completed successfully via API!');
        return `Cross-cluster migration completed successfully (API). Target VMID: ${targetVmid}`;

    } catch (apiError: any) {
        log(`[Migration] API migration failed: ${apiError.message}`);

        // NO FALLBACK - User explicitly wants API-only like PDM
        throw new Error(`API Migration fehlgeschlagen:\n\n${apiError.message}\n\nBitte prüfen Sie:\n- API-Tokens auf beiden Servern sind korrekt\n- SSL-Fingerprint ist aktuell\n- Netzwerk-Konnektivität zwischen den Servern\n- Firewall erlaubt Port 8006`);
    }
}

// --- Helper: Poll Migration Task with Live Logs (PDM-Style) ---

async function pollMigrationTaskWithLogs(
    client: SSHClient,
    node: string,
    upid: string,
    log: (msg: string) => void
): Promise<void> {
    let status = 'running';
    let exitStatus = '';
    let lastLogLine = 0;
    let pollCount = 0;
    const maxPolls = 3600; // Max 2 hours (at 2s intervals)

    log('[Migration] Polling task status and logs...');

    while (status === 'running' && pollCount < maxPolls) {
        await new Promise(r => setTimeout(r, 2000));
        pollCount++;

        try {
            // Get task status via pvesh API
            const encodedUpid = encodeURIComponent(upid);
            const statusCmd = `pvesh get /nodes/${node}/tasks/${encodedUpid}/status --output-format json`;
            const statusJson = await client.exec(statusCmd, 10000);
            const statusData = JSON.parse(statusJson);

            status = statusData.status;
            exitStatus = statusData.exitstatus || '';

            // Get new log lines
            try {
                const logCmd = `pvesh get /nodes/${node}/tasks/${encodedUpid}/log --start ${lastLogLine} --output-format json`;
                const logJson = await client.exec(logCmd, 10000);
                const logData = JSON.parse(logJson);

                if (Array.isArray(logData) && logData.length > 0) {
                    logData.forEach((entry: { n: number; t: string }) => {
                        if (entry.n > lastLogLine) {
                            log(`[Task] ${entry.t}`);
                            lastLogLine = entry.n;
                        }
                    });
                }
            } catch {
                // Log fetch failed - continue polling status
            }

            // Progress indicator every 30 seconds
            if (pollCount % 15 === 0 && status === 'running') {
                log(`[Migration] Still running... (${Math.floor(pollCount * 2 / 60)}m ${(pollCount * 2) % 60}s)`);
            }

        } catch (pollError: any) {
            // Transient error - log but continue
            if (pollCount % 10 === 0) {
                log(`[Migration] Poll warning: ${pollError.message}`);
            }
        }
    }

    // Validate final status
    if (pollCount >= maxPolls) {
        throw new Error('Migration timeout - Task ran longer than 2 hours');
    }

    if (status !== 'stopped') {
        throw new Error(`Unexpected task status: ${status}`);
    }

    if (exitStatus !== 'OK') {
        // Fetch final logs for error context
        let errorDetails = '';
        try {
            const encodedUpid = encodeURIComponent(upid);
            const logCmd = `pvesh get /nodes/${node}/tasks/${encodedUpid}/log --output-format json`;
            const logJson = await client.exec(logCmd);
            const logData = JSON.parse(logJson);
            const lastLogs = logData.slice(-15).map((l: any) => l.t).join('\n');
            errorDetails = `\n\nLetzte Log-Einträge:\n${lastLogs}`;
        } catch { }

        throw new Error(`Migration fehlgeschlagen mit Status: ${exitStatus}${errorDetails}`);
    }

    log('[Migration] Task completed with status: OK');
}


// --- Main Entry Point ---

export async function migrateVM(
    sourceId: number,
    vmid: string,
    type: 'qemu' | 'lxc',
    options: MigrationOptions,
    onLog?: (msg: string) => void
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
            sourceNode, targetNode,
            onLog
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
