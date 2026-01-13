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

    // Group & SSL
    const group_name = formData.get('group_name') as string || null;
    let ssl_fingerprint = formData.get('ssl_fingerprint') as string || null;

    // Automatic Fingerprint Fetching
    if (!ssl_fingerprint && (ssh_host || url) && (ssh_password || formData.get('ssh_key'))) {
        try {
            console.log('Fetching SSL fingerprint automatically via SSH...');
            const { createSSHClient } = await import('@/lib/ssh');

            // Construct a temporary server object to reuse createSSHClient logic
            const tempServer = {
                ssh_host: ssh_host || undefined,
                ssh_port: ssh_port,
                ssh_user: ssh_user,
                ssh_key: (ssh_password || (formData.get('ssh_key') as string)) || undefined,
                url: url
            };

            const client = createSSHClient(tempServer);
            await client.connect();

            const fpCmd = `openssl x509 -noout -fingerprint -sha256 -in /etc/pve/local/pve-ssl.pem | cut -d= -f2`;
            const fpResult = await client.exec(fpCmd);

            if (fpResult && fpResult.trim().length > 10) {
                ssl_fingerprint = fpResult.trim();
                console.log('Successfully fetched fingerprint:', ssl_fingerprint);
            }

            await client.disconnect();
        } catch (e) {
            console.warn('Failed to auto-fetch SSL fingerprint:', e);
            // Continue without fingerprint, user can add it later or migration will try dynamic fetch (less reliable)
        }
    }

    db.prepare(`
        INSERT INTO servers (name, type, url, auth_token, ssl_fingerprint, ssh_host, ssh_port, ssh_user, ssh_key, status, group_name) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, type, url, token, ssl_fingerprint, ssh_host, ssh_port, ssh_user, ssh_password, 'unknown', group_name);

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

export async function testSSHConnection(formData: FormData) {
    const host = formData.get('ssh_host') as string;
    const port = parseInt(formData.get('ssh_port') as string);
    const username = formData.get('ssh_user') as string;
    const password = formData.get('ssh_password') as string;

    if (!host) return { success: false, message: 'Host required' };

    try {
        const { Client } = await import('ssh2');
        const conn = new Client();

        await new Promise<void>((resolve, reject) => {
            conn.on('ready', () => {
                conn.end();
                resolve();
            }).on('error', (err) => {
                reject(err);
            }).connect({
                host,
                port,
                username,
                password,
                readyTimeout: 5000
            });
        });

        return { success: true, message: 'SSH Verbindung erfolgreich' };
    } catch (err) {
        return { success: false, message: `SSH Fehler: ${err instanceof Error ? err.message : String(err)}` };
    }
}

export async function generateApiToken(formData: FormData) {
    const url = formData.get('url') as string;
    const username = formData.get('user') as string;
    const password = formData.get('password') as string;
    const type = formData.get('type') as 'pve' | 'pbs';

    if (!url || !username || !password) {
        return { success: false, message: 'URL, Benutzer und Passwort benötigt' };
    }

    try {
        const { ProxmoxClient } = await import('@/lib/proxmox');
        const client = new ProxmoxClient({ url, type, username, password });
        const token = await client.generateToken();
        return { success: true, token };
    } catch (err) {
        return { success: false, message: `Token Fehler: ${err instanceof Error ? err.message : String(err)}` };
    }
}
