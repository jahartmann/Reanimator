import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FolderCog, Trash2, Clock, Server, Play, Settings2 } from "lucide-react";

export const dynamic = 'force-dynamic';

interface ConfigJob {
    id: number;
    name: string;
    server_id: number;
    schedule: string;
    enabled: number;
    last_run: string | null;
    server_name: string;
    server_type: string;
}

export default function JobsPage() {
    // Config jobs are now simpler - just server + schedule
    const jobs = db.prepare(`
        SELECT 
            j.id, j.name, j.source_server_id as server_id, j.schedule, j.enabled, j.next_run as last_run,
            s.name as server_name, s.type as server_type
        FROM jobs j
        JOIN servers s ON j.source_server_id = s.id
        ORDER BY j.id DESC
    `).all() as ConfigJob[];

    const servers = db.prepare('SELECT * FROM servers').all() as any[];

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        Config Backup Jobs
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Automatische Sicherung von Server-Konfigurationen
                    </p>
                </div>
                <Link href="/jobs/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Neuer Job
                    </Button>
                </Link>
            </div>

            {/* Quick Actions */}
            <Card className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-indigo-500/30">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <FolderCog className="h-5 w-5 text-indigo-400" />
                            <div>
                                <p className="font-medium">Schnell-Backup</p>
                                <p className="text-sm text-muted-foreground">Alle Server jetzt sichern</p>
                            </div>
                        </div>
                        <Link href="/configs">
                            <Button variant="secondary">
                                <Play className="mr-2 h-4 w-4" />
                                Zu Konfigurationen
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4">
                {jobs.map((job) => (
                    <Card key={job.id} className="group hover:bg-muted/50 transition-colors">
                        <CardContent className="p-6 flex items-center gap-6">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${job.server_type === 'pve' ? 'bg-blue-500/20' : 'bg-green-500/20'
                                }`}>
                                <FolderCog className={`h-5 w-5 ${job.server_type === 'pve' ? 'text-blue-500' : 'text-green-500'
                                    }`} />
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-medium leading-none mb-2">{job.name}</h3>
                                <div className="flex items-center text-sm text-muted-foreground gap-2">
                                    <Server className="h-3 w-3" />
                                    <span>{job.server_name}</span>
                                    <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                        {job.server_type.toUpperCase()}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 text-sm text-muted-foreground hidden md:flex">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    <span className="font-mono bg-secondary px-2 py-0.5 rounded text-xs">{job.schedule}</span>
                                </div>
                                <div className={job.enabled ? "text-emerald-500 font-medium" : "text-muted-foreground"}>
                                    {job.enabled ? "Aktiv" : "Pausiert"}
                                </div>
                            </div>

                            <form action={async () => {
                                'use server';
                                db.prepare('DELETE FROM jobs WHERE id = ?').run(job.id);
                            }}>
                                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                ))}

                {jobs.length === 0 && (
                    <div className="py-16 text-center border-2 border-dashed border-border rounded-lg bg-card/10">
                        <FolderCog className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                        <p className="text-lg font-medium text-muted-foreground">Keine Jobs geplant</p>
                        <p className="text-sm text-muted-foreground/80 mb-6">
                            Erstellen Sie einen Job, um Konfigurationen automatisch zu sichern.
                        </p>
                        <Link href="/jobs/new">
                            <Button variant="outline">Ersten Job erstellen</Button>
                        </Link>
                    </div>
                )}
            </div>

            {/* Info Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings2 className="h-5 w-5" />
                        Was wird gesichert?
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <h4 className="font-medium mb-2 text-blue-400">Proxmox VE</h4>
                            <ul className="text-muted-foreground space-y-1">
                                <li>• <code>/etc/</code> - Komplette Konfiguration</li>
                                <li>• VM & Container Definitionen</li>
                                <li>• Cluster-Konfiguration</li>
                                <li>• Netzwerk, Storage, Users</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium mb-2 text-green-400">Proxmox Backup Server</h4>
                            <ul className="text-muted-foreground space-y-1">
                                <li>• <code>/etc/</code> - Komplette Konfiguration</li>
                                <li>• Datastore Definitionen</li>
                                <li>• Benutzer & API Tokens</li>
                                <li>• Sync & Verify Jobs</li>
                            </ul>
                        </div>
                    </div>
                    <div className="mt-4 p-3 rounded-lg bg-amber-500/10 text-amber-400 text-sm">
                        <strong>Bonus:</strong> Jedes Backup enthält eine <code>WIEDERHERSTELLUNG.md</code> Anleitung und <code>DISK_UUIDS.txt</code> für Disaster Recovery.
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
