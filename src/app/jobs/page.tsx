import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Clock, Server, Play, Trash2, Zap } from "lucide-react";

export const dynamic = 'force-dynamic';

interface CronJob {
    id: number;
    name: string;
    server_name: string;
    server_type: string;
    schedule: string;
    enabled: number;
}

export default function JobsPage() {
    // Determine cron frequency description
    const getFrequency = (cron: string) => {
        if (cron === '0 0 * * *') return 'Täglich um Mitternacht';
        if (cron.includes('*/')) return 'Regelmäßig (Intervall)';
        return 'Benutzerdefiniert';
    };

    const jobs = db.prepare(`
        SELECT j.id, j.name, j.schedule, j.enabled, s.name as server_name, s.type as server_type
        FROM jobs j
        JOIN servers s ON j.source_server_id = s.id
        ORDER BY j.id DESC
    `).all() as CronJob[];

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        Automatisierung
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Verwalten Sie die automatischen Backup-Zeitpläne.
                    </p>
                </div>
                <Link href="/jobs/new">
                    <Button className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="mr-2 h-4 w-4" /> Neuer Zeitplan
                    </Button>
                </Link>
            </div>

            <div className="grid gap-4">
                {jobs.map((job) => (
                    <Card key={job.id} className="group hover:border-indigo-500/50 transition-all duration-300">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-6">
                                {/* Icon / Status */}
                                <div className={`relative h-12 w-12 rounded-xl flex items-center justify-center transition-colors ${job.enabled ? 'bg-indigo-500/10 text-indigo-500' : 'bg-muted text-muted-foreground'
                                    }`}>
                                    <Clock className="h-6 w-6" />
                                    {job.enabled === 1 && (
                                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                                        </span>
                                    )}
                                </div>

                                {/* Main Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-lg font-semibold truncate">{job.name}</h3>
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${job.server_type === 'pve' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'
                                            }`}>
                                            {job.server_type}
                                        </span>
                                    </div>
                                    <div className="flex items-center text-sm text-muted-foreground gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <Server className="h-4 w-4" />
                                            <span>{job.server_name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Zap className="h-4 w-4" />
                                            <code className="bg-muted px-1.5 rounded">{job.schedule}</code>
                                            <span className="text-muted-foreground/60">• {getFrequency(job.schedule)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="hover:text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {jobs.length === 0 && (
                    <div className="py-16 text-center border-2 border-dashed border-border rounded-xl bg-card/10">
                        <Clock className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium">Keine Zeitpläne aktiv</h3>
                        <p className="text-muted-foreground mb-6">Erstellen Sie einen Zeitplan um Ihre Konfigurationen automatisch zu sichern.</p>
                        <Link href="/jobs/new">
                            <Button variant="outline">Ersten Zeitplan erstellen</Button>
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
