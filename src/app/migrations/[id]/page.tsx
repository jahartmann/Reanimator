'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    ArrowLeft, ArrowRightLeft, Server, CheckCircle, XCircle,
    Loader2, Clock, AlertTriangle, StopCircle, Trash2
} from "lucide-react";
import { MigrationTask, MigrationStep } from '@/app/actions/migration';

export default function MigrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [task, setTask] = useState<MigrationTask | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTask();
        const interval = setInterval(fetchTask, 2000); // Poll every 2s
        return () => clearInterval(interval);
    }, [id]);

    async function fetchTask() {
        try {
            const res = await fetch(`/api/migrations/${id}`);
            if (res.ok) {
                const data = await res.json();
                setTask(data);
            } else if (res.status === 404) {
                // Stop polling if deleted
                setTask(null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function handleCancel() {
        if (!confirm('Migration wirklich abbrechen und Task löschen?')) return;

        try {
            await fetch(`/api/migrations/${id}`, { method: 'DELETE' });
            router.push('/migrations');
        } catch (e) {
            console.error(e);
        }
    }

    async function handleDelete() {
        if (!confirm('Diesen Eintrag unwiderruflich aus dem Verlauf löschen?')) return;
        try {
            await fetch(`/api/migrations/${id}`, { method: 'DELETE' });
            router.push('/migrations');
        } catch (e) {
            console.error(e);
        }
    }

    const statusConfig = {
        pending: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Wartend', animate: false },
        running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Läuft', animate: true },
        completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Abgeschlossen', animate: false },
        failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Fehlgeschlagen', animate: false },
        cancelled: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Abgebrochen', animate: false },
    };

    const stepStatusIcon = (status: MigrationStep['status']) => {
        switch (status) {
            case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'running': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
            case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
            case 'skipped': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
            default: return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!task) {
        return (
            <div className="text-center py-20">
                <h1 className="text-2xl font-bold">Migration nicht gefunden</h1>
                <p className="text-muted-foreground mt-2">Der Eintrag wurde möglicherweise gelöscht.</p>
                <Link href="/migrations">
                    <Button className="mt-4">Zurück zur Übersicht</Button>
                </Link>
            </div>
        );
    }

    const config = statusConfig[task.status] || statusConfig.pending;
    const Icon = config.icon;
    const progressPercent = task.total_steps > 0 ? Math.round((task.progress / task.total_steps) * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/migrations">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">Server-Migration</h1>
                        <Badge className={`${config.bg} ${config.color}`}>
                            {config.label}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
                        <span className="font-medium">{task.source_name}</span>
                        <ArrowRightLeft className="h-4 w-4" />
                        <span className="font-medium">{task.target_name}</span>
                    </div>
                </div>
                {/* Action Buttons */}
                {(task.status === 'pending' || task.status === 'running') ? (
                    <Button variant="destructive" onClick={handleCancel} className="gap-2">
                        <StopCircle className="h-4 w-4" />
                        Abbrechen
                    </Button>
                ) : (
                    <Button variant="outline" onClick={handleDelete} className="gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200">
                        <Trash2 className="h-4 w-4" />
                        Verlauf Löschen
                    </Button>
                )}
            </div>

            {/* Progress Overview */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center gap-6">
                        <div className={`h-16 w-16 rounded-xl flex items-center justify-center ${config.bg}`}>
                            <Icon className={`h-8 w-8 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-lg font-medium">
                                    {task.current_step || 'Bereit'}
                                </span>
                                <span className="text-2xl font-bold">{progressPercent}%</span>
                            </div>
                            <div className="h-3 bg-muted rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-500 ${task.status === 'failed' ? 'bg-red-500' :
                                        task.status === 'completed' ? 'bg-green-500' :
                                            'bg-primary'
                                        }`}
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">
                                {task.progress} von {task.total_steps} Schritten abgeschlossen
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Steps */}
                <Card>
                    <CardHeader>
                        <CardTitle>Fortschritt</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y">
                            {task.steps.map((step, i) => (
                                <div
                                    key={i}
                                    className={`flex items-center gap-3 p-4 ${step.status === 'running' ? 'bg-blue-500/5' : ''
                                        }`}
                                >
                                    {stepStatusIcon(step.status)}
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-medium ${step.status === 'completed' ? 'text-muted-foreground' :
                                            step.status === 'running' ? 'text-foreground' :
                                                'text-muted-foreground/60'
                                            }`}>
                                            {step.name}
                                        </p>
                                        {step.error && (
                                            <p className="text-xs text-red-500 mt-1">{step.error}</p>
                                        )}
                                    </div>
                                    <Badge variant="secondary" className="text-xs">
                                        {step.type.toUpperCase()}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Log */}
                <Card>
                    <CardHeader>
                        <CardTitle>Protokoll</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[400px]">
                            <div className="p-4 font-mono text-xs whitespace-pre-wrap">
                                {task.log || 'Noch keine Einträge...'}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* Error Display */}
            {task.error && (
                <Card className="border-red-500/50 bg-red-500/5">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                            <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-red-500">Fehler aufgetreten</p>
                                <p className="text-sm text-red-400 mt-1">{task.error}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Success Message */}
            {task.status === 'completed' && (
                <Card className="border-green-500/50 bg-green-500/5">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            <div>
                                <p className="font-medium text-green-500">Migration erfolgreich!</p>
                                <p className="text-sm text-green-400 mt-1">
                                    Alle VMs und Konfigurationen wurden übertragen.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
