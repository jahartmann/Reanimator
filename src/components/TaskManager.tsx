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

            // Active tasks for floating dock
            const active = mapped.filter((t: Task) => t.status === 'running' || t.status === 'pending');
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

    // Floating dock for active tasks
    const ActiveTasksDock = () => {
        if (tasks.length === 0) return null;

        return (
            <div className="fixed bottom-4 right-4 z-50 w-80">
                <Card className="shadow-2xl border-2 overflow-hidden">
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-3 py-2 bg-primary text-primary-foreground cursor-pointer"
                        onClick={() => setMinimized(!minimized)}
                    >
                        <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="font-medium text-sm">
                                {tasks.length} aktive Task{tasks.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20"
                                onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
                                title="Alle Tasks anzeigen"
                            >
                                <ListTodo className="h-3 w-3" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20"
                                onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
                            >
                                {minimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
                            </Button>
                        </div>
                    </div>

                    {/* Task List */}
                    {!minimized && (
                        <div className="max-h-64 overflow-y-auto">
                            {tasks.map(task => (
                                <div
                                    key={task.id}
                                    className="border-t p-3 space-y-2 hover:bg-muted/50 cursor-pointer"
                                    onClick={() => setSelectedTask(task)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="default" className="text-[10px]">
                                                {task.type}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {task.source} <ArrowRight className="inline h-3 w-3" /> {task.target}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Progress value={task.progress} className="h-1.5" />
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>Schritt {task.currentStep}/{task.totalSteps}</span>
                                            <span>{task.progress}%</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        );
    };

    // Full Task History Dialog
    const TaskHistoryDialog = () => (
        <Dialog open={showAll} onOpenChange={setShowAll}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ListTodo className="h-5 w-5" />
                        Task Übersicht
                        <Button variant="ghost" size="sm" onClick={fetchTasks}>
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto flex-1">
                    {allTasks.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Keine Tasks vorhanden
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {allTasks.map(task => (
                                <div
                                    key={task.id}
                                    className="flex items-center gap-4 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                                    onClick={() => { setSelectedTask(task); setShowAll(false); }}
                                >
                                    {getStatusIcon(task.status)}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{task.type}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {task.source} → {task.target}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Progress value={task.progress} className="h-1 flex-1" />
                                            <span className="text-xs text-muted-foreground w-10 text-right">
                                                {task.progress}%
                                            </span>
                                        </div>
                                    </div>
                                    <Badge className={`${getStatusColor(task.status)} text-white text-[10px]`}>
                                        {task.status}
                                    </Badge>
                                    <a
                                        href={`/migrations/${task.id}`}
                                        className="text-primary hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
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
            <ActiveTasksDock />
            <TaskHistoryDialog />
            <TaskDetailDialog />
        </>
    );
}

export default TaskManager;
