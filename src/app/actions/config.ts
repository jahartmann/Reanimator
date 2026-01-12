'use server';

import { createSSHClient } from '@/lib/ssh';
import db from '@/lib/db';
import { getServer } from './server';


export interface CloneOptions {
    network?: boolean; // /etc/network/interfaces
    hosts?: boolean;   // /etc/hosts
    dns?: boolean;     // /etc/resolv.conf
    timezone?: boolean;// /etc/timezone
    locale?: boolean;  // /etc/locale.gen
    tags?: boolean;    // datacenter.cfg (tag-style)
    storage?: boolean; // /etc/pve/storage.cfg
}

export async function cloneServerConfig(
    sourceId: number,
    targetId: number,
    options: CloneOptions
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

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Helper to copy simple files
        const copyFile = async (name: string, path: string, postCmd?: string) => {
            logs.push(`--- Cloning ${name} (${path}) ---`);
            try {
                // Read
                const content = await sourceSsh.exec(`cat ${path}`);
                if (!content) throw new Error('Source file is empty');

                // Backup
                const backupPath = `${path}.bak.${timestamp}`;
                await targetSsh.exec(`cp ${path} ${backupPath} 2>/dev/null || true`);
                logs.push(`Backed up to ${backupPath}`);

                // Write
                const safeContent = content.replace(/'/g, "'\\''");
                await targetSsh.exec(`echo '${safeContent}' > ${path}`);
                logs.push(`Wrote new ${name}`);

                // Post-command
                if (postCmd) {
                    logs.push(`Executing: ${postCmd}`);
                    await targetSsh.exec(postCmd);
                }
            } catch (e) {
                logs.push(`Failed to clone ${name}: ${e}`);
                throw e;
            }
        };

        if (options.network) {
            logs.push('--- Network Configuration ---');
            try {
                const path = '/etc/network/interfaces';
                const content = await sourceSsh.exec(`cat ${path}`);
                if (!content || content.length < 10) throw new Error('Invalid source network config');

                const backupPath = `${path}.bak.${timestamp}`;
                await targetSsh.exec(`cp ${path} ${backupPath}`);

                const safeContent = content.replace(/'/g, "'\\''");
                await targetSsh.exec(`echo '${safeContent}' > ${path}`);

                logs.push('Applying changes (ifreload -a)...');
                await targetSsh.exec('ifreload -a');
                logs.push('Network configuration applied.');
            } catch (e) {
                logs.push(`Error cloning network: ${e}`);
            }
        }

        if (options.hosts) {
            await copyFile('Hosts', '/etc/hosts');
        }

        if (options.dns) {
            await copyFile('DNS', '/etc/resolv.conf');
        }

        if (options.timezone) {
            await copyFile('Timezone', '/etc/timezone', 'dpkg-reconfigure -f noninteractive tzdata');
        }

        if (options.locale) {
            await copyFile('Locale', '/etc/locale.gen', 'locale-gen');
        }

        if (options.storage) {
            // Special handling for storage.cfg (Cluster File System)
            logs.push('--- Storage Configuration (Risk: High) ---');
            try {
                const path = '/etc/pve/storage.cfg';
                const content = await sourceSsh.exec(`cat ${path}`);

                // Backup existing (might fail if not exists, which is rare on PVE)
                const backupPath = `/root/storage.cfg.bak.${timestamp}`; // Can't easily backup inside /etc/pve sometimes? standard cp works.
                await targetSsh.exec(`cp ${path} ${backupPath} 2>/dev/null || true`);
                logs.push(`Backed up original to ${backupPath}`);

                const safeContent = content.replace(/'/g, "'\\''");
                await targetSsh.exec(`echo '${safeContent}' > ${path}`);
                logs.push('Storage configuration overwritten.');
            } catch (e) {
                logs.push(`Error cloning storage: ${e}`);
            }
        }

        if (options.tags) {
            logs.push('--- Tags Sync ---');
            try {
                const sourceOptions = await sourceSsh.exec('pvesh get /cluster/options --output-format json');
                const sourceJson = JSON.parse(sourceOptions);
                const tagStyle = sourceJson['tag-style'];

                if (tagStyle) {
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

        return { success: true, message: 'Selected configurations cloned.', details: logs };

    } catch (e: any) {
        return { success: false, message: e.message || String(e), details: logs };
    }
}

