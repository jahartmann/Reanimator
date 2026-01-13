'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    ChevronUp, ChevronDown, X, Loader2, CheckCircle2,
    AlertTriangle, ArrowRight, Minimize2, Maximize2
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
}

export function TaskManager() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [minimized, setMinimized] = useState(false);
    const [hidden, setHidden] = useState(false);

    // Poll for active tasks
    const fetchTasks = useCallback(async () => {
        try {
            const res = await fetch('/api/migrations');
            if (!res.ok) return;
            const data = await res.json();

            // Filter to running tasks only for the dock
            const activeTasks = (data || [])
                .filter((t: any) => t.status === 'running' || t.status === 'pending')
                .map((t: any) => ({
                    id: t.id,
                    type: 'Migration',
                    status: t.status,
                    source: t.source_name || 'Source',
                    target: t.target_name || 'Target',
                    currentStep: t.current_step || 0,
                    totalSteps: t.total_steps || 1,
                    progress: t.total_steps > 0 ? Math.round((t.current_step / t.total_steps) * 100) : 0
                }));

            setTasks(activeTasks);
            setHidden(activeTasks.length === 0);
        } catch (e) {
            console.error('[TaskManager] Poll error:', e);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 3000);
        return () => clearInterval(interval);
    }, [fetchTasks]);

    if (hidden || tasks.length === 0) return null;

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
                            onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
                        >
                            {minimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20"
                            onClick={(e) => { e.stopPropagation(); setHidden(true); }}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                </div>

                {/* Task List */}
                {!minimized && (
                    <div className="max-h-64 overflow-y-auto">
                        {tasks.map(task => (
                            <div key={task.id} className="border-t p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={task.status === 'running' ? 'default' : 'secondary'} className="text-[10px]">
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
                                <a
                                    href={`/migrations/${task.id}`}
                                    className="text-xs text-primary hover:underline"
                                >
                                    Details anzeigen →
                                </a>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}

export default TaskManager;
