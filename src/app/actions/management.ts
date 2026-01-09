'use server'

import { ProxmoxClient } from '@/lib/proxmox';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function testConnection(url: string, token: string, type: 'pve' | 'pbs') {
    console.log(`Testing connection to ${url} (${type})...`);

    try {
        const client = new ProxmoxClient({
            url,
            token,
            type
        });

        const success = await client.checkStatus();
        if (success) {
            return { success: true, message: 'Connection successful!' };
        } else {
            return { success: false, message: 'Could not connect. Check URL/Token.' };
        }
    } catch (error) {
        return { success: false, message: String(error) };
    }
}

export async function systemRestart() {
    console.log('Triggering system restart...');
    try {
        // Safe restart logic: calls the management script or exits to let systemd restart
        // In dev mode, we just exit. In prod with systemd, this triggers Restart=always
        setTimeout(() => {
            process.exit(0);
        }, 1000);
        return { success: true, message: 'Restarting...' };
    } catch (e) {
        return { success: false, message: 'Failed to restart.' };
    }
}

export async function systemUpdate() {
    // This is risky to run from the web app itself as it kills the process running the app
    // Ideally this writes a trigger file or similar. 
    // For now, we'll try to execute the git pull command, but it might fail permissions if not handled carefully.
    // We will just run the command and hope the user set permissions right or its running as a user who can git pull.

    try {
        await execAsync('git pull && npm install && npm run build');
        // After build, we need to restart
        setTimeout(() => process.exit(0), 1000);
        return { success: true, message: 'Update started. Service will restart shortly.' };
    } catch (e) {
        console.error(e);
        return { success: false, message: 'Update failed: ' + String(e) };
    }
}
