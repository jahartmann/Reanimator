import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Server, Network, HardDrive, Cpu, Wifi, WifiOff, Clock, Gauge, Activity } from "lucide-react";
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
}

interface DiskInfo {
    name: string;
    size: string;
    type: string;
    mountpoint: string;
}

interface SystemInfo {
    hostname: string;
    os: string;
    kernel: string;
    uptime: string;
    cpu: string;
    memory: string;
}

async function getServerInfo(server: ServerItem): Promise<{
    networks: NetworkInterface[];
    disks: DiskInfo[];
    system: SystemInfo;
} | null> {
    if (!server.ssh_key) return null;

    try {
        const ssh = createSSHClient(server);
        await ssh.connect();

        // Get network interfaces
        const netOutput = await ssh.exec(`ip -j addr 2>/dev/null || ip addr`);
        let networks: NetworkInterface[] = [];
        try {
            const netJson = JSON.parse(netOutput);
            networks = netJson
                .filter((iface: any) => iface.ifname !== 'lo')
                .map((iface: any) => ({
                    name: iface.ifname,
                    ip: iface.addr_info?.find((a: any) => a.family === 'inet')?.local || '-',
                    mac: iface.address || '-',
                    state: iface.operstate || 'unknown'
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
                    current = { name: match?.[1] || '', ip: '-', mac: '-', state: line.includes('UP') ? 'UP' : 'DOWN' };
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

        // Get disk info
        const diskOutput = await ssh.exec(`lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT 2>/dev/null || lsblk -o NAME,SIZE,TYPE,MOUNTPOINT`);
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
                            mountpoint: dev.mountpoint || '-'
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

        // Get system info
        const hostname = (await ssh.exec('hostname')).trim();
        const osRelease = await ssh.exec('cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \\"');
        const kernel = (await ssh.exec('uname -r')).trim();
        const uptime = (await ssh.exec('uptime -p')).trim();
        const cpuInfo = (await ssh.exec('grep "model name" /proc/cpuinfo | head -1 | cut -d: -f2')).trim();
        const memInfo = (await ssh.exec('free -h | grep Mem | awk \'{print $2 " total, " $3 " used"}\'')).trim();

        ssh.disconnect();

        return {
            networks,
            disks: disks.filter(d => d.name),
            system: {
                hostname,
                os: osRelease.trim(),
                kernel,
                uptime,
                cpu: cpuInfo || 'Unknown',
                memory: memInfo
            }
        };
    } catch (e) {
        console.error('[ServerDetail] Error:', e);
        return null;
    }
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
                                        <span className="text-sm text-muted-foreground">CPU</span>
                                        <p className="text-sm font-medium mt-1">{info.system.cpu}</p>
                                    </div>
                                    <div className="p-4 hover:bg-muted/5 transition-colors">
                                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                                            <Gauge className="h-4 w-4" />
                                            Memory
                                        </span>
                                        <p className="text-sm font-medium mt-1">{info.system.memory}</p>
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
                                <div className="divide-y divide-border/50">
                                    {info.networks.map((net) => (
                                        <div key={net.name} className="p-4 flex items-center gap-4 hover:bg-muted/5 transition-colors">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${net.state === 'UP' ? 'bg-green-500/10' : 'bg-muted'
                                                }`}>
                                                {net.state === 'UP' ? (
                                                    <Wifi className="h-5 w-5 text-green-500" />
                                                ) : (
                                                    <WifiOff className="h-5 w-5 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium">{net.name}</p>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${net.state === 'UP' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                                                        }`}>
                                                        {net.state}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-muted-foreground font-mono">
                                                    {net.ip} <span className="text-muted-foreground/50">·</span> {net.mac}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Disks */}
                        <Card className="lg:col-span-2 overflow-hidden border-muted/60">
                            <CardHeader className="bg-gradient-to-r from-emerald-500/5 to-transparent">
                                <CardTitle className="flex items-center gap-2">
                                    <HardDrive className="h-5 w-5 text-emerald-500" />
                                    Festplatten ({info.disks.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {info.disks.map((disk, i) => (
                                        <div
                                            key={i}
                                            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:border-primary/30 ${disk.type === 'disk' ? 'bg-blue-500/5 border-blue-500/20' : 'bg-muted/30 border-transparent'
                                                }`}
                                        >
                                            <HardDrive className={`h-5 w-5 ${disk.type === 'disk' ? 'text-blue-500' : 'text-muted-foreground'
                                                }`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium font-mono text-sm">{disk.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {disk.size} · {disk.type}
                                                    {disk.mountpoint !== '-' && (
                                                        <span className="ml-1 text-primary">→ {disk.mountpoint}</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
