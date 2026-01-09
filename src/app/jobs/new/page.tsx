import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function createJob(formData: FormData) {
    'use server';
    const name = formData.get('name') as string;
    const serverId = formData.get('serverId') as string;
    const schedule = formData.get('schedule') as string;

    db.prepare(`
        INSERT INTO jobs (name, source_server_id, target_server_id, schedule, job_type) 
        VALUES (?, ?, NULL, ?, 'config')
    `).run(name, parseInt(serverId), schedule);

    revalidatePath('/jobs');
    redirect('/jobs');
}

export default function NewJobPage() {
    const servers = db.prepare('SELECT * FROM servers ORDER BY name').all() as any[];

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/jobs">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Neuer Zeitplan</h1>
                    <p className="text-muted-foreground">Automatische Config-Backups planen</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Zeitplan-Konfiguration</CardTitle>
                </CardHeader>
                <CardContent>
                    <form action={createJob} className="space-y-4">
                        <div className="grid gap-2">
                            <label htmlFor="name" className="text-sm font-medium">Name</label>
                            <Input id="name" name="name" placeholder="z.B. PVE Daily Backup" required />
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="serverId" className="text-sm font-medium">Server</label>
                            {servers.length === 0 ? (
                                <div className="p-4 border border-dashed rounded text-center text-muted-foreground">
                                    <p>Keine Server konfiguriert.</p>
                                    <Link href="/servers/new" className="text-primary hover:underline">
                                        Server hinzufügen →
                                    </Link>
                                </div>
                            ) : (
                                <select
                                    id="serverId"
                                    name="serverId"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    required
                                >
                                    <option value="">Server wählen...</option>
                                    {servers.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} ({s.type.toUpperCase()})
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="schedule" className="text-sm font-medium">Zeitplan (Cron)</label>
                            <Input id="schedule" name="schedule" defaultValue="0 2 * * *" required />
                            <div className="text-xs text-muted-foreground space-y-1">
                                <p><code>0 2 * * *</code> - Täglich um 02:00</p>
                                <p><code>0 */6 * * *</code> - Alle 6 Stunden</p>
                                <p><code>0 2 * * 0</code> - Sonntags um 02:00</p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <Link href="/jobs">
                                <Button type="button" variant="ghost">Abbrechen</Button>
                            </Link>
                            <Button type="submit" disabled={servers.length === 0}>
                                <Save className="mr-2 h-4 w-4" />
                                Speichern
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
