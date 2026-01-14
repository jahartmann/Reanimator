import db from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const task = db.prepare('SELECT * FROM migration_tasks WHERE id = ?').get(id) as any;

        if (!task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        // Parse steps if stored as string, or fetch from separate table?
        // In previous implementation (migration.ts), we use a separate table `migration_steps`.
        // Let's check if we store steps in the task or separate.
        // Usually separate.

        const steps = db.prepare('SELECT * FROM migration_steps WHERE task_id = ? ORDER BY id ASC').all(id);

        // Also we might need to parse status or logs if they are JSON?
        // Logs are stored in `task.log` column (TEXT).

        const fullTask = {
            ...task,
            steps: steps || []
        };

        return NextResponse.json(fullTask);
    } catch (error: any) {
        console.error('Get migration failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const stmt = db.prepare('DELETE FROM migration_tasks WHERE id = ?');
        const info = stmt.run(id);

        if (info.changes === 0) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        // Also delete steps? Foreign key cascade should handle it if enabled, otherwise manual.
        db.prepare('DELETE FROM migration_steps WHERE task_id = ?').run(id);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Delete migration failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
