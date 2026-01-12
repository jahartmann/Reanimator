'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Server, HardDrive, CheckCircle2, AlertCircle, XCircle, Clock, RefreshCw, Activity, Wifi, WifiOff, ChevronRight } from "lucide-react";

interface ServerStatus {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    group_name: string | null;
    online: boolean;
    lastBackup: string | null;
    backupAge: number | null;
    backupHealth: 'good' | 'warning' | 'critical' | 'none';
    totalBackups: number;
    totalSize: number;
}

interface MonitoringSummary {
    totalServers: number;
    onlineServers: number;
    offlineServers: number;
    totalBackups: number;
    totalSize: number;
    healthCounts: {
        good: number;
        warning: number;
        critical: number;
        none: number;
    };
    groups: string[];
}

interface MonitoringData {
    servers: ServerStatus[];
    summary: MonitoringSummary;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatBackupAge(hours: number | null): string {
    if (hours === null) return 'Nie';
    if (hours < 1) return 'Gerade eben';
    if (hours < 24) return `vor ${hours}h`;
    const days = Math.floor(hours / 24);
    return `vor ${days}d`;
}

export function MonitoringPanel() {
    const [data, setData] = useState<MonitoringData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    async function fetchData() {
        setLoading(true);
        try {
            const res = await fetch('/api/monitoring');
            const json = await res.json();
            setData(json);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Failed to fetch monitoring data:', err);
        }
        setLoading(false);
    }

    useEffect(() => {
        fetchData();
        // Auto-refresh every 60 seconds
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !data) {
        return (
            <Card className="border-muted/60">
                <CardContent className="p-8 flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    if (!data) {
        return (
            <Card className="border-muted/60">
                <CardContent className="p-8 text-center text-muted-foreground">
                    <p>Monitoring-Daten konnten nicht geladen werden.</p>
                </CardContent>
            </Card>
        );
    }

    const { summary, servers } = data;

    return (
        <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                {/* Server Status */}
                <Card className="overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-green-500 to-emerald-500" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Server Online</p>
                                <p className="text-2xl font-bold">
                                    {summary.onlineServers}
                                    <span className="text-muted-foreground text-lg font-normal">/{summary.totalServers}</span>
                                </p>
                            </div>
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${summary.offlineServers === 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                                }`}>
                                <Activity className={`h-6 w-6 ${summary.offlineServers === 0 ? 'text-green-500' : 'text-red-500'
                                    }`} />
                            </div>
                        </div>
                        {summary.offlineServers > 0 && (
                            <p className="text-xs text-red-500 mt-2">
                                {summary.offlineServers} Server offline
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Backup Health */}
                <Card className="overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Backup-Status</p>
                                <div className="flex items-center gap-3 mt-1">
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full bg-green-500" />
                                        <span className="text-sm font-medium">{summary.healthCounts.good}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                        <span className="text-sm font-medium">{summary.healthCounts.warning}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full bg-red-500" />
                                        <span className="text-sm font-medium">{summary.healthCounts.critical}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                                <CheckCircle2 className="h-6 w-6 text-blue-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Total Backups */}
                <Card className="overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-purple-500 to-pink-500" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Backups gesamt</p>
                                <p className="text-2xl font-bold">{summary.totalBackups}</p>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                                <Clock className="h-6 w-6 text-purple-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Storage Used */}
                <Card className="overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Speicherverbrauch</p>
                                <p className="text-2xl font-bold">{formatBytes(summary.totalSize)}</p>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                                <HardDrive className="h-6 w-6 text-orange-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Server List */}
            <Card className="overflow-hidden border-muted/60">
                <CardHeader className="py-3 px-4 bg-muted/10 flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Server-Übersicht</CardTitle>
                    <div className="flex items-center gap-2">
                        {lastUpdate && (
                            <span className="text-xs text-muted-foreground">
                                Aktualisiert: {lastUpdate.toLocaleTimeString('de-DE')}
                            </span>
                        )}
                        <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y divide-border/50">
                        {servers.map((server) => (
                            <Link
                                key={server.id}
                                href={`/servers/${server.id}`}
                                className="flex items-center gap-4 p-4 hover:bg-muted/5 transition-colors group"
                            >
                                {/* Online Status */}
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${server.online ? 'bg-green-500/10' : 'bg-red-500/10'
                                    }`}>
                                    {server.online ? (
                                        <Wifi className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <WifiOff className="h-5 w-5 text-red-500" />
                                    )}
                                </div>

                                {/* Server Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium truncate">{server.name}</p>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${server.type === 'pve' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'
                                            }`}>
                                            {server.type.toUpperCase()}
                                        </span>
                                        {server.group_name && (
                                            <span className="text-xs text-muted-foreground">
                                                {server.group_name}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {server.totalBackups} Backups · {formatBytes(server.totalSize)}
                                    </p>
                                </div>

                                {/* Backup Health */}
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <div className="flex items-center gap-1.5 justify-end">
                                            {server.backupHealth === 'good' && (
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                            )}
                                            {server.backupHealth === 'warning' && (
                                                <AlertCircle className="h-4 w-4 text-yellow-500" />
                                            )}
                                            {server.backupHealth === 'critical' && (
                                                <XCircle className="h-4 w-4 text-red-500" />
                                            )}
                                            {server.backupHealth === 'none' && (
                                                <Clock className="h-4 w-4 text-muted-foreground" />
                                            )}
                                            <span className={`text-sm font-medium ${server.backupHealth === 'good' ? 'text-green-500' :
                                                    server.backupHealth === 'warning' ? 'text-yellow-500' :
                                                        server.backupHealth === 'critical' ? 'text-red-500' :
                                                            'text-muted-foreground'
                                                }`}>
                                                {formatBackupAge(server.backupAge)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">Letztes Backup</p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
