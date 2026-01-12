'use server';

import { createSSHClient } from '@/lib/ssh';
import db from '@/lib/db';
import { getServer } from './server';

export async function cloneServerConfig(
    sourceId: number,
    targetId: number,
    options: { network: boolean; tags: boolean }
): Promise<{ success: boolean; message: string; details?: string[] }> {
    const logs: string[] = [];

    try {
        const source = await getServer(sourceId);
        const target = await getServer(targetId);

        if (!source || !target) throw new Error("Server not found");

        const sourceSsh = createSSHClient({
            ssh_host: source.ssh_host,
            ssh_port: source.ssh_port,
            ssh_user: source.ssh_user,
            ssh_key: source.ssh_key
        });

        const targetSsh = createSSHClient({
            ssh_host: target.ssh_host,
            ssh_port: target.ssh_port,
            ssh_user: target.ssh_user,
            ssh_key: target.ssh_key
        });

        logs.push(`Connecting to Source: ${source.name}...`);
        await sourceSsh.connect();

        logs.push(`Connecting to Target: ${target.name}...`);
        await targetSsh.connect();

        if (options.network) {
            logs.push('--- Network Configuration ---');
            try {
                // 1. Read Source Config
                logs.push('Reading /etc/network/interfaces from Source...');
                const networkConfig = await sourceSsh.exec('cat /etc/network/interfaces');

                if (!networkConfig || networkConfig.length < 10) {
                    throw new Error('Source network configuration is empty or invalid.');
                }

                // 2. Backup Target Config
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupPath = `/etc/network/interfaces.bak.${timestamp}`;
                logs.push(`Backing up Target config to ${backupPath}...`);
                await targetSsh.exec(`cp /etc/network/interfaces ${backupPath}`);

                // 3. Write New Config
                logs.push('Writing new configuration to Target...');
                // Escape single quotes for echo command
                const safeConfig = networkConfig.replace(/'/g, "'\\''");
                await targetSsh.exec(`echo '${safeConfig}' > /etc/network/interfaces`);

                // 4. Apply Changes
                logs.push('Applying changes (ifreload -a)...');
                await targetSsh.exec('ifreload -a');
                logs.push('Network configuration applied successfully.');

            } catch (netErr) {
                logs.push(`Error cloning network: ${netErr}`);
                throw netErr;
            }
        }

        if (options.tags) {
            logs.push('--- Tags Sync ---');
            try {
                // 1. Read Source Tags (datacenter.cfg)
                const sourceOptions = await sourceSsh.exec('pvesh get /cluster/options --output-format json');
                const sourceJson = JSON.parse(sourceOptions);
                const tagStyle = sourceJson['tag-style'];

                if (tagStyle) {
                    logs.push(`Found tag-style: ${tagStyle}`);
                    // 2. Apply to Target
                    // Note: This overwrites existing tag styles on target!
                    await targetSsh.exec(`pvesh set /cluster/options --tag-style "${tagStyle}"`);
                    logs.push('Tags synced successfully.');
                } else {
                    logs.push('No tags found on source.');
                }
            } catch (tagErr) {
                logs.push(`Error syncing tags: ${tagErr}`);
            }
        }

        await sourceSsh.disconnect();
        await targetSsh.disconnect();

        return { success: true, message: 'Configuration cloned successfully', details: logs };

    } catch (e: any) {
        return { success: false, message: e.message || String(e), details: logs };
    }
}
