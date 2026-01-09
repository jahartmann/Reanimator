'use server'

import db from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function addServer(formData: FormData) {
    const name = formData.get('name') as string;
    const type = formData.get('type') as string;
    const url = formData.get('url') as string;
    const token = formData.get('token') as string;

    // SSH configuration
    const ssh_host = formData.get('ssh_host') as string || null;
    const ssh_port = parseInt(formData.get('ssh_port') as string) || 22;
    const ssh_user = formData.get('ssh_user') as string || 'root';
    const ssh_password = formData.get('ssh_password') as string || null;

    db.prepare(`
        INSERT INTO servers (name, type, url, auth_token, ssh_host, ssh_port, ssh_user, ssh_key, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, type, url, token, ssh_host, ssh_port, ssh_user, ssh_password, 'unknown');

    revalidatePath('/servers');
    redirect('/servers');
}

export async function deleteServer(id: number) {
    db.prepare('DELETE FROM servers WHERE id = ?').run(id);
    revalidatePath('/servers');
}

export async function addJob(formData: FormData) {
    const name = formData.get('name') as string;
    const sourceId = formData.get('sourceId') as string;
    const targetIdStr = formData.get('targetId') as string;
    const schedule = formData.get('schedule') as string;

    // Target can be null for local config backups
    const targetId = targetIdStr && targetIdStr !== '' ? parseInt(targetIdStr) : null;

    db.prepare('INSERT INTO jobs (name, source_server_id, target_server_id, schedule) VALUES (?, ?, ?, ?)')
        .run(name, parseInt(sourceId), targetId, schedule);

    revalidatePath('/jobs');
    redirect('/jobs');
}

export async function deleteJob(id: number) {
    db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
    revalidatePath('/jobs');
}
