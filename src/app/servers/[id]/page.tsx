import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Server, Network, HardDrive, Cpu, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { createSSHClient } from '@/lib/ssh';

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
        <div className="space-y-6">
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
                        <h1 className="text-2xl font-bold">{server.name}</h1>
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
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* System Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Cpu className="h-5 w-5" />
                                System
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">Hostname</p>
                                    <p className="font-medium">{info.system.hostname}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Betriebssystem</p>
                                    <p className="font-medium">{info.system.os}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Kernel</p>
                                    <p className="font-medium font-mono text-xs">{info.system.kernel}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Uptime</p>
                                    <p className="font-medium">{info.system.uptime}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-muted-foreground">CPU</p>
                                    <p className="font-medium">{info.system.cpu}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-muted-foreground">Memory</p>
                                    <p className="font-medium">{info.system.memory}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Network Interfaces */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Network className="h-5 w-5" />
                                Netzwerk ({info.networks.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {info.networks.map((net) => (
                                    <div key={net.name} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                                        {net.state === 'UP' ? (
                                            <Wifi className="h-5 w-5 text-green-500" />
                                        ) : (
                                            <WifiOff className="h-5 w-5 text-muted-foreground" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium">{net.name}</p>
                                                <span className={`text-xs px-2 py-0.5 rounded ${net.state === 'UP' ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'
                                                    }`}>
                                                    {net.state}
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted-foreground font-mono">
                                                {net.ip} · {net.mac}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Disks */}
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <HardDrive className="h-5 w-5" />
                                Festplatten ({info.disks.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                {info.disks.map((disk, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                                        <HardDrive className={`h-5 w-5 ${disk.type === 'disk' ? 'text-blue-500' : 'text-muted-foreground'
                                            }`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium font-mono">{disk.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {disk.size} · {disk.type} · {disk.mountpoint}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
