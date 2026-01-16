'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area"
import { ListTodo, Loader2, StopCircle, Terminal, CheckCircle2, XCircle, AlertTriangle, Eye, Clock } from 'lucide-react';
import { getAllTasks, TaskItem, cancelTask } from '@/app/actions/tasks';
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface TaskManagerProps {
    className?: string;
}

export default function TaskManager({ className }: TaskManagerProps) {
    const [open, setOpen] = useState(false);
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
    const [loading, setLoading] = useState(false);

    // Initial fetch
    useEffect(() => {
        if (open) fetchTasks();
    }, [open]);

    // Poll when open
    useEffect(() => {
        if (!open) return;
        const interval = setInterval(fetchTasks, 2000);
        return () => clearInterval(interval);
    }, [open]);

    // Poll selected task for live logs
    useEffect(() => {
        if (open && selectedTask && selectedTask.status === 'running') {
            const interval = setInterval(async () => {
                // Determine if we need to refetch list or just task?
                // For simplicity, we just rely on the main poll updating the list, 
                // but we need to update 'selectedTask' reference from the list.
                // Or we could fetch specific task details if API existed.
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [open, selectedTask]);

    // Sync selected task with list updates
    useEffect(() => {
        if (selectedTask) {
            const updated = tasks.find(t => t.id === selectedTask.id);
            if (updated) setSelectedTask(updated);
        }
    }, [tasks]);

    async function fetchTasks() {
        setLoading(true);
        try {
            const res = await getAllTasks(50); // Get more history
            setTasks(res);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function handleCancel(eventId: React.MouseEvent, task: TaskItem) {
        eventId.stopPropagation();
        if (!confirm('Möchten Sie diesen Task wirklich stoppen?')) return;
        try {
            await cancelTask(task.id);
            fetchTasks(); // Force refresh
        } catch (e) {
            alert('Fehler beim Stoppen des Tasks');
        }
    }

    const runningCount = tasks.filter(t => t.status === 'running').length;

    return (
        <>
            {/* Sidebar Trigger Item */}
            <div
                onClick={() => setOpen(true)}
                className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-white/5",
                    className
                )}
            >
                <ListTodo className="h-4 w-4" />
                <span className="flex-1">Tasks</span>
                {runningCount > 0 && (
                    <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-blue-600 animate-pulse">
                        {runningCount}
                    </Badge>
                )}
            </div>

            {/* Main Task Dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="p-6 pb-2 border-b">
                        <DialogTitle className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ListTodo className="h-5 w-5" />
                                <span>Task Log</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => fetchTasks()} disabled={loading}>
                                <Clock className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        </DialogTitle>
                        <DialogDescription>
                            Historie aller Hintergrund-Prozesse (Backups, Migrationen, Scans)
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 flex overflow-hidden">
                        {/* Left: Task List Table */}
                        <div className={`flex-1 overflow-auto border-r transition-all duration-300 ${selectedTask ? 'w-1/2' : 'w-full'}`}>
                            <Table>
                                <TableHeader className="sticky top-0 bg-background z-10">
                                    <TableRow>
                                        <TableHead className="w-[180px]">Startzeit</TableHead>
                                        <TableHead className="w-[150px]">Node</TableHead>
                                        <TableHead>Beschreibung</TableHead>
                                        <TableHead className="w-[100px]">Status</TableHead>
                                        <TableHead className="w-[80px]">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tasks.map((task) => (
                                        <TableRow
                                            key={task.id}
                                            className={cn(
                                                "cursor-pointer hover:bg-muted/50",
                                                selectedTask?.id === task.id && "bg-muted"
                                            )}
                                            onClick={() => setSelectedTask(task)}
                                        >
                                            <TableCell className="text-xs font-mono text-muted-foreground">
                                                {new Date(task.startTime).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-xs">{task.node || 'System'}</TableCell>
                                            <TableCell className="font-medium text-sm">
                                                {task.type === 'scan' ? 'Global Scan' : task.description}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <TaskStatusIcon status={task.status} />
                                                    <span className="capitalize text-xs">{task.status}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {task.status === 'running' && (
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-500/10" onClick={(e) => handleCancel(e, task)}>
                                                        <StopCircle className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {tasks.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Keine Tasks gefunden.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Right: Log View (Collapsible) */}
                        {selectedTask && (
                            <div className="w-1/2 flex flex-col bg-black/95 text-green-400 font-mono text-xs border-l border-border h-full animate-in slide-in-from-right-10 duration-200">
                                <div className="p-2 border-b border-white/10 flex items-center justify-between bg-white/5">
                                    <span className="font-bold flex items-center gap-2">
                                        <Terminal className="h-3 w-3" />
                                        Log Output: {selectedTask.description}
                                    </span>
                                    <Button variant="ghost" size="icon" className="h-5 w-5 text-white/50 hover:text-white" onClick={() => setSelectedTask(null)}>
                                        <XCircle className="h-4 w-4" />
                                    </Button>
                                </div>
                                <ScrollArea className="flex-1 p-4 whitespace-pre-wrap select-text">
                                    {selectedTask.log || <span className="opacity-50 italic">Warte auf Output...</span>}
                                    {selectedTask.status === 'running' && (
                                        <div className="mt-2 animate-pulse">_</div>
                                    )}
                                </ScrollArea>
                                <div className="p-2 border-t border-white/10 text-[10px] text-white/30 flex justify-between">
                                    <span>Task ID: {selectedTask.id}</span>
                                    <span>{selectedTask.status.toUpperCase()}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function TaskStatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'running': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
        case 'completed':
        case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
        case 'cancelled': return <StopCircle className="h-4 w-4 text-orange-500" />;
        default: return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
}
