import db from '@/lib/db';
import { revalidatePath } from 'next/cache';
import ServersClient from './ServersClient';

export const dynamic = 'force-dynamic';

interface ServerItem {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    url: string;
    status: string;
    ssh_host?: string;
    group_name?: string | null;
}

async function deleteServer(id: number) {
    'use server';
    db.prepare('DELETE FROM servers WHERE id = ?').run(id);
    revalidatePath('/servers');
}

export default function ServersPage() {
    const servers = db.prepare('SELECT * FROM servers ORDER BY group_name, name').all() as ServerItem[];

    // Get unique groups
    const groups = [...new Set(
        servers
            .map(s => s.group_name)
            .filter((g): g is string => g !== null && g !== undefined && g.trim() !== '')
    )].sort();

    return (
        <ServersClient
            servers={servers}
            groups={groups}
            onDeleteServer={deleteServer}
        />
    );
}
