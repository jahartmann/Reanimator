'use server';

import { createSSHClient } from '@/lib/ssh';
import db from '@/lib/db';

export interface VirtualMachine {
    vmid: string;
    name: string;
    status: 'running' | 'stopped';
    type: 'qemu' | 'lxc';
    cpus?: number;
    memory?: number;
    uptime?: number;
}

export interface MigrationOptions {
    targetServerId: number;
    targetStorage: string;
    targetBridge: string;
    online: boolean;
}

// Helper to get server details
async function getServer(id: number) {
    const stmt = db.prepare('SELECT * FROM servers WHERE id = ?');
    const server = stmt.get(id) as any;
    if (!server) throw new Error(`Server ${id} not found`);
    return server;
}

export async function getVMs(serverId: number): Promise<VirtualMachine[]> {
    const server = await getServer(serverId);
    const ssh = createSSHClient({
        ssh_host: server.ssh_host,
        ssh_port: server.ssh_port,
        ssh_user: server.ssh_user,
        ssh_key: server.ssh_key
    });

    try {
        await ssh.connect();

        // Determine local node name
        const nodeName = (await ssh.exec('hostname')).trim();

        // Fetch QEMU (VMs) and LXC (Containers) in parallel
        // using pvesh for structured JSON output
        const [qemuJson, lxcJson] = await Promise.all([
            ssh.exec(`pvesh get /nodes/${nodeName}/qemu --output-format json 2>/dev/null || echo "[]"`),
            ssh.exec(`pvesh get /nodes/${nodeName}/lxc --output-format json 2>/dev/null || echo "[]"`)
        ]);

        const qemuList = JSON.parse(qemuJson);
        const lxcList = JSON.parse(lxcJson);

        const vms: VirtualMachine[] = [
            ...qemuList.map((vm: any) => ({
                vmid: vm.vmid,
                name: vm.name,
                status: vm.status,
                type: 'qemu',
                cpus: vm.cpus,
                memory: vm.maxmem, // maxmem is usually what we see as "Memory"
                uptime: vm.uptime
            })),
            ...lxcList.map((lxc: any) => ({
                vmid: lxc.vmid,
                name: lxc.name,
                status: lxc.status,
                type: 'lxc',
                cpus: lxc.cpus,
                memory: lxc.maxmem,
                uptime: lxc.uptime
            }))
        ];

        // Sort by VMID
        return vms.sort((a, b) => parseInt(a.vmid) - parseInt(b.vmid));

    } catch (error) {
        console.error('Failed to fetch VMs:', error);
        return [];
    } finally {
        await ssh.disconnect();
    }
}

export async function migrateVM(
    sourceId: number,
    vmid: string,
    type: 'qemu' | 'lxc',
    options: MigrationOptions
) {
    const source = await getServer(sourceId);
    const target = await getServer(options.targetServerId);

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

    let tempTokenId = `mig${Date.now()}`;
    let tempTokenSecret = '';

    try {
        // 1. Connect to Target to generate a temporary API Token
        // This is needed because remote-migrate requires an API endpoint + token
        await targetSsh.connect();
        const targetNode = (await targetSsh.exec('hostname')).trim();

        // Generate token: pveum user token add root@pam <id> --privsep 0 --output-format json
        // We grep the value from the output
        const tokenCmd = `pveum user token add root@pam ${tempTokenId} --privsep 0 --output-format json`;
        const tokenJson = await targetSsh.exec(tokenCmd);
        const tokenData = JSON.parse(tokenJson);
        tempTokenSecret = tokenData.value; // The secret value

        // Construct API Token string: root@pam!mig123456=uuid-secret
        const apiToken = `root@pam!${tempTokenId}=${tempTokenSecret}`;

        // Construct Remote Endpoint
        // "host=192.168.1.5,apitoken=root@pam!mig...=...,fingerprint=..."
        const fpCmd = `openssl x509 -noout -fingerprint -sha256 -in /etc/pve/local/pve-ssl.pem | cut -d= -f2`;
        const fingerprint = (await targetSsh.exec(fpCmd)).trim();

        // 2. Connect to Source
        await sourceSsh.connect();

        // 3. Construct Migration Command
        // qm remote-migrate <vmid> <target-vmid> '<api-endpoint>' --target-bridge <bridge> --target-storage <storage> --online
        const targetVmid = vmid;

        // API Endpoint string format: 'host=IP,apitoken=TOKEN,fingerprint=FP'
        const apiEndpoint = `host=${target.ssh_host},apitoken=${apiToken},fingerprint=${fingerprint}`;

        // Command
        let cmd = '';
        if (type === 'qemu') {
            cmd = `/usr/sbin/qm remote-migrate ${vmid} ${targetVmid} '${apiEndpoint}' --target-bridge ${options.targetBridge} --target-storage ${options.targetStorage}`;
            if (options.online) cmd += ` --online`;
        } else {
            // pct remote-migrate <vmid> <target-vmid> '<api-endpoint>' --target-bridge <bridge> --target-storage <storage>
            cmd = `/usr/sbin/pct remote-migrate ${vmid} ${targetVmid} '${apiEndpoint}' --target-bridge ${options.targetBridge} --target-storage ${options.targetStorage}`;
        }

        console.log('[Migration] Running:', cmd);

        // Execute (Long timeout)
        const output = await sourceSsh.exec(cmd, 600 * 1000);

        return { success: true, message: output };

    } catch (e) {
        console.error('[Migration] Failed:', e);
        return { success: false, message: String(e) };
    } finally {
        // Cleanup Token on Target
        try {
            if (tempTokenSecret) {
                await targetSsh.exec(`pveum user token delete root@pam ${tempTokenId}`);
            }
        } catch (cleanupErr) {
            console.error('Failed to cleanup temp token:', cleanupErr);
        }

        await sourceSsh.disconnect();
        await targetSsh.disconnect();
    }
}

export async function getTargetResources(serverId: number) {
    const server = await getServer(serverId);
    const ssh = createSSHClient({
        ssh_host: server.ssh_host,
        ssh_port: server.ssh_port,
        ssh_user: server.ssh_user,
        ssh_key: server.ssh_key
    });

    try {
        await ssh.connect();
        const nodeName = (await ssh.exec('hostname')).trim();

        // 1. Fetch Storages (pvesm status)
        const storageCmd = `pvesm status -content images -enabled 1 2>/dev/null | awk 'NR>1 {print $1}'`;
        const storageOutput = await ssh.exec(storageCmd);
        const storages = storageOutput.split('\n').map(s => s.trim()).filter(s => s.length > 0);

        // 2. Fetch Bridges
        const bridgeCmd = `ls /sys/class/net/ | grep "^vmbr" || echo "vmbr0"`;
        const bridgeOutput = await ssh.exec(bridgeCmd);
        const bridges = bridgeOutput.split('\n').map(s => s.trim()).filter(s => s.length > 0);

        return { storages, bridges };
    } catch (error) {
        console.error('Failed to fetch target resources:', error);
        return { storages: ['local', 'local-lvm'], bridges: ['vmbr0'] }; // Fallback
    } finally {
        await ssh.disconnect();
    }
}
