'use client';

import { useState, useEffect } from 'react';
import { getAllTasks, TaskItem } from '@/app/actions/tasks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // Search
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, RefreshCw, Filter, ListTodo, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export default function TasksPage() {
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [filteredTasks, setFilteredTasks] = useState<TaskItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

    // Filters
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterType, setFilterType] = useState<string>('all');

    useEffect(() => {
        loadTasks();
        const interval = setInterval(loadTasks, 3000); // Live update
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let res = tasks;
        if (filterStatus !== 'all') {
            res = res.filter(t => t.status === filterStatus);
        }
        if (filterType !== 'all') {
            res = res.filter(t => t.type === filterType);
        }
        setFilteredTasks(res);
    }, [tasks, filterStatus, filterType]);

    async function loadTasks() {
        // Fetch more initially to allow client filtering
        const res = await getAllTasks(100);
        setTasks(res);
        setLoading(false);
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'running': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
            case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
            case 'pending': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Task Log</h1>
                <p className="text-muted-foreground">Verlauf und Status aller System-Prozesse</p>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>History</CardTitle>
                    <div className="flex gap-2">
                        {/* Filters */}
                        <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Job Typ" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Alle Typen</SelectItem>
                                <SelectItem value="scan">🛡️ Scan</SelectItem>
                                <SelectItem value="config">💾 Backup</SelectItem>
                                <SelectItem value="migration">🚀 Migration</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Alle Status</SelectItem>
                                <SelectItem value="running">Running</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button variant="outline" size="icon" onClick={() => loadTasks()}>
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead className="w-[180px]">Startzeit</TableHead>
                                <TableHead className="w-[150px]">Node</TableHead>
                                <TableHead>Beschreibung</TableHead>
                                <TableHead className="w-[100px]">Dauer</TableHead>
                                <TableHead className="w-[100px]">Status</TableHead>
                                <TableHead className="w-[80px] text-right">Log</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTasks.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                                        Keine Tasks gefunden
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTasks.map(task => (
                                    <TableRow key={task.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedTask(task)}>
                                        <TableCell>{getStatusIcon(task.status)}</TableCell>
                                        <TableCell>{new Date(task.startTime).toLocaleString('de-DE')}</TableCell>
                                        <TableCell className="font-medium">{task.node || '-'}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px] uppercase">
                                                    {task.type}
                                                </Badge>
                                                <span className="truncate max-w-[300px]">{task.description}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{task.duration}</TableCell>
                                        <TableCell>
                                            <Badge variant={task.status === 'failed' ? 'destructive' : (task.status === 'running' ? 'default' : 'secondary')}>
                                                {task.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm">Details</Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Detail Dialog */}
            <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
                <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {selectedTask && getStatusIcon(selectedTask.status)}
                            Details: {selectedTask?.description}
                        </DialogTitle>
                    </DialogHeader>
                    {selectedTask && (
                        <div className="flex-1 overflow-hidden flex flex-col gap-4">
                            <div className="grid grid-cols-3 gap-4 text-sm border p-4 rounded-md">
                                <div><strong>ID:</strong> {selectedTask.id}</div>
                                <div><strong>Type:</strong> {selectedTask.type}</div>
                                <div><strong>Node:</strong> {selectedTask.node}</div>
                                <div><strong>Start:</strong> {new Date(selectedTask.startTime).toLocaleString()}</div>
                                <div><strong>End:</strong> {selectedTask.endTime ? new Date(selectedTask.endTime).toLocaleString() : '-'}</div>
                                <div><strong>Duration:</strong> {selectedTask.duration}</div>
                            </div>

                            <div className="flex-1 bg-black rounded-md p-4 overflow-auto font-mono text-xs text-green-500 whitespace-pre-wrap">
                                {selectedTask.log || "Kein Log verfügbar."}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
