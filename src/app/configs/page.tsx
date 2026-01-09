'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft, FolderCog, Server, Download, RefreshCw,
    Trash2, Loader2, CheckCircle2, AlertCircle, Clock,
    HardDrive, FileText, ChevronRight
} from "lucide-react";

interface Server {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    url: string;
    ssh_host?: string;
}

interface ConfigBackup {
    id: number;
    server_id: number;
    backup_path: string;
    backup_date: string;
    file_count: number;
    total_size: number;
    status: string;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
    return new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(dateStr));
}

export default function ConfigurationsPage() {
    const [servers, setServers] = useState<Server[]>([]);
    const [backups, setBackups] = useState<Record<number, ConfigBackup[]>>({});
    const [loading, setLoading] = useState(true);
    const [backupInProgress, setBackupInProgress] = useState<number | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const res = await fetch('/api/servers');
            const serverData = await res.json();
            setServers(serverData);

            // Load backups for each server
            const backupData: Record<number, ConfigBackup[]> = {};
            for (const server of serverData) {
                const backupRes = await fetch(`/api/config-backups?serverId=${server.id}`);
                backupData[server.id] = await backupRes.json();
            }
            setBackups(backupData);
        } catch (err) {
            console.error('Failed to load data:', err);
        }
        setLoading(false);
    }

    async function handleBackup(serverId: number) {
        setBackupInProgress(serverId);
        setMessage(null);

        try {
            const res = await fetch('/api/config-backups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId })
            });
            const result = await res.json();

            setMessage({
                type: result.success ? 'success' : 'error',
                text: result.message
            });

            if (result.success) {
                loadData();
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Backup fehlgeschlagen' });
        }

        setBackupInProgress(null);
    }

    async function handleDelete(backupId: number) {
        if (!confirm('Möchten Sie dieses Backup wirklich löschen?')) return;

        try {
            const res = await fetch(`/api/config-backups/${backupId}`, { method: 'DELETE' });
            const result = await res.json();

            setMessage({
                type: result.success ? 'success' : 'error',
                text: result.message
            });

            if (result.success) {
                loadData();
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Löschen fehlgeschlagen' });
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        Konfigurationen
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Server-Konfigurationen sichern und wiederherstellen
                    </p>
                </div>
                <Button variant="outline" onClick={loadData} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Aktualisieren
                </Button>
            </div>

            {message && (
                <div className={`p-4 rounded-lg border flex items-center gap-3 ${message.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}>
                    {message.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    {message.text}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : servers.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Server className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Keine Server konfiguriert</h3>
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
                        <Card key={server.id} className="overflow-hidden">
                            <CardHeader className="bg-muted/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${server.type === 'pve' ? 'bg-blue-500/20' : 'bg-green-500/20'
                                            }`}>
                                            <FolderCog className={`h-5 w-5 ${server.type === 'pve' ? 'text-blue-500' : 'text-green-500'
                                                }`} />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">{server.name}</CardTitle>
                                            <CardDescription>
                                                {server.type.toUpperCase()} · {server.ssh_host || new URL(server.url).hostname}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => handleBackup(server.id)}
                                        disabled={backupInProgress !== null}
                                    >
                                        {backupInProgress === server.id ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <Download className="mr-2 h-4 w-4" />
                                        )}
                                        Jetzt sichern
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {!backups[server.id] || backups[server.id].length === 0 ? (
                                    <div className="p-6 text-center text-muted-foreground">
                                        Noch keine Backups vorhanden
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border">
                                        {backups[server.id].slice(0, 5).map((backup) => (
                                            <div key={backup.id} className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                                                <Clock className="h-5 w-5 text-muted-foreground" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium">
                                                        {formatDate(backup.backup_date)}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {backup.file_count} Dateien · {formatBytes(backup.total_size)}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Link href={`/configs/${backup.id}`}>
                                                        <Button variant="ghost" size="sm">
                                                            <FileText className="mr-2 h-4 w-4" />
                                                            Anzeigen
                                                        </Button>
                                                    </Link>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(backup.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
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

            {/* Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <HardDrive className="h-5 w-5" />
                        Gesicherte Pfade
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="font-semibold mb-2 text-blue-400">Proxmox VE</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li><code>/etc/pve/</code> - Cluster & VM Configs</li>
                                <li><code>/etc/network/interfaces</code> - Netzwerk</li>
                                <li><code>/etc/hostname</code>, <code>/etc/hosts</code></li>
                                <li><code>/etc/ssh/sshd_config</code></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-2 text-green-400">Proxmox Backup Server</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li><code>/etc/proxmox-backup/</code> - PBS Configs</li>
                                <li><code>/etc/network/interfaces</code> - Netzwerk</li>
                                <li><code>/etc/hostname</code>, <code>/etc/hosts</code></li>
                                <li><code>/etc/ssh/sshd_config</code></li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
