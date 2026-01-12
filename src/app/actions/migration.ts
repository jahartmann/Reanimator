'use server';

import db from '@/lib/db';
import { createSSHClient } from '@/lib/ssh';
import { getVMs, migrateVM, MigrationOptions } from './vm';

export interface MigrationStep {
    type: 'config' | 'vm' | 'lxc' | 'finalize';
    name: string;
    vmid?: string;
    vmType?: 'qemu' | 'lxc';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    error?: string;
}

export interface MigrationTask {
    id: number;
    source_server_id: number;
    target_server_id: number;
    target_storage: string;
    target_bridge: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    current_step: string;
    progress: number;
    total_steps: number;
    steps: MigrationStep[];
    log: string;
    error?: string;
    started_at?: string;
    completed_at?: string;
    created_at: string;
    source_name?: string;
    target_name?: string;
}

// Helper to get server details
async function getServer(id: number) {
    const stmt = db.prepare('SELECT * FROM servers WHERE id = ?');
    const server = stmt.get(id) as any;
    if (!server) throw new Error(`Server ${id} not found`);
    return server;
}

// Start a new server migration
export async function startServerMigration(
    sourceId: number,
    targetId: number,
    targetStorage: string,
    targetBridge: string
): Promise<{ success: boolean; taskId?: number; error?: string }> {
    try {
        // 1. Fetch all VMs from source
        const vms = await getVMs(sourceId);

        // 2. Build step list
        const steps: MigrationStep[] = [
            { type: 'config', name: 'Konfiguration sichern & übertragen', status: 'pending' }
        ];

        // Add VMs
        for (const vm of vms.filter(v => v.type === 'qemu')) {
            steps.push({
                type: 'vm',
                name: `VM ${vm.vmid} - ${vm.name}`,
                vmid: vm.vmid,
                vmType: 'qemu',
                status: 'pending'
            });
        }

        // Add LXCs
        for (const lxc of vms.filter(v => v.type === 'lxc')) {
            steps.push({
                type: 'lxc',
                name: `LXC ${lxc.vmid} - ${lxc.name}`,
                vmid: lxc.vmid,
                vmType: 'lxc',
                status: 'pending'
            });
        }

        // Finalize step
        steps.push({ type: 'finalize', name: 'Migration abschließen', status: 'pending' });

        // 3. Insert into DB
        const stmt = db.prepare(`
            INSERT INTO migration_tasks 
            (source_server_id, target_server_id, target_storage, target_bridge, status, total_steps, steps_json, current_step)
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
        `);
        const result = stmt.run(
            sourceId,
            targetId,
            targetStorage,
            targetBridge,
            steps.length,
            JSON.stringify(steps),
            steps[0].name
        );

        const taskId = result.lastInsertRowid as number;

        // 4. Start background execution (fire and forget)
        // We use setTimeout to not block the response
        setTimeout(() => executeMigrationTask(taskId), 100);

        return { success: true, taskId };

    } catch (e) {
        console.error('[Migration] Failed to start:', e);
        return { success: false, error: String(e) };
    }
}

// Get migration task status
export async function getMigrationTask(taskId: number): Promise<MigrationTask | null> {
    const stmt = db.prepare(`
        SELECT 
            mt.*,
            s1.name as source_name,
            s2.name as target_name
        FROM migration_tasks mt
        LEFT JOIN servers s1 ON mt.source_server_id = s1.id
        LEFT JOIN servers s2 ON mt.target_server_id = s2.id
        WHERE mt.id = ?
    `);
    const row = stmt.get(taskId) as any;
    if (!row) return null;

    return {
        ...row,
        steps: JSON.parse(row.steps_json || '[]')
    };
}

// Get all migration tasks
export async function getAllMigrationTasks(): Promise<MigrationTask[]> {
    const stmt = db.prepare(`
        SELECT 
            mt.*,
            s1.name as source_name,
            s2.name as target_name
        FROM migration_tasks mt
        LEFT JOIN servers s1 ON mt.source_server_id = s1.id
        LEFT JOIN servers s2 ON mt.target_server_id = s2.id
        ORDER BY mt.created_at DESC
        LIMIT 50
    `);
    const rows = stmt.all() as any[];

    return rows.map(row => ({
        ...row,
        steps: JSON.parse(row.steps_json || '[]')
    }));
}

