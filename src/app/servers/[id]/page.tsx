import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Server, Network, HardDrive, Cpu, Wifi, WifiOff, Clock, Gauge, Activity, Database } from "lucide-react";
import { createSSHClient } from '@/lib/ssh';
import { ServerVisualization } from '@/components/ui/ServerVisualization';

export const dynamic = 'force-dynamic';

interface ServerItem {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    url: string;
    ssh_host?: string;
    ssh_port?: number;
    ssh_user?: string;
    ssh_key?: string;
    group_name?: string | null;
}

interface NetworkInterface {
    name: string;
    ip: string;
    mac: string;
    state: string;
    type: string;
    speed?: string;
    bridge?: string;
    slaves?: string[];
}

interface DiskInfo {
    name: string;
    size: string;
    type: string;
    mountpoint: string;
    model?: string;
    serial?: string;
    filesystem?: string;
    rotational?: boolean;
    transport?: string;
}

interface StoragePool {
    name: string;
    type: 'zfs' | 'ceph' | 'lvm' | 'dir';
    size: string;
    used: string;
    available: string;
    health?: string;
}

interface SystemInfo {
    hostname: string;
    os: string;
    kernel: string;
    uptime: string;
    cpu: string;
    cpuCores: number;
    cpuUsage: number;
    memory: string;
    memoryTotal: number;
    memoryUsed: number;
    memoryUsage: number;
    loadAvg: string;
}

async function getSystemStats(ssh: any) {
    try {
        const [
            hostname,
            osRelease,
            kernel,
            uptime,
            cpuInfo,
            cpuCoresOutput,
            loadAvg,
            cpuUsageOutput,
            memInfoOutput,
            memReadable
        ] = await Promise.all([
            ssh.exec('hostname', 5000).then((o: string) => o.trim()).catch(() => 'Unknown'),
            ssh.exec('cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \\"', 5000).catch(() => 'Unknown'),
            ssh.exec('uname -r', 5000).then((o: string) => o.trim()).catch(() => 'Unknown'),
            ssh.exec('uptime -p', 5000).then((o: string) => o.trim()).catch(() => 'Unknown'),
            ssh.exec('grep "model name" /proc/cpuinfo | head -1 | cut -d: -f2', 5000).then((o: string) => o.trim()).catch(() => 'Unknown'),
            ssh.exec('nproc 2>/dev/null || grep -c processor /proc/cpuinfo', 5000).then((o: string) => o.trim()).catch(() => '1'),
            ssh.exec('cat /proc/loadavg | cut -d" " -f1-3', 5000).then((o: string) => o.trim()).catch(() => '0.00 0.00 0.00'),
            ssh.exec(`top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 2>/dev/null || echo "0"`, 5000).catch(() => '0'),
            ssh.exec(`free -b | grep Mem | awk '{print $2, $3}'`, 5000).catch(() => '0 0'),
            ssh.exec('free -h | grep Mem | awk \'{print $2 " total, " $3 " used"}\'', 5000).then((o: string) => o.trim()).catch(() => '-')
        ]);

        const cpuCores = parseInt(cpuCoresOutput) || 1;
        const cpuUsage = parseFloat(cpuUsageOutput.trim()) || 0;

        const memParts = memInfoOutput.trim().split(/\s+/);
        const memoryTotal = parseInt(memParts[0]) || 0;
        const memoryUsed = parseInt(memParts[1]) || 0;
        const memoryUsage = memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0;

        return {
            hostname,
            os: osRelease.trim(),
            kernel,
            uptime,
            cpu: cpuInfo,
            cpuCores,
            cpuUsage,
            memory: memReadable,
            memoryTotal,
            memoryUsed,
            memoryUsage,
            loadAvg
        };
    } catch (e) {
        console.error('Failed to fetch system stats:', e);
        return {
            hostname: 'Error',
            os: 'Unknown',
            kernel: 'Unknown',
            uptime: '-',
            cpu: 'Unknown',
            cpuCores: 1,
            cpuUsage: 0,
            memory: '-',
            memoryTotal: 0,
            memoryUsed: 0,
            memoryUsage: 0,
            loadAvg: '-'
        };
    }
}

