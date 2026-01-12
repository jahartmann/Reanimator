'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, Plus, Server, Clock, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { MigrationTask } from '@/app/actions/migration';

export default function MigrationsPage() {
    const [tasks, setTasks] = useState<MigrationTask[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 3000); // Poll every 3s
        return () => clearInterval(interval);
    }, []);

    async function fetchTasks() {
        try {
            const res = await fetch('/api/migrations');
            if (res.ok) {
                const data = await res.json();
                setTasks(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const statusConfig = {
        pending: { icon: Clock, color: 'bg-gray-500/10 text-gray-500', label: 'Wartend', animate: false },
        running: { icon: Loader2, color: 'bg-blue-500/10 text-blue-500', label: 'Läuft', animate: true },
        completed: { icon: CheckCircle, color: 'bg-green-500/10 text-green-500', label: 'Abgeschlossen', animate: false },
        failed: { icon: XCircle, color: 'bg-red-500/10 text-red-500', label: 'Fehlgeschlagen', animate: false },
        cancelled: { icon: AlertTriangle, color: 'bg-amber-500/10 text-amber-500', label: 'Abgebrochen', animate: false },
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Server-Migrationen</h1>
                    <p className="text-muted-foreground">Vollständige Migrationen zwischen Servern</p>
                </div>
                <Link href="/migrations/new">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Neue Migration
                    </Button>
                </Link>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : tasks.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <ArrowRightLeft className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium">Keine Migrationen</h3>
                        <p className="text-muted-foreground text-sm">Starten Sie eine neue Server-Migration</p>
                        <Link href="/migrations/new">
                            <Button className="mt-4">Erste Migration starten</Button>
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {tasks.map((task) => {
                        const config = statusConfig[task.status] || statusConfig.pending;
                        const Icon = config.icon;
                        const progressPercent = task.total_steps > 0 ? Math.round((task.progress / task.total_steps) * 100) : 0;

                        return (
                            <Link key={task.id} href={`/migrations/${task.id}`}>
                                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${config.color}`}>
                                                <Icon className={`h-6 w-6 ${config.animate ? 'animate-spin' : ''}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium">{task.source_name}</span>
                                                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                                                    <span className="font-medium">{task.target_name}</span>
                                                    <Badge variant="secondary" className={config.color}>
                                                        {config.label}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                    <span>{task.progress}/{task.total_steps} Schritte</span>
                                                    {task.current_step && (
                                                        <span className="truncate">• {task.current_step}</span>
                                                    )}
                                                </div>
                                                {task.status === 'running' && (
                                                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary transition-all duration-500"
                                                            style={{ width: `${progressPercent}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground text-right">
                                                {task.created_at && new Date(task.created_at).toLocaleDateString('de-DE', {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
