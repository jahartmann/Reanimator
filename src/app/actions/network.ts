'use server';

import db from '@/lib/db';
import { createSSHClient } from '@/lib/ssh';
import { NetworkInterface, parseNetworkInterfaces, generateNetworkInterfaces } from '@/lib/network-parser';
import { getServer } from './vm';

export async function getNetworkConfig(serverId: number): Promise<{ success: boolean; interfaces?: NetworkInterface[]; error?: string }> {
    try {
        const server = await getServer(serverId);
        const ssh = createSSHClient({
            ssh_host: server.ip,
            ssh_user: server.username,
            ssh_key: server.password
        });
        await ssh.connect();

        const content = await ssh.execCommand('cat /etc/network/interfaces');
        ssh.dispose();

        const interfaces = parseNetworkInterfaces(content.stdout);
        // Sort: lo first, then others by name
        interfaces.sort((a, b) => {
            if (a.method === 'loopback') return -1;
            if (b.method === 'loopback') return 1;
            return a.name.localeCompare(b.name);
        });

        return { success: true, interfaces };
    } catch (e: any) {
        console.error('Network Fetch Error:', e);
        return { success: false, error: e.message };
    }
}

export async function saveNetworkConfig(serverId: number, interfaces: NetworkInterface[], apply: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
        const server = await getServer(serverId);
        const ssh = createSSHClient({
            ssh_host: server.ip,
            ssh_user: server.username,
            ssh_key: server.password
        });
        await ssh.connect();

        const content = generateNetworkInterfaces(interfaces);

        // Backup existing
        await ssh.execCommand(`cp /etc/network/interfaces /etc/network/interfaces.bak.$(date +%s)`);

        // Write new file
        // echo with EOF to handle newlines safely
        // But ssh.execCommand might struggle with complex multiline.
        // Better to use sftp or a robust echo.
        // Node-ssh execCommand usually handles just a command string. 
        // We can use a temporary file approach or base64 decode.

        const base64Content = Buffer.from(content).toString('base64');
        await ssh.execCommand(`echo "${base64Content}" | base64 -d > /etc/network/interfaces.new`);

        // Move to real file
        await ssh.execCommand(`mv /etc/network/interfaces.new /etc/network/interfaces`);

        if (apply) {
            // Try ifreload first (Proxmox standard), fall back to networking restart
            const reload = await ssh.execCommand('ifreload -a');
            if (reload.code !== 0) {
                // Fallback
                await ssh.execCommand('systemctl restart networking');
            }
        }

        ssh.dispose();
        return { success: true };
    } catch (e: any) {
        console.error('Network Save Error:', e);
        return { success: false, error: e.message };
    }
}