async function getNetworkStats(ssh: any) {
    try {
        const netOutput = await ssh.exec(`ip -j addr 2>/dev/null || ip addr`, 30000);
        console.log('[Network] Raw output:', netOutput.substring(0, 200));
        let networks: NetworkInterface[] = [];

        try {
            const netJson = JSON.parse(netOutput);
            networks = netJson
                .filter((iface: any) => iface.ifname !== 'lo')
                .map((iface: any) => ({
                    name: iface.ifname,
                    ip: iface.addr_info?.find((a: any) => a.family === 'inet')?.local || '-',
                    mac: iface.address || '-',
                    state: iface.operstate || 'unknown',
                    type: iface.link_type || 'unknown',
                    speed: '',
                    bridge: '',
                    slaves: []
                }));
        } catch {
            // Fallback parsing
            const lines = netOutput.split('\n');
            let current: Partial<NetworkInterface> = {};
            for (const line of lines) {
                if (line.match(/^\d+:/)) {
                    if (current.name && current.name !== 'lo') {
                        networks.push(current as NetworkInterface);
                    }
                    const match = line.match(/^\d+:\s+(\S+):/);
                    current = {
                        name: match?.[1] || '',
                        ip: '-',
                        mac: '-',
                        state: line.includes('UP') ? 'UP' : 'DOWN',
                        type: 'physical'
                    };
                }
                if (line.includes('link/ether')) {
                    const mac = line.match(/link\/ether\s+(\S+)/)?.[1];
                    if (mac) current.mac = mac;
                }
                if (line.includes('inet ') && !line.includes('inet6')) {
                    const ip = line.match(/inet\s+(\S+)/)?.[1]?.split('/')[0];
                    if (ip) current.ip = ip;
                }
            }
            if (current.name && current.name !== 'lo') {
                networks.push(current as NetworkInterface);
            }
        }

        // Enrich networks in parallel
        await Promise.all(networks.map(async (net) => {
            try {
                // We use Promise.allSettled here to avoid one interface check blocking others
                const [brOutput, bondOutput, speedOutput, masterOutput] = await Promise.all([
                    ssh.exec(`ls /sys/class/net/${net.name}/brif 2>/dev/null || echo ""`, 5000).catch(() => ''),
                    ssh.exec(`cat /sys/class/net/${net.name}/bonding/slaves 2>/dev/null || echo ""`, 5000).catch(() => ''),
                    ssh.exec(`cat /sys/class/net/${net.name}/speed 2>/dev/null || echo ""`, 5000).catch(() => ''),
                    ssh.exec(`cat /sys/class/net/${net.name}/master/uevent 2>/dev/null | grep INTERFACE | cut -d= -f2 || echo ""`, 5000).catch(() => '')
                ]);

                if (brOutput.trim()) {
                    net.type = 'bridge';
                    net.slaves = brOutput.trim().split('\n').filter(Boolean);
                }

                if (bondOutput.trim()) {
                    net.type = 'bond';
                    net.slaves = bondOutput.trim().split(' ').filter(Boolean);
                }

                if (speedOutput.trim() && !isNaN(parseInt(speedOutput.trim()))) {
                    const speed = parseInt(speedOutput.trim());
                    net.speed = speed >= 1000 ? `${speed / 1000}Gbps` : `${speed}Mbps`;
                }

                if (masterOutput.trim()) {
                    net.bridge = masterOutput.trim();
                }
            } catch (e) {
                // Ignore enrichment errors
            }
        }));

        console.log('[Network] Parsed', networks.length, 'interfaces');
        return networks;
    } catch (e) {
        console.error('Failed to fetch network stats:', e);
        return [];
    }
}

async function getDiskStats(ssh: any) {
    try {
        const diskOutput = await ssh.exec(`lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL,SERIAL,FSTYPE,ROTA,TRAN 2>/dev/null || lsblk -o NAME,SIZE,TYPE,MOUNTPOINT`, 30000);
        console.log('[Disk] Raw output:', diskOutput.substring(0, 200));
        let disks: DiskInfo[] = [];
        try {
            const diskJson = JSON.parse(diskOutput);
            const flatten = (devices: any[]): DiskInfo[] => {
                let result: DiskInfo[] = [];
                for (const dev of devices) {
                    if (dev.type === 'disk' || dev.type === 'part') {
                        result.push({
                            name: dev.name,
                            size: dev.size,
                            type: dev.type,
                            mountpoint: dev.mountpoint || '-',
                            model: dev.model || '',
                            serial: dev.serial || '',
                            filesystem: dev.fstype || '',
                            rotational: dev.rota === '1' || dev.rota === true,
                            transport: dev.tran || ''
                        });
                    }
                    if (dev.children) {
                        result = result.concat(flatten(dev.children));
                    }
                }
                return result;
            };
            disks = flatten(diskJson.blockdevices || []);
        } catch {
            // Fallback
            const lines = diskOutput.split('\n').slice(1);
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    disks.push({
                        name: parts[0].replace(/[├└─│]/g, '').trim(),
                        size: parts[1],
                        type: parts[2],
                        mountpoint: parts[3] || '-'
                    });
                }
            }
        }
        console.log('[Disk] Parsed', disks.length, 'disks');
        return disks.filter(d => d.name);
    } catch (e) {
        console.error('Failed to fetch disk stats:', e);
        return [];
    }
}

