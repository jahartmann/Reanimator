'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Server, FolderCog, Trash2, Clock, FileText, Search, HardDrive } from "lucide-react";
import { BackupButton } from './BackupButton';
import { deleteConfigBackup } from '@/app/actions/configBackup';

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

interface ConfigListProps {
    servers: ServerItem[];
    backupsByServer: Record<number, ConfigBackup[]>;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function handleDelete(itemId: number) {
    if (confirm('Möchten Sie dieses Backup wirklich löschen?')) {
        await deleteConfigBackup(itemId);
    }
}

export default function ConfigList({ servers, backupsByServer }: ConfigListProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredServers = servers.filter(server => {
        const term = searchTerm.toLowerCase();
        const matchesName = server.name.toLowerCase().includes(term);
        const matchesType = server.type.toLowerCase().includes(term);
        const matchesUrl = server.url.toLowerCase().includes(term);

        // Also search in backups dates?
        const hasMatchingBackup = backupsByServer[server.id]?.some(backup =>
            new Date(backup.backup_date).toLocaleString('de-DE').toLowerCase().includes(term)
        );

        return matchesName || matchesType || matchesUrl || hasMatchingBackup;
    });

    return (
        <div className="space-y-6">
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Suchen nach Server, Typ oder Backup-Datum..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {filteredServers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <p>Keine Server gefunden, die der Suche entsprechen.</p>
                </div>
            ) : (
                <div className="grid gap-6">
                    {filteredServers.map((server) => (
                        <Card key={server.id} className="overflow-hidden border-muted/60 shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="bg-muted/30 py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${server.type === 'pve'
                                                ? 'bg-orange-500/10 text-orange-600'
                                                : 'bg-blue-500/10 text-blue-600'
                                            }`}>
                                            {server.type === 'pve'
                                                ? <Server className="h-6 w-6" />
                                                : <HardDrive className="h-6 w-6" />
                                            }
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                {server.name}
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${server.type === 'pve'
                                                        ? 'bg-orange-50 text-orange-600 border-orange-200'
                                                        : 'bg-blue-50 text-blue-600 border-blue-200'
                                                    }`}>
                                                    {server.type}
                                                </span>
                                            </CardTitle>
                                            <CardDescription className="flex items-center gap-1.5 mt-1">
                                                <span className="truncate max-w-[300px]">{server.url}</span>
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <BackupButton serverId={server.id} />
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {!backupsByServer[server.id] || backupsByServer[server.id].length === 0 ? (
                                    <div className="p-8 text-center text-muted-foreground bg-muted/5">
                                        <Clock className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                        <p>Noch keine Backups vorhanden</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border/50">
                                        {backupsByServer[server.id].slice(0, 5).map((backup) => (
                                            <div key={backup.id} className="p-4 flex items-center gap-4 hover:bg-muted/5 transition-colors group">
                                                <div className="h-10 w-10 rounded-lg bg-background border flex items-center justify-center shrink-0">
                                                    <Clock className="h-5 w-5 text-muted-foreground/70" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-medium truncate">
                                                            {new Date(backup.backup_date).toLocaleString('de-DE', {
                                                                dateStyle: 'medium',
                                                                timeStyle: 'short'
                                                            })}
                                                        </p>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                                        <span>{backup.file_count} Dateien</span>
                                                        <span>•</span>
                                                        <span>{formatBytes(backup.total_size)}</span>
                                                    </p>
                                                </div>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Link href={`/configs/${backup.id}`}>
                                                        <Button variant="secondary" size="sm" className="h-8">
                                                            <FileText className="mr-2 h-3.5 w-3.5" />
                                                            Details
                                                        </Button>
                                                    </Link>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                                        onClick={() => handleDelete(backup.id)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
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
        </div>
    );
}
