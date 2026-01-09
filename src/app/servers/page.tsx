import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Server as ServerIcon, Trash2, HardDrive, Cpu } from "lucide-react";
import { deleteServer } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default function ServersPage() {
    const servers = db.prepare('SELECT * FROM servers ORDER BY id DESC').all() as any[];

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Server Management</h2>
                    <p className="text-muted-foreground mt-1">Configure your Proxmox VE and Proxmox Backup Server nodes.</p>
                </div>
                <Link href="/servers/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Server
                    </Button>
                </Link>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {servers.map((server) => (
                    <Card key={server.id} className="relative overflow-hidden transition-shadow hover:shadow-lg border-opacity-50">
                        <div className={`absolute top-0 left-0 w-1 h-full ${server.type === 'pve' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                            <div className="space-y-1">
                                <CardTitle className="text-lg font-medium flex items-center gap-2">
                                    {server.type === 'pve' ? <Cpu className="h-4 w-4 text-orange-500" /> : <HardDrive className="h-4 w-4 text-blue-500" />}
                                    {server.name}
                                </CardTitle>
                                <CardDescription className="text-xs truncate max-w-[200px]">{server.url}</CardDescription>
                            </div>
                            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" title="Online" />
                        </CardHeader>
                        <CardContent>
                            <div className="mt-4 flex items-center justify-between">
                                <div className="text-sm text-muted-foreground">
                                    Status: <span className="text-foreground font-medium uppercase">{server.status}</span>
                                </div>

                                <form action={deleteServer.bind(null, server.id)}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </form>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {servers.length === 0 && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed border-border rounded-lg bg-card/10">
                        <ServerIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                        <p className="text-lg font-medium text-muted-foreground">No servers configured</p>
                        <p className="text-sm text-muted-foreground/80 mb-6">Add a PVE or PBS node to get started.</p>
                        <Link href="/servers/new">
                            <Button variant="outline">Add First Server</Button>
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
