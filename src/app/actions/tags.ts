'use server';

import db from '@/lib/db';
import { createSSHClient } from '@/lib/ssh';

export interface Tag {
    id: number;
    name: string;
    color: string;
}

// Get all tags
export async function getTags(): Promise<Tag[]> {
    return db.prepare('SELECT * FROM tags ORDER BY name').all() as Tag[];
}

// Create a new tag
export async function createTag(name: string, color: string): Promise<{ success: boolean; tag?: Tag; error?: string }> {
    try {
        const stmt = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?) RETURNING *');
        const tag = stmt.get(name, color.replace('#', '')) as Tag;
        return { success: true, tag };
    } catch (e: any) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return { success: false, error: 'Tag already exists' };
        }
        return { success: false, error: String(e) };
    }
}

// Delete a tag
export async function deleteTag(id: number): Promise<{ success: boolean }> {
    db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    return { success: true };
}

// Push tags to Proxmox server (set datacenter.cfg)
export async function pushTagsToServer(serverId: number, tags: Tag[]): Promise<{ success: boolean; message?: string }> {
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

        // Construct color map: "tag1=color,tag2=color"
        // Proxmox format in datacenter.cfg: tag-style: shape=circle,color-map=tag1:FFFFFF;tag2:000000
        const colorMap = tags.map(t => `${t.name}:${t.color}`).join(';');

        // Using pvesh/pveum might not expose tag-style directly easily, so we can edit the config file.
        // Safer: check if we can using 'pvesh set /cluster/options -tag-style ...'
        // According to stats, 'tag-style' is a cluster option.

        const cmd = `pvesh set /cluster/options -tag-style "shape=circle,color-map=${colorMap}"`;

        console.log(`[Tags] Pushing to server ${server.name}: ${cmd}`);
        const output = await ssh.exec(cmd);

        return { success: true, message: output };
    } catch (e) {
        console.error('[Tags] Push failed:', e);
        return { success: false, message: String(e) };
    } finally {
        await ssh.disconnect();
    }
}
