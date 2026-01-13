import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Server, Network, HardDrive, Cpu, Wifi, WifiOff, Clock, Gauge, Activity, Database, Box, Settings, Tags } from "lucide-react";
import { createSSHClient } from '@/lib/ssh';
import { ServerVisualization } from '@/components/ui/ServerVisualization';
import { getVMs } from '@/app/actions/vm';
import { VirtualMachineList } from '@/components/vm/VirtualMachineList';
import TagManagement from '@/components/ui/TagManagement';
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { getTags } from '@/app/actions/tags';
import { getServerInfo } from '@/app/actions/monitoring';
import EditServerDialog from '@/components/server/EditServerDialog';

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
// ... (omitting intermediate interfaces as they are unchanged)

// ... (omitting helper functions)

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

    const [info, vms, availableTags] = await Promise.all([
        getServerInfo(server),
        getVMs(serverId),
        getTags()
    ]);

    const otherServers = db.prepare('SELECT id, name FROM servers WHERE id != ?').all(serverId) as { id: number; name: string }[];


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
                    <div className="ml-auto flex items-center gap-2">
                        <EditServerDialog server={{
                            ...server,
                            group_name: server.group_name || undefined,
                            // ensure undefined types match what component expects if needed, 
                            // but 'as any' or explicit spread works.
                            // Actually Interface matches closely.
                        }} />
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Tags className="h-4 w-4 mr-2" />
                                    Tags
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                <TagManagement serverId={serverId} />
                            </DialogContent>
                        </Dialog>
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
                            pools={info.pools as any}
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
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-xl font-semibold flex items-center gap-2">
                                                <Network className="h-5 w-5" />
                                                Netzwerkschnittstellen
                                            </h2>
                                            <Link href={`/servers/${id}/network`}>
                                                <Button variant="outline" size="sm">
                                                    <Settings className="h-4 w-4 mr-2" />
                                                    Konfigurieren
                                                </Button>
                                            </Link>
                                        </div>
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

                        {/* Virtual Machines */}
                        <div className="lg:col-span-2">
                            <VirtualMachineList
                                vms={vms}
                                currentServerId={serverId}
                                otherServers={otherServers}
                                availableTags={availableTags}
                            />
                        </div>

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
                                    <div className="space-y-8">
                                        {/* Physical Disks */}
                                        {info.disks.filter(d => d.type === 'disk' && (
                                            (d.transport && ['nvme', 'sata', 'sas', 'scsi', 'usb', 'ata', 'ide'].includes(d.transport.toLowerCase())) ||
                                            (!d.name.startsWith('rbd') && !d.name.startsWith('dm-') && !d.name.startsWith('zd') && d.size.includes('T') || d.size.includes('G'))
                                        )).length > 0 && (
                                                <div>
                                                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                                                        <HardDrive className="h-4 w-4" />
                                                        Physische Datenträger ({info.disks.filter(d => d.type === 'disk' && (
                                                            (d.transport && ['nvme', 'sata', 'sas', 'scsi', 'usb', 'ata', 'ide'].includes(d.transport.toLowerCase())) ||
                                                            (!d.name.startsWith('rbd') && !d.name.startsWith('dm-') && !d.name.startsWith('zd') && (d.size.includes('T') || d.size.includes('G')))
                                                        )).length})
                                                    </h3>
                                                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                                        {info.disks.filter(d => d.type === 'disk' && (
                                                            (d.transport && ['nvme', 'sata', 'sas', 'scsi', 'usb', 'ata', 'ide'].includes(d.transport.toLowerCase())) ||
                                                            (!d.name.startsWith('rbd') && !d.name.startsWith('dm-') && !d.name.startsWith('zd') && (d.size.includes('T') || d.size.includes('G')))
                                                        )).map((disk, i) => (
                                                            <div
                                                                key={i}
                                                                className={`flex flex-col gap-2 p-3 rounded-lg border transition-colors hover:border-emerald-500/30 ${disk.transport === 'nvme' ? 'bg-purple-500/5 border-purple-500/20' :
                                                                    disk.rotational === false ? 'bg-blue-500/5 border-blue-500/20' :
                                                                        'bg-emerald-500/5 border-emerald-500/20'
                                                                    }`}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <HardDrive className={`h-5 w-5 shrink-0 ${disk.transport === 'nvme' ? 'text-purple-500' :
                                                                        disk.rotational === false ? 'text-blue-500' :
                                                                            'text-emerald-500'
                                                                        }`} />
                                                                    <div className="min-w-0">
                                                                        <p className="font-medium font-mono text-sm">{disk.name}</p>
                                                                        <p className="text-xs text-muted-foreground truncate">
                                                                            {disk.model || 'Generic Disk'}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between text-xs mt-1">
                                                                    <span className="font-medium text-base">{disk.size}</span>
                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${disk.transport === 'nvme' ? 'bg-purple-500/20 text-purple-500' :
                                                                        disk.rotational === false ? 'bg-blue-500/20 text-blue-500' :
                                                                            'bg-emerald-500/20 text-emerald-500'
                                                                        }`}>
                                                                        {disk.transport === 'nvme' ? 'NVMe' :
                                                                            disk.rotational === false ? 'SSD' : 'HDD'}
                                                                    </span>
                                                                </div>
                                                                {disk.serial && (
                                                                    <div className="text-[10px] text-muted-foreground/50 font-mono truncate">
                                                                        SN: {disk.serial}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                        {/* Virtual/Mapped Disks */}
                                        {info.disks.filter(d => d.type === 'disk' && !(
                                            (d.transport && ['nvme', 'sata', 'sas', 'scsi', 'usb', 'ata', 'ide'].includes(d.transport.toLowerCase())) ||
                                            (!d.name.startsWith('rbd') && !d.name.startsWith('dm-') && !d.name.startsWith('zd') && (d.size.includes('T') || d.size.includes('G')))
                                        )).length > 0 && (
                                                <div>
                                                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                                                        <Box className="h-4 w-4" />
                                                        Virtuelle / Gemappte Datenträger
                                                    </h3>
                                                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                                        {info.disks.filter(d => d.type === 'disk' && !(
                                                            (d.transport && ['nvme', 'sata', 'sas', 'scsi', 'usb', 'ata', 'ide'].includes(d.transport.toLowerCase())) ||
                                                            (!d.name.startsWith('rbd') && !d.name.startsWith('dm-') && !d.name.startsWith('zd') && (d.size.includes('T') || d.size.includes('G')))
                                                        )).map((disk, i) => (
                                                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                                                                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                                                                    <span className="text-xs font-bold text-muted-foreground">V</span>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="font-medium font-mono text-sm">{disk.name}</p>
                                                                        <span className="text-xs text-muted-foreground bg-muted px-1 rounded">{disk.size}</span>
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground/60 truncate">
                                                                        {disk.model || 'Virtual Device'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
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

                    {/* Debug Information */}
                    <Card className="overflow-hidden border-muted/60 bg-muted/5 mt-8">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Activity className="h-4 w-4" />
                                Debug Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="p-4 bg-black/50 font-mono text-xs text-muted-foreground overflow-x-auto max-h-[300px] whitespace-pre-wrap">
                                {info.debug?.join('\n') || 'No debug logs available'}
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
