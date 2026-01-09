import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Clock, Server } from "lucide-react";
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface ServerItem {
    id: number;
    name: string;
    type: 'pve' | 'pbs';
    url: string;
}

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
    const servers = db.prepare('SELECT * FROM servers ORDER BY name').all() as ServerItem[];

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex items-center gap-4">
                <Link href="/jobs">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Config Backup Job erstellen</h2>
                    <p className="text-muted-foreground">Automatische Sicherung von /etc und Systemkonfiguration.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Job Konfiguration</CardTitle>
                    <CardDescription>
                        Wählen Sie einen Server und den Zeitplan für automatische Backups.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={createJob} className="space-y-6">
                        <div className="grid gap-2">
                            <label htmlFor="name" className="text-sm font-medium">Job Name</label>
                            <Input
                                id="name"
                                name="name"
                                placeholder="z.B. PVE Node 1 - Täglich"
                                required
                            />
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="serverId" className="text-sm font-medium flex items-center gap-2">
                                <Server className="h-4 w-4" />
                                Server
                            </label>
                            {servers.length === 0 ? (
                                <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground">
                                    <p>Keine Server konfiguriert.</p>
                                    <Link href="/servers/new" className="text-primary hover:underline text-sm">
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
                                    {servers.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} ({s.type.toUpperCase()})
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="schedule" className="text-sm font-medium flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Zeitplan (Cron)
                            </label>
                            <Input
                                id="schedule"
                                name="schedule"
                                placeholder="0 2 * * *"
                                defaultValue="0 2 * * *"
                                required
                            />
                            <div className="text-xs text-muted-foreground space-y-1">
                                <p><strong>Beispiele:</strong></p>
                                <p><code>0 2 * * *</code> - Täglich um 02:00 Uhr</p>
                                <p><code>0 */6 * * *</code> - Alle 6 Stunden</p>
                                <p><code>0 2 * * 0</code> - Jeden Sonntag um 02:00 Uhr</p>
                            </div>
                        </div>

                        {/* Info Box */}
                        <div className="p-4 rounded-lg bg-muted/50 text-sm">
                            <h4 className="font-medium mb-2">Was wird gesichert?</h4>
                            <ul className="text-muted-foreground space-y-1">
                                <li>✓ Komplettes <code>/etc</code> Verzeichnis</li>
                                <li>✓ SSH Keys (<code>/root/.ssh</code>)</li>
                                <li>✓ Cron Jobs (<code>/var/spool/cron</code>)</li>
                                <li>✓ System-Info & Disk UUIDs</li>
                                <li>✓ Disaster Recovery Anleitung</li>
                            </ul>
                        </div>

                        <div className="pt-4 flex justify-end gap-2">
                            <Link href="/jobs">
                                <Button variant="ghost" type="button">Abbrechen</Button>
                            </Link>
                            <Button type="submit" disabled={servers.length === 0}>
                                <Save className="mr-2 h-4 w-4" />
                                Job erstellen
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
