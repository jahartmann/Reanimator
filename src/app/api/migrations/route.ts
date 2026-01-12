import { NextResponse } from 'next/server';
import { getAllMigrationTasks, startServerMigration } from '@/app/actions/migration';

export async function GET() {
    try {
        const tasks = await getAllMigrationTasks();
        return NextResponse.json(tasks);
    } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { sourceId, targetId, targetStorage, targetBridge } = body;

        if (!sourceId || !targetId || !targetStorage || !targetBridge) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const result = await startServerMigration(sourceId, targetId, targetStorage, targetBridge);

        if (result.success) {
            return NextResponse.json({ taskId: result.taskId });
        } else {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }
    } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
