import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Server, FolderCog } from "lucide-react";
import ConfigList from './ConfigList';
import { revalidatePath } from 'next/cache';
import { BackupButton } from './BackupButton';

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
                <ConfigList servers={servers} backupsByServer={backupsByServer} />
            )}
        </div>
    );
}
