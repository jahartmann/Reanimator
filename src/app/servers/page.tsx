import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Server, Trash2 } from "lucide-react";
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

interface ServerItem {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    url: string;
    status: string;
}

async function deleteServer(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    db.prepare('DELETE FROM servers WHERE id = ?').run(parseInt(id));
    revalidatePath('/servers');
}

export default function ServersPage() {
    const servers = db.prepare('SELECT * FROM servers ORDER BY id DESC').all() as ServerItem[];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Server</h1>
                    <p className="text-muted-foreground">Proxmox VE und PBS Server verwalten</p>
                </div>
                <Link href="/servers/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Server hinzufügen
                    </Button>
                </Link>
            </div>

            {servers.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Server className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Keine Server</h3>
                        <p className="text-muted-foreground text-center mb-4">
                            Fügen Sie Ihren ersten Proxmox-Server hinzu.
                        </p>
                        <Link href="/servers/new">
                            <Button>Server hinzufügen</Button>
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {servers.map((server) => (
                        <Card key={server.id}>
                            <CardContent className="flex items-center justify-between p-6">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${server.type === 'pve' ? 'bg-blue-500/20' : 'bg-green-500/20'
                                        }`}>
                                        <Server className={`h-5 w-5 ${server.type === 'pve' ? 'text-blue-500' : 'text-green-500'
                                            }`} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{server.name}</h3>
                                        <p className="text-sm text-muted-foreground">
                                            {server.type.toUpperCase()} · {server.url}
                                        </p>
                                    </div>
                                </div>
                                <form action={deleteServer}>
                                    <input type="hidden" name="id" value={server.id} />
                                    <Button variant="ghost" size="icon" className="text-red-500">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
