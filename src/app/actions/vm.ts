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

// --- Pre-Flight Checks (Reanimator Script) ---

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getVMDiskSize(ssh: SSHClient, vmid: string): Promise<number> {
    // Get total disk size in bytes
    try {
        const config = await ssh.exec(`/usr/sbin/qm config ${vmid}`);
        let totalBytes = 0;
        const diskMatches = config.match(/size=(\d+)([KMGT])?/gi) || [];

        for (const match of diskMatches) {
            const sizeMatch = match.match(/size=(\d+)([KMGT])?/i);
            if (sizeMatch) {
                let size = parseInt(sizeMatch[1]);
                const unit = (sizeMatch[2] || '').toUpperCase();
                if (unit === 'K') size *= 1024;
                else if (unit === 'M') size *= 1024 * 1024;
                else if (unit === 'G') size *= 1024 * 1024 * 1024;
                else if (unit === 'T') size *= 1024 * 1024 * 1024 * 1024;
                totalBytes += size;
            }
        }
        return totalBytes || 10 * 1024 * 1024 * 1024; // Default 10GB if can't parse
    } catch {
        return 10 * 1024 * 1024 * 1024; // Default 10GB
    }
}

async function prepareVMForMigration(
    ssh: SSHClient,
    vmid: string,
    type: 'qemu' | 'lxc',
    log: (msg: string) => void
): Promise<string> {
    const cmd = type === 'qemu' ? 'qm' : 'pct';
    log('[VM Prep] Checking VM state...');

    // Get current status
    let status = '';
    try {
        status = await ssh.exec(`/usr/sbin/${cmd} status ${vmid}`);
        log(`[VM Prep] Current status: ${status.trim()}`);
    } catch (e) {
        throw new Error(`VM ${vmid} nicht gefunden oder nicht erreichbar`);
    }

    // Handle paused/prelaunch state
    if (status.includes('paused') || status.includes('prelaunch')) {
        log(`[VM Prep] ⚠ VM is ${status.trim()}. Attempting to resolve...`);
        try {
            // Retrieve config see if it is valid
            await ssh.exec(`/usr/sbin/${cmd} config ${vmid}`);

            // Try resume then stop to ensure clean state
            try { await ssh.exec(`/usr/sbin/${cmd} resume ${vmid}`); } catch { }
            await sleep(2000);
            await ssh.exec(`/usr/sbin/${cmd} stop ${vmid} --timeout 30`);

            status = await ssh.exec(`/usr/sbin/${cmd} status ${vmid}`);
            log(`[VM Prep] ✓ Resolved state. New status: ${status.trim()}`);
        } catch (e) {
            log(`[VM Prep] ⚠ Warning: Could not fully resolve VM state: ${e}`);
        }
    }

    // Handle locked state
    try {
        const config = await ssh.exec(`/usr/sbin/${cmd} config ${vmid}`);
        if (config.includes('lock:')) {
            log('[VM Prep] ⚠ VM is locked. Unlocking...');
            await ssh.exec(`/usr/sbin/${cmd} unlock ${vmid}`);
            log('[VM Prep] ✓ Unlocked');
        }
    } catch {
        log('[VM Prep] Could not check lock status');
    }

    // Return final status
    const finalStatus = await ssh.exec(`/usr/sbin/${cmd} status ${vmid}`);
    return finalStatus.trim();
}

async function testServerToServerSSH(
    sourceSsh: SSHClient,
    targetHost: string,
    log: (msg: string) => void
): Promise<void> {
    log(`[Check] SSH Source → Target (${targetHost})...`);
    try {
        const result = await sourceSsh.exec(
            `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 root@${targetHost} "echo OK"`,
            15000
        );
        if (result.includes('OK')) {
            log('[Check] ✓ Server-to-server SSH working');
        } else {
            throw new Error('Unexpected response');
        }
    } catch (e: any) {
        throw new Error(
            `Server-to-Server SSH fehlgeschlagen!\n\n` +
            `Der Quellserver muss per SSH auf den Zielserver zugreifen können.\n` +
            `Bitte auf dem QUELLSERVER ausführen:\n\n` +
            `  ssh-copy-id root@${targetHost}\n\n` +
            `Fehler: ${e.message}`
        );
    }
}