async function getPoolStats(ssh: any) {
    const pools: StoragePool[] = [];

    // ZFS, Ceph, LVM in parallel
    const [zfsRes, cephRes, lvmRes] = await Promise.allSettled([
        ssh.exec(`zpool list -H -o name,size,alloc,free,health 2>/dev/null || echo ""`, 10000),
        ssh.exec(`ceph df -f json 2>/dev/null | jq -r '.pools[] | [.name, .stats.stored, .stats.max_avail] | @tsv' 2>/dev/null || echo ""`, 10000),
        ssh.exec(`vgs --noheadings -o vg_name,vg_size,vg_free 2>/dev/null || echo ""`, 10000)
    ]);

    // ZFS
    if (zfsRes.status === 'fulfilled' && zfsRes.value.trim()) {
        for (const line of zfsRes.value.trim().split('\n')) {
            const parts = line.split('\t').filter(Boolean);
            if (parts.length >= 4) {
                pools.push({
                    name: parts[0],
                    type: 'zfs',
                    size: parts[1],
                    used: parts[2],
                    available: parts[3],
                    health: parts[4] || 'UNKNOWN'
                });
            }
        }
    }

    // Ceph
    if (cephRes.status === 'fulfilled' && cephRes.value.trim()) {
        for (const line of cephRes.value.trim().split('\n')) {
            const parts = line.split('\t').filter(Boolean);
            if (parts.length >= 2) {
                pools.push({
                    name: parts[0],
                    type: 'ceph',
                    size: '-',
                    used: formatBytesSimple(parseInt(parts[1]) || 0),
                    available: formatBytesSimple(parseInt(parts[2]) || 0)
                });
            }
        }
    }

    // LVM
    if (lvmRes.status === 'fulfilled' && lvmRes.value.trim()) {
        for (const line of lvmRes.value.trim().split('\n')) {
            const parts = line.trim().split(/\s+/).filter(Boolean);
            if (parts.length >= 3) {
                pools.push({
                    name: parts[0],
                    type: 'lvm',
                    size: parts[1],
                    used: '-',
                    available: parts[2]
                });
            }
        }
    }

    return pools;
}

async function getServerInfo(server: ServerItem): Promise<{
    networks: NetworkInterface[];
    disks: DiskInfo[];
    pools: StoragePool[];
    system: SystemInfo;
} | null> {
    if (!server.ssh_key) return null;

    let ssh;
    try {
        ssh = createSSHClient(server);
        await ssh.connect();

        // Parallel fetching of all major sections
        // Note: each function handles its own errors and returns fallback data (empty array or default obj)
        const [system, networks, disks, pools] = await Promise.all([
            getSystemStats(ssh),
            getNetworkStats(ssh),
            getDiskStats(ssh),
            getPoolStats(ssh)
        ]);

        ssh.disconnect();

        return {
            networks,
            disks,
            pools,
            system
        };
    } catch (e) {
        console.error('[ServerDetail] Connection Error:', e);
        if (ssh) {
            try { ssh.disconnect(); } catch { }
        }
        return null;
    }
}

