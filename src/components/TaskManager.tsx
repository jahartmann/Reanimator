'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    Loader2, CheckCircle2, AlertTriangle, ArrowRight,
    Minimize2, Maximize2, ExternalLink, RefreshCw, ListTodo
} from 'lucide-react';

interface Task {
    id: number;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    source: string;
    target: string;
    currentStep: number;
    totalSteps: number;
    progress: number;
    log?: string;
    createdAt?: string;
}

export function TaskManager() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [minimized, setMinimized] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

    // Poll for tasks
    const fetchTasks = useCallback(async () => {
        try {
            const res = await fetch('/api/migrations');
            if (!res.ok) return;
            const data = await res.json();

            const mapped = (data || []).map((t: any) => ({
                id: t.id,
                type: 'Migration',
                status: t.status,
                source: t.source_name || 'Source',
                target: t.target_name || 'Target',
                currentStep: t.current_step || 0,
                totalSteps: t.total_steps || 1,
                progress: t.total_steps > 0 ? Math.round((t.current_step / t.total_steps) * 100) : 0,
                log: t.log,
                createdAt: t.created_at
            }));

            // Active tasks for floating dock:
            // - Running or Pending
            // - Failed or Completed within the last 5 minutes
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();

            const active = mapped.filter((t: Task) => {
                if (t.status === 'running' || t.status === 'pending') return true;
                // Keep completed/failed visible for a while
                if (t.createdAt && t.createdAt > fiveMinutesAgo) return true;
                return false;
            });

            setTasks(active);

            // All recent tasks (last 10)
            setAllTasks(mapped.slice(0, 10));
        } catch (e) {
            console.error('[TaskManager] Poll error:', e);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 3000);
        return () => clearInterval(interval);
    }, [fetchTasks]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'running':
            case 'pending':
                return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
            case 'completed':
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'failed':
                return <AlertTriangle className="h-4 w-4 text-red-500" />;
            default:
                return null;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'running': return 'bg-blue-500';
            case 'pending': return 'bg-amber-500';
            case 'completed': return 'bg-green-500';
            case 'failed': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    };

    // Sidebar Trigger Button
    const SidebarTrigger = () => (
        <div className="relative">
            {/* Popover Panels */}
            {showAll && (
                <div className="absolute left-full bottom-0 ml-4 w-96 z-50 animate-in fade-in slide-in-from-left-5">
                    <Card className="shadow-2xl border bg-card/95 backdrop-blur-sm p-0 overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-3 border-b flex items-center justify-between bg-muted/50">
                            <h3 className="font-semibold flex items-center gap-2 text-sm">
                                <ListTodo className="h-4 w-4" />
                                Alle Tasks
                            </h3>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAll(false)}>
                                <Minimize2 className="h-3 w-3" />
                            </Button>
                        </div>
                        <div className="overflow-y-auto p-2 space-y-2">
                            {allTasks.length === 0 ? <div className="p-4 text-center text-xs text-muted-foreground">Keine Tasks</div> : (
                                allTasks.map(task => (
                                    <div key={task.id} className="text-xs border rounded p-2 hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedTask(task)}>
                                        <div className="flex justify-between mb-1">
                                            <span className="font-medium">{task.type}</span>
                                            <Badge variant="outline" className="text-[10px] h-4">{task.status}</Badge>
                                        </div>
                                        <div className="text-muted-foreground truncate">{task.source} → {task.target}</div>
                                        <Progress value={task.progress} className="h-1 mt-2" />
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {(tasks.length > 0 && !minimized) && (
                <div className="absolute left-full bottom-0 ml-4 w-80 z-50 animate-in fade-in slide-in-from-left-5 mb-2">
                    <Card className="shadow-2xl border bg-card/95 backdrop-blur-sm overflow-hidden">
                        <div className="p-3 border-b flex items-center justify-between bg-primary/10">
                            <div className="flex items-center gap-2 text-primary font-medium text-sm">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {tasks.length} Laufend
                            </div>
                            <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-6 w-6" title="Verlauf" onClick={() => { setShowAll(!showAll); setMinimized(true); }}>
                                    <ListTodo className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setMinimized(true)}>
                                    <Minimize2 className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            {tasks.map(task => (
                                <div key={task.id} className="border-b last:border-0 p-3 hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedTask(task)}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="text-xs font-medium">{task.type}</div>
                                        <div className="text-[10px] text-muted-foreground">{task.progress}%</div>
                                    </div>
                                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                        {task.source} <ArrowRight className="h-3 w-3" /> {task.target}
                                    </div>
                                    <Progress value={task.progress} className="h-1.5" />
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            <button
                onClick={() => setMinimized(!minimized)}
                className="flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors w-full"
            >
                <div className="relative">
                    <ListTodo className="h-4 w-4" />
                    {tasks.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[9px] w-3.5 h-3.5 flex items-center justify-center rounded-full animate-pulse">
                            {tasks.length}
                        </span>
                    )}
                </div>
                Tasks
            </button>
        </div>
    );

    // Task Detail Dialog
    const TaskDetailDialog = () => (
        <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {selectedTask && getStatusIcon(selectedTask.status)}
                        {selectedTask?.type}: {selectedTask?.source} → {selectedTask?.target}
                    </DialogTitle>
                </DialogHeader>
                {selectedTask && (
                    <div className="space-y-4 overflow-y-auto flex-1">
                        <div className="flex items-center gap-4">
                            <Progress value={selectedTask.progress} className="flex-1" />
                            <span className="text-sm font-medium">{selectedTask.progress}%</span>
                        </div>
                        <div className="flex gap-2 text-sm">
                            <Badge className={`${getStatusColor(selectedTask.status)} text-white`}>
                                {selectedTask.status}
                            </Badge>
                            <span className="text-muted-foreground">
                                Schritt {selectedTask.currentStep} / {selectedTask.totalSteps}
                            </span>
                        </div>
                        {selectedTask.log && (
                            <div className="bg-black/90 text-green-400 p-4 rounded-md font-mono text-xs max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                                {selectedTask.log}
                            </div>
                        )}
                        <div className="flex justify-end">
                            <a href={`/migrations/${selectedTask.id}`}>
                                <Button variant="outline" size="sm">
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Vollständige Details
                                </Button>
                            </a>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );

    return (
        <>
            <SidebarTrigger />
            <TaskDetailDialog />
        </>
    );
}

export default TaskManager;
