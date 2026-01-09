import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import { addJob } from '@/app/actions';

export const dynamic = 'force-dynamic';

interface Server {
    id: number;
    name: string;
    url: string;
    type: 'pve' | 'pbs';
}

export default function NewJobPage() {
    const servers = db.prepare('SELECT * FROM servers').all() as Server[];
    const pveServers = servers.filter(s => s.type === 'pve');
    const pbsServers = servers.filter(s => s.type === 'pbs');

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex items-center gap-4">
                <Link href="/jobs">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Neuen Job erstellen</h2>
                    <p className="text-muted-foreground">Planen Sie eine neue Backup-Aufgabe.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Job Details</CardTitle>
                    <CardDescription>Definieren Sie Quelle, Ziel und Zeitplan.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={addJob} className="space-y-4">
                        <div className="grid gap-2">
                            <label htmlFor="name" className="text-sm font-medium">Job Name</label>
                            <Input id="name" name="name" placeholder="z.B. Tägliches Config Backup" required />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <label htmlFor="sourceId" className="text-sm font-medium">Quelle (PVE)</label>
                                <select
                                    id="sourceId"
                                    name="sourceId"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    required
                                >
                                    <option value="">Quelle wählen...</option>
                                    {pveServers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.url})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid gap-2">
                                <label htmlFor="targetId" className="text-sm font-medium">Ziel (PBS)</label>
                                <select
                                    id="targetId"
                                    name="targetId"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    <option value="">Lokal (Konfigurationen)</option>
                                    {pbsServers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.url})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="schedule" className="text-sm font-medium">Cron Zeitplan</label>
                            <Input id="schedule" name="schedule" placeholder="0 0 * * *" defaultValue="0 0 * * *" required />
                            <p className="text-xs text-muted-foreground">
                                Standard Cron-Ausdruck (z.B. 0 0 * * * = täglich um Mitternacht).
                            </p>
                        </div>

                        <div className="pt-4 flex justify-end gap-2">
                            <Link href="/jobs">
                                <Button variant="ghost" type="button">Abbrechen</Button>
                            </Link>
                            <Button type="submit">
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
