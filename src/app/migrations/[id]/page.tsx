'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    ArrowLeft, ArrowRightLeft, CheckCircle, XCircle,
    Loader2, Clock, AlertTriangle, StopCircle, Trash2, Terminal
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
        } catch (e) { console.error(e); }
    }

    async function handleDelete() {
        if (!confirm('Diesen Eintrag unwiderruflich aus dem Verlauf löschen?')) return;
        try {
            await fetch(`/api/migrations/${id}`, { method: 'DELETE' });
            router.push('/migrations');
        } catch (e) { console.error(e); }
    }

    const statusConfig = {
        pending: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Wartend', animate: false },
        running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Läuft', animate: true },
        completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Abgeschlossen', animate: false },
        failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Fehlgeschlagen', animate: false },
        cancelled: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Abgebrochen', animate: false },
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    if (!task) return (
        <div className="text-center py-20">
            <h1 className="text-2xl font-bold">Nicht gefunden</h1>
            <Link href="/migrations"><Button className="mt-4">Zurück</Button></Link>
        </div>
    );

    const config = statusConfig[task.status] || statusConfig.pending;
    const Icon = config.icon;
    const progressPercent = task.total_steps > 0 ? Math.round((task.progress / task.total_steps) * 100) : 0;

    return (
        <div className="space-y-6 max-w-7xl mx-auto h-[calc(100vh-100px)] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-4 shrink-0">
                <Link href="/migrations">
                    <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                </Link>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">Migration Details</h1>
                        <Badge className={`${config.bg} ${config.color} hover:${config.bg}`}>{config.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
                        <span className="font-mono">{task.source_name}</span>
                        <ArrowRightLeft className="h-3 w-3" />
                        <span className="font-mono">{task.target_name}</span>
                        <span className="mx-2 text-muted-foreground/30">|</span>
                        <span className="text-xs">ID: {task.id}</span>
                    </div>
                </div>
                {(task.status === 'pending' || task.status === 'running') ? (
                    <Button variant="destructive" onClick={handleCancel} className="gap-2">
                        <StopCircle className="h-4 w-4" /> Abbrechen
                    </Button>
                ) : (
                    <Button variant="outline" onClick={handleDelete} className="gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200">
                        <Trash2 className="h-4 w-4" /> Löschen
                    </Button>
                )}
            </div>

            {/* Split View */}
            <div className="grid lg:grid-cols-5 gap-6 flex-1 min-h-0">
                {/* Left Column: Progress & Steps (2/5 width) */}
                <div className="lg:col-span-2 flex flex-col gap-6 overflow-hidden">
                    {/* Overall Progress Card */}
                    <Card className="shrink-0">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${config.bg}`}>
                                    <Icon className={`h-6 w-6 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
                                </div>
                                <div>
                                    <div className="text-2xl font-bold">{progressPercent}%</div>
                                    <div className="text-sm text-muted-foreground">{task.current_step || 'Initialisiere...'}</div>
                                </div>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-500 ${task.status === 'failed' ? 'bg-red-500' : task.status === 'completed' ? 'bg-green-500' : 'bg-primary'}`}
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Timeline/Steps */}
                    <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <CardHeader className="py-4 border-b shrink-0 bg-muted/20">
                            <CardTitle className="text-base">Ablaufplan</CardTitle>
                        </CardHeader>
                        <ScrollArea className="flex-1">
                            <div className="p-6 relative">
                                {/* Vertical Connector Line */}
                                <div className="absolute left-[2.3rem] top-6 bottom-6 w-0.5 bg-border z-0" />

                                <div className="space-y-6 relative z-10">
                                    {task.steps.map((step, i) => {
                                        let icon;
                                        let stepColor = "text-muted-foreground";
                                        let bgColor = "bg-background border-muted";

                                        if (step.status === 'completed') {
                                            icon = <CheckCircle className="h-5 w-5 text-white" />;
                                            bgColor = "bg-green-500 border-green-500";
                                            stepColor = "text-foreground";
                                        } else if (step.status === 'running') {
                                            icon = <Loader2 className="h-5 w-5 text-white animate-spin" />;
                                            bgColor = "bg-blue-500 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]";
                                            stepColor = "text-blue-500 font-medium";
                                        } else if (step.status === 'failed') {
                                            icon = <XCircle className="h-5 w-5 text-white" />;
                                            bgColor = "bg-red-500 border-red-500";
                                            stepColor = "text-red-500 font-medium";
                                        } else {
                                            icon = <div className="h-2 w-2 bg-muted-foreground/30 rounded-full" />;
                                            bgColor = "bg-background border-muted";
                                        }

                                        return (
                                            <div key={i} className="flex gap-4">
                                                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2 ${bgColor} transition-colors`}>
                                                    {icon}
                                                </div>
                                                <div className="pt-1">
                                                    <p className={`text-sm ${stepColor}`}>{step.name}</p>
                                                    {step.error && <p className="text-xs text-red-500 mt-1">{step.error}</p>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </ScrollArea>
                    </Card>
                </div>

                {/* Right Column: Terminal/Logs (3/5 width) */}
                <Card className="lg:col-span-3 flex flex-col overflow-hidden bg-[#0c0c0c] border-zinc-800 shadow-2xl">
                    <CardHeader className="py-3 px-4 border-b border-zinc-800 bg-zinc-900/50 shrink-0 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Terminal className="h-4 w-4 text-zinc-400" />
                            <CardTitle className="text-sm font-mono text-zinc-300">Live Protokoll</CardTitle>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                        </div>
                    </CardHeader>
                    <ScrollArea className="flex-1">
                        <div className="p-4 font-mono text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                            {task.log ? (
                                <>
                                    <span className="text-green-500">root@proxhost:~$</span> starting migration task...
                                    {'\n'}
                                    {task.log}
                                    {task.status === 'running' && <span className="animate-pulse inline-block w-2 h-4 bg-zinc-500 align-middle ml-1" />}
                                </>
                            ) : (
                                <span className="text-zinc-500 italic">Noch keine Log-Einträge...</span>
                            )}
                        </div>
                    </ScrollArea>
                </Card>
            </div>
        </div>
    );
}
