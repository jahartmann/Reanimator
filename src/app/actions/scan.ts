'use server';

import db from '@/lib/db';
import { createSSHClient } from '@/lib/ssh';
import { getServer, determineNodeName } from './vm';
import { getVMs, getVMConfig } from './vm';
import { analyzeConfigWithAI, analyzeHostWithAI, HealthResult } from './ai';
import { runNetworkAnalysis } from './network_analysis';

export interface ScanResult {
    id: number;
    server_id: number;
    vmid: string | null; // NULL for host
    type: 'qemu' | 'lxc' | 'host';
    result: HealthResult;
    created_at: string;
}

export async function getScanResults(serverId: number): Promise<ScanResult[]> {
    const rows = db.prepare('SELECT * FROM scan_results WHERE server_id = ? ORDER BY created_at DESC').all(serverId) as any[];
    return rows.map(row => ({
        ...row,
        result: JSON.parse(row.result_json)
    }));
}

export async function scanAllVMs(serverId: number) {
    try {
        const vms = await getVMs(serverId);

        // Prepare statement outside the loop for efficiency
        const stmt = db.prepare(`
            INSERT INTO scan_results (server_id, vmid, type, result_json)
            VALUES (?, ?, ?, ?)
        `);

        // Use transaction for bulk operations - ensures consistency
        const insertResults = db.transaction((items: Array<{ vmid: string, type: string, analysis: any }>) => {
            for (const item of items) {
                stmt.run(serverId, item.vmid, item.type, JSON.stringify(item.analysis));
            }
        });

        // Collect all results first
        const results: Array<{ vmid: string, type: string, analysis: any }> = [];

        for (const vm of vms) {
            // Fetch Config
            const config = await getVMConfig(serverId, vm.vmid, vm.type);
            if (!config) continue;

            // Analyze
            const analysis = await analyzeConfigWithAI(config, vm.type);
            results.push({ vmid: vm.vmid, type: vm.type, analysis });
        }

        // Insert all results in a single transaction
        insertResults(results);

        return { success: true, count: vms.length };
    } catch (e: any) {
        console.error('VM Scan Error:', e);
        return { success: false, error: e.message };
    }
}

