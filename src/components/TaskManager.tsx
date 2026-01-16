'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from "@/components/ui/scroll-area"
import { ListTodo, Loader2, Maximize2, Minimize2, CheckCircle2, XCircle, AlertTriangle, Eye, StopCircle, Terminal } from 'lucide-react';
import Link from 'next/link';
import { getAllTasks, TaskItem, cancelTask } from '@/app/actions/tasks';
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"


export default function TaskManager() {
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [collapsed, setCollapsed] = useState(false);

    // Detailed View State
    const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 2000); // Faster poll for "live" feel
        return () => clearInterval(interval);
    }, []);

    // Also poll selected task details if open
    useEffect(() => {
        if (showDetails && selectedTask) {
            // In a perfect world we'd just fetch the single task, but refetching all and finding it works for now
            const updated = tasks.find(t => t.id === selectedTask.id);
            if (updated) setSelectedTask(updated);
        }
    }, [tasks, showDetails, selectedTask?.id]);


    async function fetchTasks() {
        try {
            // Get recent 10 to ensure we catch active ones
            const res = await getAllTasks(10);
            setTasks(res);
        } catch (e) {
            console.error(e);
        }
    }

    async function handleCancel(task: TaskItem) {
        if (!confirm('Stop this task?')) return;
        try {
            await cancelTask(task.id);
            fetchTasks(); // Force refresh
        } catch (e) {
            alert('Failed to stop task');
        }
    }

    const runningTasks = tasks.filter(t => t.status === 'running');
    const recentTasks = tasks.slice(0, 5); // Show top 5

    if (tasks.length === 0) return null;

    return (
        <>
            <div className={cn(
                "fixed bottom-4 right-4 z-[99] transition-all duration-300 shadow-xl border bg-card rounded-lg overflow-hidden flex flex-col pointer-events-auto",
                collapsed ? "w-auto h-auto" : "w-96"
            )}>
                {/* Header */}
                <div className="bg-muted p-3 flex items-center justify-between cursor-pointer border-b select-none" onClick={() => setCollapsed(!collapsed)}>
                    <div className="flex items-center gap-2">
                        <div className={cn("p-1.5 rounded-full", runningTasks.length > 0 ? "bg-blue-500/10 text-blue-600 animate-pulse" : "bg-muted-foreground/10 text-muted-foreground")}>
                            <ListTodo className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="text-sm font-semibold">Background Tasks</span>
                            {!collapsed && <span className="text-[10px] text-muted-foreground">{runningTasks.length > 0 ? `${runningTasks.length} Active` : 'Idle'}</span>}
                        </div>

                    </div>
                    <div className="flex items-center gap-1">
                        {collapsed && runningTasks.length > 0 && (
                            <Badge variant="default" className="text-[10px] h-5 px-1.5 animate-pulse bg-blue-600">{runningTasks.length}</Badge>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                            {collapsed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
                        </Button>
                    </div>
                </div>

                {/* List */}
                {!collapsed && (
                    <div className="flex flex-col max-h-[400px]">
                        <div className="p-1 space-y-1 overflow-y-auto max-h-[350px]">
                            {recentTasks.map(task => (
                                <div key={task.id} className="group text-sm p-3 rounded-md bg-background border border-border/50 hover:border-border transition-colors shadow-sm mb-1 relative overflow-hidden">
                                    {/* Progress Bar for running tasks */}
                                    {task.status === 'running' && (
                                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500/20">
                                            <div className="h-full bg-blue-500 animate-progress-indeterminate w-full origin-left" />
                                        </div>
                                    )}

                                    <div className="flex justify-between items-start mb-1 h-6"> {/* Fixed height for header line */}
                                        <div className="flex items-center gap-2 overflow-hidden mr-2">
                                            <TaskStatusIcon status={task.status} />
                                            <span className="font-medium truncate" title={task.description}>
                                                {task.type === 'scan' ? 'Global Scan' : task.description}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity absolute right-2 top-2 bg-background/80 backdrop-blur-sm rounded-sm">
                                            <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-blue-500" onClick={(e) => { e.stopPropagation(); setSelectedTask(task); setShowDetails(true); }}>
                                                <Eye className="h-3 w-3" />
                                            </Button>

                                            {task.status === 'running' && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); handleCancel(task); }}>
                                                    <StopCircle className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex justify-between text-[11px] text-muted-foreground pl-6">
                                        <span className="font-mono">{task.node || 'System'}</span>
                                        <span>{task.duration || task.status}</span>
                                    </div>

                                    {/* Mini Log Snapshot */}
                                    {task.status === 'running' && task.log && (
                                        <div className="mt-2 pl-6 text-[10px] text-muted-foreground font-mono truncate opacity-70">
                                            &gt; {task.log.split('\n').filter(Boolean).pop()}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="p-2 border-t bg-muted/20">
                            <Link href="/jobs" className="w-full block">
                                <Button variant="ghost" size="sm" className="w-full text-xs h-8 text-muted-foreground hover:text-primary">
                                    View All History
                                </Button>
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            {/* Detailed Log Dialog */}
            <Dialog open={showDetails} onOpenChange={setShowDetails}>
                <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <TaskStatusIcon status={selectedTask?.status || ''} />
                            {selectedTask?.description}
                        </DialogTitle>
                        <DialogDescription className="flex items-center gap-4 text-xs font-mono">
                            <span>ID: {selectedTask?.id}</span>
                            <span>Node: {selectedTask?.node || '-'}</span>
                            <span>Duration: {selectedTask?.duration}</span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 min-h-[300px] bg-black/95 rounded-md border border-zinc-800 p-4 font-mono text-xs text-green-400 overflow-hidden flex flex-col shadow-inner">
                        <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 mb-2 text-zinc-500">
                            <Terminal className="h-3 w-3" />
                            <span>Live Log Output</span>
                            {selectedTask?.status === 'running' && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="whitespace-pre-wrap">
                                {selectedTask?.log || <span className="text-zinc-600 italic">No log output available...</span>}
                            </div>
                        </ScrollArea>
                    </div>

                    <div className="flex justify-end gap-2">
                        {selectedTask?.status === 'running' && (
                            <Button variant="destructive" size="sm" onClick={() => selectedTask && handleCancel(selectedTask)}>
                                <StopCircle className="h-4 w-4 mr-2" /> Stop Task
                            </Button>
                        )}
                        <Button variant="secondary" size="sm" onClick={() => setShowDetails(false)}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function TaskStatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'running': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
        case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
        case 'cancelled': return <StopCircle className="h-4 w-4 text-orange-500" />;
        default: return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
}
