import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Server, FolderCog, Download, Trash2, Clock, FileText } from "lucide-react";
import { createConfigBackup, deleteConfigBackup } from '@/app/actions/configBackup';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

interface ServerItem {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    url: string;
    ssh_host?: string;
}

interface ConfigBackup {
    id: number;
    server_id: number;
    backup_date: string;
    file_count: number;
    total_size: number;
}

async function handleBackup(formData: FormData) {
    'use server';
    const serverId = parseInt(formData.get('serverId') as string);
    console.log('[Configs] Creating backup for server', serverId);
    const result = await createConfigBackup(serverId);
    console.log('[Configs] Backup result:', result);
    revalidatePath('/configs');
}

async function handleDelete(formData: FormData) {
    'use server';
    const backupId = parseInt(formData.get('backupId') as string);
    await deleteConfigBackup(backupId);
    revalidatePath('/configs');
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function ConfigsPage() {
    const servers = db.prepare('SELECT * FROM servers ORDER BY id').all() as ServerItem[];
    const allBackups = db.prepare('SELECT * FROM config_backups ORDER BY backup_date DESC').all() as ConfigBackup[];

    // Group backups by server
    const backupsByServer: Record<number, ConfigBackup[]> = {};
    for (const backup of allBackups) {
        if (!backupsByServer[backup.server_id]) {
            backupsByServer[backup.server_id] = [];
        }
        backupsByServer[backup.server_id].push(backup);
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Konfigurationen</h1>
                <p className="text-muted-foreground">Server-Konfigurationen sichern und wiederherstellen</p>
            </div>

            {servers.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Server className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Keine Server</h3>
                        <p className="text-muted-foreground text-center mb-4">
                            Fügen Sie einen Server hinzu, um Konfigurationen zu sichern.
                        </p>
                        <Link href="/servers/new">
                            <Button>Server hinzufügen</Button>
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {servers.map((server) => (
                        <Card key={server.id}>
                            <CardHeader className="bg-muted/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${server.type === 'pve' ? 'bg-blue-500/20' : 'bg-green-500/20'
                                            }`}>
                                            <FolderCog className={`h-5 w-5 ${server.type === 'pve' ? 'text-blue-500' : 'text-green-500'
                                                }`} />
                                        </div>
                                        <div>
                                            <CardTitle>{server.name}</CardTitle>
                                            <CardDescription>{server.type.toUpperCase()}</CardDescription>
                                        </div>
                                    </div>
                                    <form action={handleBackup}>
                                        <input type="hidden" name="serverId" value={server.id} />
                                        <Button type="submit">
                                            <Download className="mr-2 h-4 w-4" />
                                            Jetzt sichern
                                        </Button>
                                    </form>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {!backupsByServer[server.id] || backupsByServer[server.id].length === 0 ? (
                                    <div className="p-6 text-center text-muted-foreground">
                                        Noch keine Backups
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border">
                                        {backupsByServer[server.id].slice(0, 5).map((backup) => (
                                            <div key={backup.id} className="p-4 flex items-center gap-4">
                                                <Clock className="h-5 w-5 text-muted-foreground" />
                                                <div className="flex-1">
                                                    <p className="font-medium">
                                                        {new Date(backup.backup_date).toLocaleString('de-DE')}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {backup.file_count} Dateien · {formatBytes(backup.total_size)}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Link href={`/configs/${backup.id}`}>
                                                        <Button variant="ghost" size="sm">
                                                            <FileText className="mr-2 h-4 w-4" />
                                                            Anzeigen
                                                        </Button>
                                                    </Link>
                                                    <form action={handleDelete}>
                                                        <input type="hidden" name="backupId" value={backup.id} />
                                                        <Button variant="ghost" size="sm" className="text-red-500">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </form>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
