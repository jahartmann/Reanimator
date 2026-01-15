'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ListTodo, Loader2, Maximize2, Minimize2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { getAllTasks, TaskItem } from '@/app/actions/tasks';
import { cn } from "@/lib/utils";

export default function TaskManager() {
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 3000);
        return () => clearInterval(interval);
    }, []);

    async function fetchTasks() {
        try {
            // Get recent 5
            const res = await getAllTasks(5);
            setTasks(res);
        } catch (e) {
            console.error(e);
        }
    }

    const runningTasks = tasks.filter(t => t.status === 'running');
    const recentTasks = tasks.slice(0, 3); // Show top 3

    if (tasks.length === 0) return null;

    return (
        <div className={cn(
            "fixed bottom-4 right-4 z-50 transition-all duration-300 shadow-lg border bg-background rounded-lg overflow-hidden",
            collapsed ? "w-auto h-auto" : "w-80"
        )}>
            {/* Header */}
            <div className="bg-muted/50 p-2 flex items-center justify-between cursor-pointer border-b" onClick={() => setCollapsed(!collapsed)}>
                <div className="flex items-center gap-2">
                    <ListTodo className="h-4 w-4" />
                    <span className="text-xs font-semibold">Tasks</span>
                    {runningTasks.length > 0 && (
                        <Badge variant="default" className="text-[10px] h-4 px-1">{runningTasks.length} running</Badge>
                    )}
                </div>
                <Button variant="ghost" size="icon" className="h-5 w-5">
                    {collapsed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
                </Button>
            </div>

            {/* List */}
            {!collapsed && (
                <div className="p-2 space-y-2 max-h-[300px] overflow-y-auto">
                    {recentTasks.map(task => (
                        <div key={task.id} className="text-xs space-y-1 p-2 rounded hover:bg-muted/50 border border-transparent hover:border-muted">
                            <div className="flex justify-between items-center">
                                <span className="font-medium truncate max-w-[150px]" title={task.description}>
                                    {task.type === 'migration' ? '🚀' : (task.type === 'scan' ? '🛡️' : '💾')} {task.description}
                                </span>
                                <TaskStatusIcon status={task.status} />
                            </div>
                            {task.status === 'running' && (
                                <Progress value={undefined} className="h-1 w-full animate-pulse" />
                            )}
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>{task.node || 'System'}</span>
                                <span>{task.duration || task.status}</span>
                            </div>
                        </div>
                    ))}

                    <div className="pt-2 border-t mt-2">
                        <Link href="/tasks" className="w-full block">
                            <Button variant="outline" size="sm" className="w-full text-xs h-7">
                                Alle Tasks anzeigen
                            </Button>
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

function TaskStatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'running': return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
        case 'completed': return <CheckCircle2 className="h-3 w-3 text-green-500" />;
        case 'failed': return <XCircle className="h-3 w-3 text-red-500" />;
        default: return <AlertTriangle className="h-3 w-3 text-amber-500" />;
    }
}