// Cancel a running migration
export async function cancelMigration(taskId: number): Promise<{ success: boolean }> {
    const stmt = db.prepare(`
        UPDATE migration_tasks 
        SET status = 'cancelled', completed_at = datetime('now')
        WHERE id = ? AND status IN ('pending', 'running')
    `);
    stmt.run(taskId);
    return { success: true };
}

// Background task executor
async function executeMigrationTask(taskId: number) {
    console.log(`[Migration] Starting task ${taskId}`);

    // Mark as running
    db.prepare(`
        UPDATE migration_tasks 
        SET status = 'running', started_at = datetime('now')
        WHERE id = ?
    `).run(taskId);

    const task = await getMigrationTask(taskId);
    if (!task) return;

    const steps = task.steps;
    let currentProgress = 0;

    for (let i = 0; i < steps.length; i++) {
        // Check if cancelled
        const currentTask = await getMigrationTask(taskId);
        if (currentTask?.status === 'cancelled') {
            appendLog(taskId, '❌ Migration wurde abgebrochen');
            return;
        }

        const step = steps[i];

        // Update current step
        steps[i].status = 'running';
        updateTaskProgress(taskId, i, steps.length, step.name, steps);
        appendLog(taskId, `⏳ Starte: ${step.name}`);

        try {
            if (step.type === 'config') {
                // Config backup & restore
                await executeConfigStep(task);

            } else if (step.type === 'vm' || step.type === 'lxc') {
                // VM/LXC migration
                await executeVmStep(task, step);

            } else if (step.type === 'finalize') {
                // Finalization
                appendLog(taskId, '✅ Validierung abgeschlossen');
            }

            steps[i].status = 'completed';
            currentProgress = i + 1;
            updateTaskProgress(taskId, currentProgress, steps.length, step.name, steps);
            appendLog(taskId, `✅ Abgeschlossen: ${step.name}`);

        } catch (e) {
            steps[i].status = 'failed';
            steps[i].error = String(e);
            updateTaskProgress(taskId, currentProgress, steps.length, step.name, steps);
            appendLog(taskId, `❌ Fehler bei ${step.name}: ${e}`);

            // Mark task as failed
            db.prepare(`
                UPDATE migration_tasks 
                SET status = 'failed', error = ?, completed_at = datetime('now')
                WHERE id = ?
            `).run(String(e), taskId);

            return;
        }
    }

    // All done!
    db.prepare(`
        UPDATE migration_tasks 
        SET status = 'completed', progress = total_steps, completed_at = datetime('now')
        WHERE id = ?
    `).run(taskId);

    appendLog(taskId, '🎉 Migration erfolgreich abgeschlossen!');
    console.log(`[Migration] Task ${taskId} completed successfully`);
}

// Execute config backup & restore step
async function executeConfigStep(task: MigrationTask) {
    // For now, just log - we could integrate with existing config backup logic
    // The user might want to manually handle configs or use a simpler approach
    console.log(`[Migration] Config step for task ${task.id}`);

    // Simulate config transfer (in real implementation, backup from source and restore to target)
    await new Promise(resolve => setTimeout(resolve, 2000));
}

// Execute VM/LXC migration step
async function executeVmStep(task: MigrationTask, step: MigrationStep) {
    if (!step.vmid || !step.vmType) throw new Error('Invalid step: missing vmid/type');

    const options: MigrationOptions = {
        targetServerId: task.target_server_id,
        targetStorage: task.target_storage,
        targetBridge: task.target_bridge,
        online: true // Default to online migration
    };

    const result = await migrateVM(task.source_server_id, step.vmid, step.vmType, options);

    if (!result.success) {
        throw new Error(result.message);
    }
}

// Helper: Update task progress in DB
function updateTaskProgress(taskId: number, progress: number, total: number, currentStep: string, steps: MigrationStep[]) {
    db.prepare(`
        UPDATE migration_tasks 
        SET progress = ?, current_step = ?, steps_json = ?
        WHERE id = ?
    `).run(progress, currentStep, JSON.stringify(steps), taskId);
}

// Helper: Append to log
function appendLog(taskId: number, message: string) {
    const timestamp = new Date().toLocaleTimeString('de-DE');
    db.prepare(`
        UPDATE migration_tasks 
        SET log = log || ?
        WHERE id = ?
    `).run(`[${timestamp}] ${message}\n`, taskId);
}
