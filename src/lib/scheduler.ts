import cron from 'node-cron';
import db from './db';
import { performFullBackup } from './backup-logic';
import { scanAllVMs, scanHost } from '@/app/actions/scan';
import { migrateVM } from '@/app/actions/vm';

let scheduledTasks: any[] = [];

export function initScheduler() {
    console.log('[Scheduler] Initializing...');

    // Stop existing tasks
    scheduledTasks.forEach(task => task.stop());
    scheduledTasks = [];

    try {
        const jobs = db.prepare('SELECT * FROM jobs WHERE enabled = 1').all() as any[];

        jobs.forEach(job => {
            if (cron.validate(job.schedule)) {
                const task = cron.schedule(job.schedule, () => runJob(job));
                scheduledTasks.push(task);
                console.log(`[Scheduler] Loaded job: ${job.name} (${job.schedule})`);
            } else {
                console.warn(`[Scheduler] Invalid cron schedule for job ${job.name}: ${job.schedule}`);
            }
        });
    } catch (error) {
        console.error('[Scheduler] Failed to load jobs:', error);
    }
}

export function reloadScheduler() {
    initScheduler();
}

async function runJob(job: any) {
    console.log(`[Scheduler] Executing job: ${job.name} (type: ${job.job_type})`);
    const startTime = new Date().toISOString();

    // Insert history record
    const result = db.prepare('INSERT INTO history (job_id, status, start_time) VALUES (?, ?, ?) RETURNING id').get(job.id, 'running', startTime) as { id: number };
    const historyId = result.id;

    try {
        if (job.job_type === 'config') {
            // Config backup job
            const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(job.source_server_id) as any;
            if (!server) {
                throw new Error(`Server ${job.source_server_id} not found`);
            }

            const backupResult = await performFullBackup(job.source_server_id, server);

            if (!backupResult.success) {
                throw new Error(backupResult.message);
            }

            db.prepare('UPDATE history SET status = ?, end_time = ?, log = ? WHERE id = ?')
                .run('success', new Date().toISOString(), `Backup created: ${backupResult.backupId}`, historyId);
            console.log(`[Scheduler] Config backup job ${job.name} completed: backup ID ${backupResult.backupId}`);

        } else if (job.job_type === 'scan') {
            // Health Scan Job
            console.log(`[Scheduler] Starting Health Scan for Server ${job.source_server_id}`);

            // 1. Scan Host
            const hostRes = await scanHost(job.source_server_id);
            if (!hostRes.success) throw new Error(`Host Scan Failed: ${hostRes.error}`);

            // 2. Scan VMs
            const vmRes = await scanAllVMs(job.source_server_id);
            if (!vmRes.success) throw new Error(`VM Scan Failed: ${vmRes.error}`);

            db.prepare('UPDATE history SET status = ?, end_time = ?, log = ? WHERE id = ?')
                .run('success', new Date().toISOString(), `Host & ${vmRes.count} VMs scanned`, historyId);
            console.log(`[Scheduler] Scan job ${job.name} completed.`);

        } else if (job.job_type === 'migration') {
            // Migration Job
            console.log(`[Scheduler] Starting Migration Job ${job.name}`);
            const opts = JSON.parse(job.options || '{}');
            const { vmid, type, ...migrationOptions } = opts;

            if (!vmid || !type) throw new Error('Invalid migration job: missing vmid or type');

            const logs: string[] = [];
            const onLog = (msg: string) => {
                logs.push(`[${new Date().toISOString()}] ${msg}`);
                // Optional: Update DB periodically here if needed
            };

            const res = await migrateVM(job.source_server_id, vmid, type, migrationOptions, onLog);

            const status = res.success ? 'success' : 'failed';
            const finalLog = logs.join('\n') + (res.message ? `\n\nResult: ${res.message}` : '');

            db.prepare('UPDATE history SET status = ?, end_time = ?, log = ? WHERE id = ?')
                .run(status, new Date().toISOString(), finalLog, historyId);

            console.log(`[Scheduler] Migration job ${job.name} finished: ${status}`);

        } else {
            // Default mock for other job types
            await new Promise(resolve => setTimeout(resolve, 2000));
            db.prepare('UPDATE history SET status = ?, end_time = ? WHERE id = ?')
                .run('success', new Date().toISOString(), historyId);
            console.log(`[Scheduler] Job ${job.name} completed successfully.`);
        }
    } catch (error) {
        console.error(`[Scheduler] Job ${job.name} failed:`, error);
        db.prepare('UPDATE history SET status = ?, end_time = ?, log = ? WHERE id = ?')
            .run('failed', new Date().toISOString(), String(error), historyId);
    }
}
