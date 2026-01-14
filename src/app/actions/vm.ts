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
    // PROXMIGRATE-STYLE MIGRATION (Robust 4-Step Process)
    // Step 1: Create vzdump backup on source
    // Step 2: Transfer backup via SCP (server-to-server)
    // Step 3: Restore on target with qmrestore
    // Step 4: Cleanup backup files and optionally delete source
    // ============================================================

    log('[Migration] Using ProxMigrate-style migration (vzdump → SCP → qmrestore)');

    // Get Target Host for SCP
    let targetHost = target.ssh_host;
    if (!targetHost && target.url) {
        try { targetHost = new URL(target.url).hostname; } catch { targetHost = target.url; }
    }
    if (!targetHost) throw new Error('Zielserver hat keine Host-IP konfiguriert.');

    // Determine Target VMID
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

    // Pre-flight: Unlock source VM if locked
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

    // Pre-flight: Clean up target if exists
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

    log(`[Migration] Source Node: ${sourceNode}`);
    log(`[Migration] Target Host: ${targetHost}`);
    log(`[Migration] VMID: ${vmid} -> ${targetVmid}`);
    log(`[Migration] Storage: ${options.targetStorage || 'local-lvm'}`);

    const backupDir = '/tmp/proxmigrate';
    let backupFile = '';

    try {
        // ========== STEP 1: Create vzdump backup on source ==========
        log('[Step 1/4] Creating vzdump backup on source...');

        await sourceSsh.exec(`mkdir -p ${backupDir}`);

        // Stop VM if not online migration (for consistent backup)
        const wasRunning = (await sourceSsh.exec(`/usr/sbin/qm status ${vmid}`)).includes('running');
        if (!options.online && wasRunning) {
            log('[Step 1/4] Stopping VM for consistent backup...');
            await sourceSsh.exec(`/usr/sbin/qm stop ${vmid} --timeout 60`);
        }

        const dumpMode = options.online ? 'snapshot' : 'stop';
        const cmdType = type === 'qemu' ? 'qemu' : 'lxc';
        const dumpCmd = `/usr/sbin/vzdump ${vmid} --dumpdir ${backupDir} --compress zstd --mode ${dumpMode}`;

        log(`[Step 1/4] Running: vzdump ${vmid} --mode ${dumpMode} --compress zstd`);

        // Execute vzdump with streaming output
        const dumpStream = await sourceSsh.getExecStream(dumpCmd, { pty: true });

        await new Promise<void>((resolve, reject) => {
            let exitCode: number | null = null;

            dumpStream.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n');
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed && (trimmed.includes('%') || trimmed.includes('INFO') || trimmed.includes('creating'))) {
                        log(`[vzdump] ${trimmed}`);
                    }
                });
            });

            dumpStream.stderr.on('data', (chunk: Buffer) => {
                log(`[vzdump] ${chunk.toString().trim()}`);
            });

            dumpStream.on('exit', (code: number | null) => { exitCode = code; });
            dumpStream.on('close', () => {
                if (exitCode === 0 || exitCode === null) resolve();
                else reject(new Error(`vzdump failed with exit code ${exitCode}`));
            });
            dumpStream.on('error', reject);
        });

        // Find the created backup file
        const filesOutput = await sourceSsh.exec(`ls -1t ${backupDir}/vzdump-${cmdType}-${vmid}-*.vma.zst 2>/dev/null | head -1`);
        backupFile = filesOutput.trim();

        if (!backupFile) {
            throw new Error('Backup file not found after vzdump');
        }

        const fileSize = await sourceSsh.exec(`du -h ${backupFile} | cut -f1`);
        log(`[Step 1/4] ✓ Backup created: ${backupFile} (${fileSize.trim()})`);

        // ========== STEP 2: Transfer backup via SCP ==========
        log('[Step 2/4] Transferring backup to target server via SCP...');

        // Ensure target directory exists
        await targetSsh.exec(`mkdir -p ${backupDir}`);

        // SCP from source to target (server-to-server transfer)
        const scpCmd = `scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${backupFile} root@${targetHost}:${backupDir}/`;
        log(`[Step 2/4] Running: scp to ${targetHost}...`);

        const scpStream = await sourceSsh.getExecStream(scpCmd, { pty: true });

        await new Promise<void>((resolve, reject) => {
            let exitCode: number | null = null;
            let lastProgress = '';

            scpStream.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                // SCP progress looks like: "file   45%   12MB  3.2MB/s   00:02 ETA"
                if (text.includes('%')) {
                    const match = text.match(/(\d+)%/);
                    if (match && match[1] !== lastProgress) {
                        lastProgress = match[1];
                        log(`[scp] Transfer progress: ${match[1]}%`);
                    }
                }
            });

            scpStream.stderr.on('data', (chunk: Buffer) => {
                const text = chunk.toString().trim();
                if (text && !text.includes('Warning')) {
                    log(`[scp] ${text}`);
                }
            });

            scpStream.on('exit', (code: number | null) => { exitCode = code; });
            scpStream.on('close', () => {
                if (exitCode === 0 || exitCode === null) resolve();
                else reject(new Error(`SCP transfer failed with exit code ${exitCode}`));
            });
            scpStream.on('error', reject);
        });

        log('[Step 2/4] ✓ Backup transferred successfully');

        // ========== STEP 3: Restore on target with qmrestore ==========
        log('[Step 3/4] Restoring VM on target server...');

        const filename = backupFile.split('/').pop();
        const targetBackupPath = `${backupDir}/${filename}`;
        const restoreStorage = options.targetStorage || 'local-lvm';

        const restoreCmd = `/usr/sbin/qmrestore ${targetBackupPath} ${targetVmid} --storage ${restoreStorage} --unique`;
        log(`[Step 3/4] Running: qmrestore to VMID ${targetVmid} on storage ${restoreStorage}`);

        const restoreStream = await targetSsh.getExecStream(restoreCmd, { pty: true });

        await new Promise<void>((resolve, reject) => {
            let exitCode: number | null = null;

            restoreStream.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n');
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed) {
                        log(`[qmrestore] ${trimmed}`);
                    }
                });
            });

            restoreStream.stderr.on('data', (chunk: Buffer) => {
                log(`[qmrestore] ${chunk.toString().trim()}`);
            });

            restoreStream.on('exit', (code: number | null) => { exitCode = code; });
            restoreStream.on('close', () => {
                if (exitCode === 0 || exitCode === null) resolve();
                else reject(new Error(`qmrestore failed with exit code ${exitCode}`));
            });
            restoreStream.on('error', reject);
        });

        log(`[Step 3/4] ✓ VM restored as VMID ${targetVmid}`);

        // ========== STEP 4: Cleanup ==========
        log('[Step 4/4] Cleaning up...');

        // Delete backup files
        try {
            await sourceSsh.exec(`rm -f ${backupFile}`);
            log('[Cleanup] Deleted source backup file');
        } catch { }

        try {
            await targetSsh.exec(`rm -f ${targetBackupPath}`);
            log('[Cleanup] Deleted target backup file');
        } catch { }

        // Delete source VM (like PDM's --delete behavior)
        log('[Cleanup] Deleting source VM...');
        try {
            await sourceSsh.exec(`/usr/sbin/qm stop ${vmid} --timeout 30`);
        } catch { }
        try {
            await sourceSsh.exec(`/usr/sbin/qm destroy ${vmid} --purge`);
            log('[Cleanup] ✓ Source VM deleted');
        } catch (e) {
            log(`[Cleanup] Warning: Could not delete source VM: ${e}`);
        }

        log('[Step 4/4] ✓ Cleanup complete');
        log('[Migration] ═══════════════════════════════════════════');
        log(`[Migration] ✓ Migration completed successfully!`);
        log(`[Migration] VM ${vmid} migrated to ${targetHost} as VMID ${targetVmid}`);
        log('[Migration] ═══════════════════════════════════════════');

        return `Cross-cluster migration completed. Target VMID: ${targetVmid}`;

    } catch (error: any) {
        log(`[Migration] ✗ Migration failed: ${error.message}`);

        // Cleanup on failure
        if (backupFile) {
            try { await sourceSsh.exec(`rm -f ${backupFile}`); } catch { }
            try { await targetSsh.exec(`rm -f ${backupDir}/*`); } catch { }
        }

        throw new Error(`Migration fehlgeschlagen:\n\n${error.message}\n\nBitte prüfen Sie:\n- SSH-Zugang zwischen den Servern (für SCP)\n- Genügend Speicherplatz für Backup in /tmp\n- Ziel-Storage ist erreichbar`);
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
