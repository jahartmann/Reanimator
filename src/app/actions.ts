'use server'

import db from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function addServer(formData: FormData) {
    const name = formData.get('name') as string;
    const type = formData.get('type') as string;
    const url = formData.get('url') as string;
    const token = formData.get('token') as string;

    db.prepare('INSERT INTO servers (name, type, url, auth_token, status) VALUES (?, ?, ?, ?, ?)')
        .run(name, type, url, token, 'unknown');

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
    const targetId = formData.get('targetId') as string;
    const schedule = formData.get('schedule') as string;

    db.prepare('INSERT INTO jobs (name, source_server_id, target_server_id, schedule) VALUES (?, ?, ?, ?)')
        .run(name, sourceId, targetId, schedule);

    revalidatePath('/jobs');
    redirect('/jobs');
}

export async function deleteJob(id: number) {
    db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
    revalidatePath('/jobs');
}
