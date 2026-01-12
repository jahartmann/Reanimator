'use server';

import db from '@/lib/db';
import { createSSHClient } from '@/lib/ssh';

// Get network interfaces config
export async function getNetworkConfig(serverId: number): Promise<{ success: boolean; content?: string; message?: string }> {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    if (!server) return { success: false, message: 'Server not found' };

    const ssh = createSSHClient({
        ssh_host: server.ssh_host,
        ssh_port: server.ssh_port,
        ssh_user: server.ssh_user,
        ssh_key: server.ssh_key
    });

    try {
        await ssh.connect();
        const content = await ssh.exec('cat /etc/network/interfaces');
        return { success: true, content };
    } catch (e) {
        console.error('[Network] Fetch failed:', e);
        return { success: false, message: String(e) };
    } finally {
        await ssh.disconnect();
    }
}

// Save network configuration (write to file + backup)
export async function saveNetworkConfig(serverId: number, content: string): Promise<{ success: boolean; message: string }> {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    if (!server) return { success: false, message: 'Server not found' };

    const ssh = createSSHClient({
        ssh_host: server.ssh_host,
        ssh_port: server.ssh_port,
        ssh_user: server.ssh_user,
        ssh_key: server.ssh_key
    });

    try {
        await ssh.connect();

        // 1. Backup existing config
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await ssh.exec(`cp /etc/network/interfaces /etc/network/interfaces.bak.${timestamp}`);

        // 2. Write new config
        // Using echo logic here requires careful escaping. 
        // Better: write to temporary file then move.
        const tempPath = `/tmp/interfaces.${timestamp}`;

        // We need to escape single quotes for echo 'CONTENT' > file
        const safeContent = content.replace(/'/g, "'\\''");

        await ssh.exec(`echo '${safeContent}' > ${tempPath}`);

        // 3. Move to destination (requires root/sudo)
        await ssh.exec(`mv ${tempPath} /etc/network/interfaces`);

        return { success: true, message: 'Configuration saved. Backup created.' };
    } catch (e) {
        console.error('[Network] Save failed:', e);
        return { success: false, message: String(e) };
    } finally {
        await ssh.disconnect();
    }
}

// Apply network configuration (ifreload -a)
export async function applyNetworkConfig(serverId: number): Promise<{ success: boolean; message: string }> {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
    if (!server) return { success: false, message: 'Server not found' };

    const ssh = createSSHClient({
        ssh_host: server.ssh_host,
        ssh_port: server.ssh_port,
        ssh_user: server.ssh_user,
        ssh_key: server.ssh_key
    });

    try {
        await ssh.connect();

        // WARNING: This command can cut off connection
        // We use ifreload -a which is standard in Proxmox (ifupdown2)
        console.log(`[Network] Applying config on server ${server.name}`);
        const output = await ssh.exec('ifreload -a', 10000); // 10s timeout

        return { success: true, message: output || 'Network reloaded.' };
    } catch (e) {
        console.error('[Network] Apply failed:', e);

        // If SSH fails here, it might mean the network changed successfully but connection dropped
        // Or it broke completely.
        return {
            success: false,
            message: `Execution finished with error (might be expected if IP changed): ${String(e)}`
        };
    } finally {
        await ssh.disconnect();
    }
}
