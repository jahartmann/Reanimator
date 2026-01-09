import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Server, FolderCog, HardDrive, Clock, AlertTriangle } from "lucide-react";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getStorageStats } from '@/app/actions/storage';

export const dynamic = 'force-dynamic';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getStats() {
  const serverCount = db.prepare('SELECT COUNT(*) as count FROM servers').get() as { count: number };
  const pveCount = db.prepare("SELECT COUNT(*) as count FROM servers WHERE type = 'pve'").get() as { count: number };
  const pbsCount = db.prepare("SELECT COUNT(*) as count FROM servers WHERE type = 'pbs'").get() as { count: number };
  const configBackupCount = db.prepare('SELECT COUNT(*) as count FROM config_backups').get() as { count: number };

  // Get latest config backups per server
  const recentBackups = db.prepare(`
        SELECT cb.*, s.name as server_name, s.type as server_type
        FROM config_backups cb
        JOIN servers s ON cb.server_id = s.id
        ORDER BY cb.backup_date DESC
        LIMIT 5
    `).all() as any[];

  return {
    servers: { total: serverCount.count, pve: pveCount.count, pbs: pbsCount.count },
    configBackups: configBackupCount.count,
    recentBackups
  };
}

export default async function Dashboard() {
  const stats = getStats();
  const storage = await getStorageStats();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Dashboard
          </h2>
          <p className="text-muted-foreground mt-1">
            Übersicht Ihrer Server-Konfigurationen und Backups.
          </p>
        </div>
        <Link href="/configs">
          <Button>
            <FolderCog className="mr-2 h-4 w-4" />
            Konfigurationen sichern
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors border-l-4 border-l-indigo-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Server</CardTitle>
            <Server className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.servers.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.servers.pve} PVE, {stats.servers.pbs} PBS
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Config Backups</CardTitle>
            <FolderCog className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.configBackups}</div>
            <p className="text-xs text-muted-foreground">
              Gesicherte Konfigurationen
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Speicher belegt</CardTitle>
            <HardDrive className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(storage.used)}</div>
            <p className="text-xs text-muted-foreground">
              {storage.backupCount} Backup-Ordner
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Letztes Backup</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {storage.lastBackup
                ? new Date(storage.lastBackup).toLocaleDateString('de-DE')
                : '--'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {storage.lastBackup
                ? new Date(storage.lastBackup).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                : 'Noch kein Backup'
              }
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Storage Usage */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Speichernutzung
            </CardTitle>
            <CardDescription>
              Lokaler Speicher für Konfigurations-Backups
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="w-full h-4 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${storage.usagePercent > 90 ? 'bg-red-500' :
                      storage.usagePercent > 70 ? 'bg-amber-500' : 'bg-indigo-500'
                    }`}
                  style={{ width: `${Math.min(storage.usagePercent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatBytes(storage.used)} belegt
                </span>
                <span className="font-medium">
                  {storage.usagePercent}%
                </span>
              </div>
              {storage.usagePercent > 80 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-500 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Speicher wird knapp! Alte Backups löschen empfohlen.</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Backups */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Letzte Backups</CardTitle>
            <CardDescription>
              Kürzlich gesicherte Konfigurationen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recentBackups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderCog className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p>Noch keine Backups vorhanden.</p>
                  <Link href="/configs" className="text-primary text-sm hover:underline mt-2 block">
                    Jetzt Konfigurationen sichern →
                  </Link>
                </div>
              ) : (
                stats.recentBackups.map((backup) => (
                  <Link
                    key={backup.id}
                    href={`/configs/${backup.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${backup.server_type === 'pve' ? 'bg-blue-500/20' : 'bg-green-500/20'
                      }`}>
                      <FolderCog className={`h-4 w-4 ${backup.server_type === 'pve' ? 'text-blue-500' : 'text-green-500'
                        }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{backup.server_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {backup.file_count} Dateien · {formatBytes(backup.total_size)}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(backup.backup_date).toLocaleDateString('de-DE')}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