function formatBytesSimple(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default async function ServerDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const serverId = parseInt(id);

    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as ServerItem | undefined;

    if (!server) {
        return (
            <div className="text-center py-20">
                <h1 className="text-2xl font-bold">Server nicht gefunden</h1>
                <Link href="/servers">
                    <Button className="mt-4">Zurück</Button>
                </Link>
            </div>
        );
    }

    const info = await getServerInfo(server);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/servers">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${server.type === 'pve' ? 'bg-orange-500/20' : 'bg-blue-500/20'
                        }`}>
                        <Server className={`h-6 w-6 ${server.type === 'pve' ? 'text-orange-500' : 'text-blue-500'
                            }`} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold">{server.name}</h1>
                            {server.group_name && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                    {server.group_name}
                                </span>
                            )}
                        </div>
                        <p className="text-muted-foreground">
                            {server.type.toUpperCase()} · {server.ssh_host || new URL(server.url).hostname}
                        </p>
                    </div>
                </div>
            </div>

            {!info ? (
                <Card className="border-amber-500/50 bg-amber-500/10">
                    <CardContent className="p-6">
                        <p className="text-amber-400">
                            SSH-Verbindung fehlgeschlagen. Prüfen Sie die SSH-Zugangsdaten.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Server Visualization */}
                    <div className="py-4">
                        <ServerVisualization
                            system={info.system}
                            networks={info.networks}
                            disks={info.disks}
                            pools={info.pools}
                            serverType={server.type}
                        />
                    </div>

                    {/* Detailed Information */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* System Info */}
                        <Card className="overflow-hidden border-muted/60">
                            <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
                                <CardTitle className="flex items-center gap-2">
                                    <Cpu className="h-5 w-5 text-primary" />
                                    System
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-border/50">
                                    <div className="p-4 flex justify-between items-center hover:bg-muted/5 transition-colors">
                                        <span className="text-sm text-muted-foreground">Hostname</span>
                                        <span className="font-mono text-sm bg-muted/30 px-2 py-0.5 rounded">{info.system.hostname}</span>
                                    </div>
                                    <div className="p-4 flex justify-between items-center hover:bg-muted/5 transition-colors">
                                        <span className="text-sm text-muted-foreground">Betriebssystem</span>
                                        <span className="text-sm font-medium">{info.system.os}</span>
                                    </div>
                                    <div className="p-4 flex justify-between items-center hover:bg-muted/5 transition-colors">
                                        <span className="text-sm text-muted-foreground">Kernel</span>
                                        <span className="font-mono text-xs">{info.system.kernel}</span>
                                    </div>
                                    <div className="p-4 flex justify-between items-center hover:bg-muted/5 transition-colors">
                                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                                            <Clock className="h-4 w-4" />
                                            Uptime
                                        </span>
                                        <span className="text-sm font-medium text-green-500">{info.system.uptime}</span>
                                    </div>
                                    <div className="p-4 hover:bg-muted/5 transition-colors">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-sm text-muted-foreground">CPU</span>
                                            <span className="text-sm font-medium">{info.system.cpuCores} Cores · {info.system.cpuUsage.toFixed(1)}%</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{info.system.cpu}</p>
                                    </div>
                                    <div className="p-4 hover:bg-muted/5 transition-colors">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                <Gauge className="h-4 w-4" />
                                                Memory
                                            </span>
                                            <span className="text-sm font-medium">{info.system.memoryUsage.toFixed(1)}%</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{info.system.memory}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Network Interfaces */}
                        <Card className="overflow-hidden border-muted/60">
                            <CardHeader className="bg-gradient-to-r from-purple-500/5 to-transparent">
                                <CardTitle className="flex items-center gap-2">
                                    <Network className="h-5 w-5 text-purple-500" />
                                    Netzwerk ({info.networks.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {info.networks.length === 0 ? (
                                    <div className="p-6 text-center text-muted-foreground">
                                        <Network className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p>Keine Netzwerkdaten verfügbar</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border/50 max-h-[400px] overflow-y-auto">
                                        {info.networks.map((net) => (
                                            <div key={net.name} className="p-4 flex items-start gap-4 hover:bg-muted/5 transition-colors">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${net.state === 'UP' ? 'bg-green-500/10' : 'bg-muted'
                                                    }`}>
                                                    {net.state === 'UP' ? (
                                                        <Wifi className="h-5 w-5 text-green-500" />
                                                    ) : (
                                                        <WifiOff className="h-5 w-5 text-muted-foreground" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="font-medium">{net.name}</p>
                                                        <span className={`text-xs px-2 py-0.5 rounded-full ${net.state === 'UP' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                                                            }`}>
                                                            {net.state}
                                                        </span>
                                                        {net.type === 'bridge' && (
                                                            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-500">Bridge</span>
                                                        )}
                                                        {net.type === 'bond' && (
                                                            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500">Bond</span>
                                                        )}
                                                        {net.speed && (
                                                            <span className="text-xs text-muted-foreground">{net.speed}</span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground font-mono">
                                                        {net.ip} <span className="text-muted-foreground/50">·</span> {net.mac}
                                                    </p>
                                                    {net.slaves && net.slaves.length > 0 && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Ports: {net.slaves.join(', ')}
                                                        </p>
                                                    )}
                                                    {net.bridge && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Bridge: {net.bridge}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Storage Pools */}
                        {info.pools.length > 0 && (
                            <Card className="overflow-hidden border-muted/60">
                                <CardHeader className="bg-gradient-to-r from-cyan-500/5 to-transparent">
                                    <CardTitle className="flex items-center gap-2">
                                        <Database className="h-5 w-5 text-cyan-500" />
                                        Storage Pools ({info.pools.length})
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-border/50">
                                        {info.pools.map((pool) => (
                                            <div key={pool.name} className="p-4 flex items-center gap-4 hover:bg-muted/5 transition-colors">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${pool.type === 'zfs' ? 'bg-cyan-500/10' :
                                                    pool.type === 'ceph' ? 'bg-red-500/10' :
                                                        pool.type === 'lvm' ? 'bg-amber-500/10' :
                                                            'bg-muted'
                                                    }`}>
                                                    <Database className={`h-5 w-5 ${pool.type === 'zfs' ? 'text-cyan-500' :
                                                        pool.type === 'ceph' ? 'text-red-500' :
                                                            pool.type === 'lvm' ? 'text-amber-500' :
                                                                'text-muted-foreground'
                                                        }`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-medium">{pool.name}</p>
                                                        <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${pool.type === 'zfs' ? 'bg-cyan-500/10 text-cyan-500' :
                                                            pool.type === 'ceph' ? 'bg-red-500/10 text-red-500' :
                                                                pool.type === 'lvm' ? 'bg-amber-500/10 text-amber-500' :
                                                                    'bg-muted text-muted-foreground'
                                                            }`}>
                                                            {pool.type}
                                                        </span>
                                                        {pool.health && (
                                                            <span className={`text-xs ${pool.health === 'ONLINE' ? 'text-green-500' :
                                                                pool.health === 'DEGRADED' ? 'text-amber-500' :
                                                                    'text-red-500'
                                                                }`}>
                                                                {pool.health}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        {pool.used} used · {pool.available} available · {pool.size} total
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Disks */}
                        <Card className={`overflow-hidden border-muted/60 ${info.pools.length === 0 ? 'lg:col-span-2' : ''}`}>
                            <CardHeader className="bg-gradient-to-r from-emerald-500/5 to-transparent">
                                <CardTitle className="flex items-center gap-2">
                                    <HardDrive className="h-5 w-5 text-emerald-500" />
                                    Festplatten ({info.disks.filter(d => d.type === 'disk').length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                {info.disks.filter(d => d.type === 'disk').length === 0 ? (
                                    <div className="text-center text-muted-foreground py-6">
                                        <HardDrive className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p>Keine Festplattendaten verfügbar</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {info.disks.filter(d => d.type === 'disk').map((disk, i) => (
                                            <div
                                                key={i}
                                                className={`flex flex-col gap-2 p-3 rounded-lg border transition-colors hover:border-primary/30 ${disk.transport === 'nvme' ? 'bg-purple-500/5 border-purple-500/20' :
                                                    disk.rotational === false ? 'bg-blue-500/5 border-blue-500/20' :
                                                        'bg-muted/30 border-transparent'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <HardDrive className={`h-5 w-5 shrink-0 ${disk.transport === 'nvme' ? 'text-purple-500' :
                                                        disk.rotational === false ? 'text-blue-500' :
                                                            'text-muted-foreground'
                                                        }`} />
                                                    <div className="min-w-0">
                                                        <p className="font-medium font-mono text-sm">{disk.name}</p>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {disk.model || disk.transport || 'Unknown'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="font-medium">{disk.size}</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${disk.transport === 'nvme' ? 'bg-purple-500/20 text-purple-500' :
                                                        disk.rotational === false ? 'bg-blue-500/20 text-blue-500' :
                                                            'bg-muted text-muted-foreground'
                                                        }`}>
                                                        {disk.transport === 'nvme' ? 'NVMe' :
                                                            disk.rotational === false ? 'SSD' : 'HDD'}
                                                    </span>
                                                    {disk.filesystem && (
                                                        <span className="text-muted-foreground">{disk.filesystem}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Partitions */}
                                {info.disks.filter(d => d.type === 'part' && d.mountpoint !== '-').length > 0 && (
                                    <div className="mt-4 pt-4 border-t">
                                        <p className="text-xs font-medium text-muted-foreground mb-2">Gemountete Partitionen</p>
                                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                            {info.disks.filter(d => d.type === 'part' && d.mountpoint !== '-').map((part, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs p-2 bg-muted/20 rounded">
                                                    <span className="font-mono">{part.name}</span>
                                                    <span className="text-muted-foreground">→</span>
                                                    <span className="text-primary truncate">{part.mountpoint}</span>
                                                    <span className="text-muted-foreground ml-auto">{part.size}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