async function runPreFlightChecks(
    ctx: MigrationContext,
    targetHost: string,
    log: (msg: string) => void
): Promise<void> {
    const { sourceSsh, targetSsh, vmid, type, options } = ctx;

    log('[Pre-Flight] ════════════════════════════════════════');
    log('[Pre-Flight] Starting connectivity and readiness checks...');

    // 1. SSH Connectivity - Source
    log('[Check 1/6] SSH to Source server...');
    try {
        await sourceSsh.exec('echo "OK"');
        log('[Check 1/6] ✓ Source SSH OK');
    } catch (e) {
        throw new Error('SSH-Verbindung zum Quellserver fehlgeschlagen');
    }

    // 2. SSH Connectivity - Target
    log('[Check 2/6] SSH to Target server...');
    try {
        await targetSsh.exec('echo "OK"');
        log('[Check 2/6] ✓ Target SSH OK');
    } catch (e) {
        throw new Error('SSH-Verbindung zum Zielserver fehlgeschlagen');
    }

    // 3. VM State Recovery
    log('[Check 3/6] Preparing VM for migration...');
    const vmStatus = await prepareVMForMigration(sourceSsh, vmid, type, log);
    log(`[Check 3/6] ✓ VM ready (${vmStatus})`);

    // 4. Storage space check
    log('[Check 4/6] Checking storage space...');
    const backupDir = '/var/lib/vz/dump';
    try {
        const spaceOutput = await sourceSsh.exec(`df -B1 ${backupDir} 2>/dev/null | tail -1 | awk '{print $4}'`);
        const availableBytes = parseInt(spaceOutput.trim()) || 0;
        const vmSize = await getVMDiskSize(sourceSsh, vmid);
        const requiredBytes = Math.ceil(vmSize * 1.2); // 20% buffer

        const availableGB = Math.round(availableBytes / 1e9);
        const requiredGB = Math.round(requiredBytes / 1e9);

        if (availableBytes < requiredBytes) {
            throw new Error(`Nicht genug Speicher in ${backupDir}!\nVerfügbar: ${availableGB}GB, Benötigt: ~${requiredGB}GB`);
        }
        log(`[Check 4/6] ✓ Storage OK (${availableGB}GB available, ~${requiredGB}GB needed)`);
    } catch (e: any) {
        if (e.message.includes('Nicht genug')) throw e;
        log(`[Check 4/6] ⚠ Could not verify storage space: ${e.message}`);
    }

    // 5. Target storage exists
    log('[Check 5/6] Verifying target storage...');
    const targetStorage = options.targetStorage || 'local-lvm';
    try {
        let storages: any[] = [];
        try {
            const storageList = await targetSsh.exec('pvesm status --output-format json');
            storages = JSON.parse(storageList);
        } catch {
            // Fallback: Parse Plain Text for older PVE versions or if JSON fails
            const raw = await targetSsh.exec('pvesm status');
            storages = raw.split('\n')
                .slice(1) // Skip header
                .map(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length < 3) return null;
                    return { storage: parts[0], type: parts[1], status: parts[2] };
                })
                .filter(s => s !== null);
        }
        const found = storages.find((s: any) => s.storage === targetStorage);
        if (!found) {
            const available = storages.map((s: any) => s.storage).join(', ');
            throw new Error(`Storage "${targetStorage}" nicht gefunden auf Zielserver!\nVerfügbar: ${available}`);
        }
        log(`[Check 5/6] ✓ Target storage "${targetStorage}" exists`);
    } catch (e: any) {
        if (e.message.includes('nicht gefunden')) throw e;
        log(`[Check 5/6] ⚠ Could not verify target storage: ${e.message}`);
    }

    // 6. Server-to-Server SSH (for SCP)
    log('[Check 6/6] Testing server-to-server SSH for SCP...');
    await testServerToServerSSH(sourceSsh, targetHost, log);

    log('[Pre-Flight] ════════════════════════════════════════');
    log('[Pre-Flight] ✓ All checks passed! Starting migration...');
    log('');
}


