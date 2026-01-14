'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    Loader2, CheckCircle2, AlertTriangle, ArrowRight,
    ExternalLink, ListTodo
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

            // Active tasks (Running or Pending)
            const active = mapped.filter((t: Task) => t.status === 'running' || t.status === 'pending');
            setTasks(active);

            // All tasks for history view, sorted by ID desc
            setAllTasks(mapped.sort((a: Task, b: Task) => b.id - a.id));
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

    return (
        <div className="mt-auto px-4 py-2 w-full">
            {/* Full History Dialog */}
            <Dialog open={showAll} onOpenChange={setShowAll}>
                <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Alle Tasks</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto space-y-2 flex-1">
                        {allTasks.length === 0 ? <div className="text-center text-muted-foreground p-4">Keine Tasks</div> : (
                            allTasks.map(task => (
                                <div key={task.id} className="border rounded p-3 hover:bg-muted/50 cursor-pointer flex justify-between items-center" onClick={() => { setShowAll(false); setSelectedTask(task); }}>
                                    <div>
                                        <div className="font-medium flex items-center gap-2">
                                            {task.type}
                                            <Badge variant="outline" className={getStatusColor(task.status) + ' text-white border-0'}>{task.status}</Badge>
                                        </div>
                                        <div className="text-sm text-muted-foreground">{task.source} → {task.target}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-medium">{task.progress}%</div>
                                        <div className="text-xs text-muted-foreground">{new Date(task.createdAt || '').toLocaleTimeString()}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Task Detail Dialog */}
            <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
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

            {/* Active Tasks Sidebar Summary */}
            {tasks.length > 0 && (
                <div className="space-y-2 mb-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
                        <span>Aktive Prozesse ({tasks.length})</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => setShowAll(true)}><ListTodo className="h-3 w-3" /></Button>
                    </div>
                    {tasks.slice(0, 3).map(task => (
                        <div key={task.id} className="bg-card border rounded p-2 text-xs cursor-pointer hover:bg-muted" onClick={() => setSelectedTask(task)}>
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-medium truncate">{task.type}</span>
                                <span className={task.status === 'running' ? 'text-blue-500 animate-pulse' : ''}>{task.progress}%</span>
                            </div>
                            <Progress value={task.progress} className="h-1 mb-1" />
                            <div className="text-muted-foreground truncate" title={`${task.source} -> ${task.target}`}>
                                {task.source} → {task.target}
                            </div>
                        </div>
                    ))}
                    {tasks.length > 3 && (
                        <Button variant="ghost" size="sm" className="w-full text-xs h-6" onClick={() => setShowAll(true)}>+ {tasks.length - 3} weitere</Button>
                    )}
                </div>
            )}

            {/* Default State if no tasks or button to show history */}
            {tasks.length === 0 && (
                <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={() => setShowAll(true)}>
                    <ListTodo className="h-4 w-4 mr-2" />
                    Task Verlauf
                </Button>
            )}
        </div>
    );
}

export default TaskManager;
