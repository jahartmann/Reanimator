import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Clock, Server, Trash2 } from "lucide-react";
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

interface Job {
    id: number;
    name: string;
    schedule: string;
    enabled: number;
    server_name: string;
    server_type: string;
}

async function deleteJob(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    db.prepare('DELETE FROM jobs WHERE id = ?').run(parseInt(id));
    revalidatePath('/jobs');
}

export default function JobsPage() {
    const jobs = db.prepare(`
        SELECT j.id, j.name, j.schedule, j.enabled, s.name as server_name, s.type as server_type
        FROM jobs j
        JOIN servers s ON j.source_server_id = s.id
        ORDER BY j.id DESC
    `).all() as Job[];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Automatisierung</h1>
                    <p className="text-muted-foreground">Automatische Backup-Zeitpläne</p>
                </div>
                <Link href="/jobs/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Neuer Zeitplan
                    </Button>
                </Link>
            </div>

            {jobs.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Keine Zeitpläne</h3>
                        <p className="text-muted-foreground text-center mb-4">
                            Erstellen Sie einen Zeitplan für automatische Backups.
                        </p>
                        <Link href="/jobs/new">
                            <Button>Zeitplan erstellen</Button>
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {jobs.map((job) => (
                        <Card key={job.id}>
                            <CardContent className="flex items-center justify-between p-6">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${job.enabled ? 'bg-green-500/20' : 'bg-muted'
                                        }`}>
                                        <Clock className={`h-5 w-5 ${job.enabled ? 'text-green-500' : 'text-muted-foreground'
                                            }`} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{job.name}</h3>
                                        <p className="text-sm text-muted-foreground">
                                            {job.server_name} ({job.server_type.toUpperCase()}) ·
                                            <code className="ml-2 bg-muted px-1 rounded">{job.schedule}</code>
                                        </p>
                                    </div>
                                </div>
                                <form action={deleteJob}>
                                    <input type="hidden" name="id" value={job.id} />
                                    <Button variant="ghost" size="icon" className="text-red-500">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