async function migrateRemote(ctx: MigrationContext): Promise<string> {
    const { sourceSsh, targetSsh, source, target, type, vmid, options, onLog, sourceNode } = ctx;
    const log = (msg: string) => { console.log(msg); if (onLog) onLog(msg); };

    // ============================================================
    // REANIMATOR SCRIPT MIGRATION (Robust 5-Step Process)
    // Pre-Flight: Connectivity & VM state checks
    // Step 1: Stop VM and create vzdump backup on source
    // Step 2: Transfer backup via SCP (server-to-server)
    // Step 3: Restore on target with qmrestore
    // Step 4: Cleanup backup files and delete source VM
    // ============================================================

    log('[Migration] ╔═══════════════════════════════════════════════════════════╗');
    log('[Migration] ║     Reanimator Script: Cross-Cluster Migration            ║');
    log('[Migration] ╚═══════════════════════════════════════════════════════════╝');
    log('');

    // Get Target Host for SCP
    let targetHost = target.ssh_host;
    if (!targetHost && target.url) {
        try { targetHost = new URL(target.url).hostname; } catch { targetHost = target.url; }
    }
    if (!targetHost) throw new Error('Zielserver hat keine Host-IP konfiguriert.');

    // ========== PRE-FLIGHT CHECKS ==========
    await runPreFlightChecks(ctx, targetHost, log);

    // Determine Target VMID (after pre-flight so we know target is reachable)
    let targetVmid = options.targetVmid;
    if (!targetVmid && options.autoVmid !== false) {
        log('[Setup] Auto-selecting target VMID...');
        try {
            const nextIdRaw = await targetSsh.exec(`pvesh get /cluster/nextid --output-format json 2>/dev/null || echo "100"`);
            targetVmid = nextIdRaw.replace(/"/g, '').trim();
            log(`[Setup] Auto-selected VMID: ${targetVmid}`);
        } catch {
            targetVmid = vmid;
        }
    } else if (!targetVmid) {
        targetVmid = vmid;
    }

    // Clean up target VM if already exists
    try {
        await targetSsh.exec(`/usr/sbin/qm config ${targetVmid}`);
        log(`[Setup] Target VM ${targetVmid} already exists. Cleaning up...`);
        try { await targetSsh.exec(`/usr/sbin/qm stop ${targetVmid} --timeout 10`); } catch { }
        try { await targetSsh.exec(`/usr/sbin/qm unlock ${targetVmid}`); } catch { }
        try { await targetSsh.exec(`/usr/sbin/qm destroy ${targetVmid} --purge`); } catch { }
        log('[Setup] ✓ Target cleanup complete');
    } catch {
        // VM doesn't exist - normal case
    }

    log(`[Migration] Source Node: ${sourceNode}`);
    log(`[Migration] Target Host: ${targetHost}`);
    log(`[Migration] VMID: ${vmid} -> ${targetVmid}`);
    log(`[Migration] Storage: ${options.targetStorage || 'local-lvm'}`);

    // Use standard Proxmox dump directory (more space than /tmp)
    const backupDir = '/var/lib/vz/dump';
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

        // Find vzdump binary (can be in /usr/bin or /usr/sbin depending on system)
        let vzdumpPath = '/usr/bin/vzdump';
        try {
            const whichResult = await sourceSsh.exec('which vzdump');
            vzdumpPath = whichResult.trim() || vzdumpPath;
        } catch { }

        const logFile = `${backupDir}/migration_${vmid}.log`;

        // Clean up old log
        try { await sourceSsh.exec(`rm -f ${logFile}`); } catch { }

        // Command with nohup and logging (DETACHED MODE)
        const dumpCmd = `/usr/bin/nohup ${vzdumpPath} ${vmid} --dumpdir ${backupDir} --compress zstd --mode ${dumpMode} > ${logFile} 2>&1 & echo $!`;

        log(`[Step 1/4] Running detached: ${dumpCmd}`);

        const pidStr = await sourceSsh.exec(dumpCmd);
        const pid = pidStr.trim();
        log(`[vzdump] Started background process PID: ${pid}`);

        // Polling loop
        let running = true;

        while (running) {
            await new Promise(r => setTimeout(r, 3000)); // Sleep 3s

            // Check if process still exists
            try {
                await sourceSsh.exec(`ps -p ${pid}`);
            } catch {
                running = false; // Process gone
            }

            // Read recent log lines for progress
            if (running) {
                try {
                    const tail = await sourceSsh.exec(`tail -n 2 ${logFile}`);
                    if (tail.trim()) {
                        const lines = tail.split('\n');
                        lines.forEach(l => {
                            if (l.includes('%') || l.includes('INFO')) log(`[vzdump] ${l.trim()}`);
                        });
                    }
                } catch { }
            }
        }

        // Process finished. Verify success.
        log('[vzdump] Process finished. Verifying log...');
        const fullLog = await sourceSsh.exec(`cat ${logFile}`);

        if (!fullLog.includes('Finished Backup') && !fullLog.includes('archive contains')) {
            throw new Error(`vzdump failed. Last log lines:\n${fullLog.split('\n').slice(-10).join('\n')}`);
        }

        log('[Step 1/4] ✓ Backup successful');
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

            scpStream.on('exit', (code: number | null) => {
                exitCode = code;
                log(`[scp] Exit code: ${code}`);
            });
            scpStream.on('close', () => {
                if (exitCode === 0) resolve();
                else reject(new Error(`SCP transfer failed with exit code ${exitCode ?? 'unknown'}`));
            });
            scpStream.on('error', (err: Error) => reject(new Error(`SCP stream error: ${err.message}`)));
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

            restoreStream.on('exit', (code: number | null) => {
                exitCode = code;
                log(`[qmrestore] Exit code: ${code}`);
            });
            restoreStream.on('close', () => {
                if (exitCode === 0) resolve();
                else reject(new Error(`qmrestore failed with exit code ${exitCode ?? 'unknown'}`));
            });
            restoreStream.on('error', (err: Error) => reject(new Error(`qmrestore stream error: ${err.message}`)));
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

// --- SSH Trust Setup Helper ---

export async function setupSSHTrust(sourceId: number, targetId: number, rootPassword: string): Promise<string> {
    const source = await getServer(sourceId);
    const target = await getServer(targetId);

    // 1. Get/Generate Source Key
    const sourceSsh = await createSSHClient(source);
    let pubKey = '';
    try {
        pubKey = await sourceSsh.exec('cat ~/.ssh/id_rsa.pub');
    } catch {
        await sourceSsh.exec('ssh-keygen -t rsa -N "" -f ~/.ssh/id_rsa');
        pubKey = await sourceSsh.exec('cat ~/.ssh/id_rsa.pub');
    }

    if (!pubKey) throw new Error('Konnte SSH Key auf Quellserver nicht lesen/erstellen');

    // 2. Connect to Target with Password
    // explicitly use password and remove key to force password auth
    const targetSsh = await createSSHClient({
        ...target,
        username: 'root',
        password: rootPassword,
        privateKey: undefined
    });

    // 3. Install Key
    await targetSsh.exec('mkdir -p ~/.ssh && chmod 700 ~/.ssh');

    // Check if key already exists to avoid duplicates
    const authKeys = await targetSsh.exec('cat ~/.ssh/authorized_keys 2>/dev/null || true');
    if (!authKeys.includes(pubKey.trim())) {
        await targetSsh.exec(`echo "${pubKey.trim()}" >> ~/.ssh/authorized_keys`);
        await targetSsh.exec('chmod 600 ~/.ssh/authorized_keys');
    }

    return 'SSH Trust erfolgreich eingerichtet! Migration kann jetzt wiederholt werden.';
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
