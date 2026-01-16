'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, ArrowRightLeft, CheckCircle2, XCircle, MoreVertical, Trash2, Play } from 'lucide-react';
import { getAllTasks, TaskItem } from '@/app/actions/tasks';
import { getAllJobs, runJob, deleteJob } from '@/app/actions/scheduler_actions';
// Note: I need to ensure scheduler_actions exists or create it. 
// Assuming I need to create it. I will create it in next step. For now I'll mock the import or assume I create it.
// I will create `src/app/actions/scheduler_actions.ts` right after this.

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Job {
    id: number;
    name: string;
    job_type: string;
    schedule: string;
    enabled: boolean;
    last_run?: string;
    next_run?: string; // Calculated
    options?: string;
}

export default function JobsPage() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [history, setHistory] = useState<TaskItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 5000);
        return () => clearInterval(interval);
    }, []);

    async function loadData() {
        try {
            // Parallel fetch
            const [fetchedJobs, fetchedHistory] = await Promise.all([
                getAllJobs(),
                getAllTasks(50)
            ]);
            setJobs(fetchedJobs);
            setHistory(fetchedHistory);
        } catch (e) {
            console.error("Failed to load jobs", e);
        } finally {
            setLoading(false);
        }
    }

    async function handleRunNow(id: number) {
        if (!confirm("Run this job immediately?")) return;
        await runJob(id);
        loadData();
    }

    async function handleDelete(id: number) {
        if (!confirm("Delete this scheduled job?")) return;
        await deleteJob(id);
        loadData();
    }

    return (
        <div className="container mx-auto py-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Aufgaben & Zeitplan</h1>
                    <p className="text-muted-foreground">Verwalte geplante Migrationen und Hintergrund-Jobs.</p>
                </div>
            </div>

            {/* Scheduled Jobs Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Geplante Jobs</CardTitle>
                    <CardDescription>Aktive Cron-Jobs und geplante Migrationen.</CardDescription>
                </CardHeader>
                <CardContent>
                    {jobs.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                            Keine geplanten Jobs.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {jobs.map(job => (
                                <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-primary/10 rounded-full text-primary">
                                            {job.job_type === 'migration' ? <ArrowRightLeft className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                                        </div>
                                        <div>
                                            <div className="font-semibold">{job.name}</div>
                                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                                <Badge variant="outline" className="font-mono">{job.schedule}</Badge>
                                                {job.last_run && <span>Letzter lauf: {new Date(job.last_run).toLocaleString()}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right text-sm">
                                            <div className="font-medium text-green-600">Aktiv</div>
                                            {/* Future: Show next run calculation */}
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleRunNow(job.id)}><Play className="h-4 w-4 mr-2" /> Jetzt ausführen</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(job.id)}><Trash2 className="h-4 w-4 mr-2" /> Löschen</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* History Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Verlauf</CardTitle>
                    <CardDescription>Historie der ausgeführten Tasks.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {history.map(task => (
                            <div key={task.id} className="flex items-center justify-between p-3 border-b last:border-0 text-sm">
                                <div className="flex items-center gap-3">
                                    <StatusIcon status={task.status} />
                                    <div>
                                        <div className="font-medium">{task.description}</div>
                                        <div className="text-xs text-muted-foreground flex gap-2">
                                            <span>{new Date(task.startTime).toLocaleString()}</span>
                                            {task.duration && <span>• Dauer: {task.duration}</span>}
                                            {task.node && <span>• {task.node}</span>}
                                        </div>
                                    </div>
                                </div>
                                <Badge variant={task.status === 'completed' ? 'secondary' : (task.status === 'failed' ? 'destructive' : 'default')}>
                                    {task.status}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
        case 'running': return <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />;
        default: return <div className="h-4 w-4 rounded-full bg-slate-200" />;
    }
}