export async function scanHost(serverId: number) {
    const server = await getServer(serverId);
    if (!server) throw new Error('Server not found');

    const ssh = createSSHClient(server);
    try {
        await ssh.connect();

        // Fetch critical files
        const filesToFetch = [
            '/etc/network/interfaces',
            '/etc/pve/storage.cfg',
            '/etc/sysctl.conf',
            '/etc/hosts'
        ];

        const files = [];

        for (const file of filesToFetch) {
            try {
                const content = await ssh.exec(`cat ${file} 2>/dev/null`);
                if (content && content.length > 0) {
                    files.push({ filename: file, content });
                }
            } catch { }
        }

        // Get ZFS status if exists
        try {
            const zpool = await ssh.exec('zpool status 2>/dev/null');
            if (zpool) files.push({ filename: 'zpool status', content: zpool });
        } catch { }

        // Get Storage status
        try {
            const pvesm = await ssh.exec('pvesm status 2>/dev/null');
            if (pvesm) files.push({ filename: 'pvesm status', content: pvesm });
        } catch { }

        // Analyze
        const analysis = await analyzeHostWithAI(files);

        // Save
        const stmt = db.prepare(`
            INSERT INTO scan_results (server_id, vmid, type, result_json)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(serverId, null, 'host', JSON.stringify(analysis));

        return { success: true, result: analysis };

    } catch (e: any) {
        console.error('Host Scan Error:', e);
        return { success: false, error: e.message };
    } finally {
        await ssh.disconnect();
    }
}
// ... existing code ...

export async function scanEntireInfrastructure() {
    const startTime = Date.now();
    let jobId: number | null = null;

    try {
        // 1. Create a "Global Scan" job record if it doesn't exist (conceptually) or just log to history
        // Since history requires a job_id (linked to jobs table usually), we might need a dummy job or allow null. 
        // Checking schema: history(id, job_id, start_time, end_time, status, log, created_at)
        // If job_id is Foreign Key, we must insert a job first. Let's assume we can create a temporary or system job.

        // For better visibility, let's insert a "System Task" into history. 
        // If job_id is strict FK, we need a job. Let's create a "Global Scan" system job if not exists.

        let globalScanJob = db.prepare("SELECT id FROM jobs WHERE name = 'Global Scan' AND job_type = 'scan'").get() as { id: number };

        if (!globalScanJob) {
            // Fix: jobs table requires source_server_id/target_server_id. Use first server as placeholder.
            const firstServer = db.prepare('SELECT id FROM servers LIMIT 1').get() as { id: number };
            if (!firstServer) {
                return { success: false, error: 'No servers available to initialize Global Scan.' };
            }

            const info = db.prepare(`
                INSERT INTO jobs (name, job_type, schedule, enabled, source_server_id, target_server_id) 
                VALUES ('Global Scan', 'scan', '@manual', 1, ?, ?)
            `).run(firstServer.id, firstServer.id);
            globalScanJob = { id: Number(info.lastInsertRowid) };
        }

        jobId = globalScanJob.id;

        // Log Start
        const historyInfo = db.prepare("INSERT INTO history (job_id, start_time, status, log) VALUES (?, ?, 'running', 'Global Scan started...')").run(jobId, new Date().toISOString());
        const historyId = historyInfo.lastInsertRowid;

        const updateLog = (msg: string) => {
            db.prepare("UPDATE history SET log = log || '\n' || ? WHERE id = ?").run(msg, historyId);
        };

        const servers = db.prepare('SELECT id, name FROM servers').all() as { id: number, name: string }[];
        const results = {
            servers: 0,
            vms: 0,
            errors: [] as string[]
        };

        updateLog(`Found ${servers.length} servers to scan.`);

        for (const server of servers) {
            // Check for cancellation
            const currentJob = db.prepare('SELECT status FROM history WHERE id = ?').get(historyId) as any;
            if (currentJob.status === 'cancelled') {
                updateLog('Scan cancelled by user.');
                return { success: false, error: 'Cancelled' };
            }

            try {
                updateLog(`Scanning Server: ${server.name}...`);
                // Scan Host
                await scanHost(server.id);
                results.servers++;

                // Network Analysis (AI)
                try {
                    await runNetworkAnalysis(server.id);
                    updateLog(`  -> Network Analysis completed (AI)`);
                } catch (e: any) {
                    updateLog(`  -> Network Analysis failed: ${e.message}`);
                }

                // Scan VMs
                const vmRes = await scanAllVMs(server.id);
                if (vmRes.success && vmRes.count) {
                    results.vms += vmRes.count;
                    updateLog(`  -> Scanned ${vmRes.count} VMs on ${server.name}`);
                }
            } catch (e: any) {
                console.error(`Scan failed for ${server.name}:`, e);
                results.errors.push(`${server.name}: ${e.message}`);
                updateLog(`  -> ERROR on ${server.name}: ${e.message}`);
            }
        }

        // Log End
        const endTime = new Date().toISOString();
        const finalStatus = results.errors.length > 0 ? 'warning' : 'completed';
        const summary = `Scan finished. Servers: ${results.servers}, VMs: ${results.vms}, Errors: ${results.errors.length}`;

        db.prepare("UPDATE history SET end_time = ?, status = ?, log = log || '\n' || ? WHERE id = ?").run(endTime, finalStatus, summary, historyId);

        return { success: true, results };
    } catch (e: any) {
        if (jobId) {
            // Try to log failure
            try {
                db.prepare("UPDATE history SET end_time = ?, status = 'failed', log = log || '\nFatal Error: ' || ? WHERE job_id = ? AND end_time IS NULL").run(new Date().toISOString(), e.message, jobId);
            } catch { }
        }
        return { success: false, error: e.message };
    }
}
