'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { addJob } from '@/app/actions';

interface Server {
    id: number;
    name: string;
    url: string;
    type: 'pve' | 'pbs';
}

// This needs to be a client component for interactivity
export default function NewJobPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [jobType, setJobType] = useState<'backup' | 'snapshot' | 'replication'>('backup');

    // We need to fetch servers client-side or use a server component wrapper
    // For now, using inline data loading via server action would be better
    // This is a simplified version

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

            {/* Job Type Selection */}
            <Card>
                <CardHeader>
                    <CardTitle>Job-Typ</CardTitle>
                    <CardDescription>Wählen Sie den Typ der Backup-Aufgabe.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                        <button
                            type="button"
                            onClick={() => setJobType('backup')}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${jobType === 'backup'
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-primary/50'
                                }`}
                        >
                            <h4 className="font-semibold">Backup zu PBS</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                                VMs von PVE auf PBS sichern
                            </p>
                        </button>
                        <button
                            type="button"
                            onClick={() => setJobType('snapshot')}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${jobType === 'snapshot'
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-primary/50'
                                }`}
                        >
                            <h4 className="font-semibold">Lokaler Snapshot</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                                Snapshot auf lokalem Storage
                            </p>
                        </button>
                        <button
                            type="button"
                            onClick={() => setJobType('replication')}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${jobType === 'replication'
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-primary/50'
                                }`}
                        >
                            <h4 className="font-semibold">Replikation</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                                PVE zu PVE Sync
                            </p>
                        </button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Job Details</CardTitle>
                    <CardDescription>Definieren Sie Quelle, Ziel und Zeitplan.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={addJob} className="space-y-4">
                        <input type="hidden" name="jobType" value={jobType} />

                        <div className="grid gap-2">
                            <label htmlFor="name" className="text-sm font-medium">Job Name</label>
                            <Input id="name" name="name" placeholder="z.B. Tägliches VM Backup" required />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <label htmlFor="sourceId" className="text-sm font-medium">
                                    Quelle (PVE)
                                </label>
                                <select
                                    id="sourceId"
                                    name="sourceId"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    required
                                >
                                    <option value="">Quelle wählen...</option>
                                    {/* Servers would be loaded here */}
                                </select>
                            </div>

                            {jobType === 'backup' && (
                                <div className="grid gap-2">
                                    <label htmlFor="targetId" className="text-sm font-medium">
                                        Ziel (PBS) <span className="text-muted-foreground">(optional)</span>
                                    </label>
                                    <select
                                        id="targetId"
                                        name="targetId"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="">Kein Ziel (lokal)</option>
                                        {/* PBS servers would be loaded here */}
                                    </select>
                                </div>
                            )}

                            {jobType === 'replication' && (
                                <div className="grid gap-2">
                                    <label htmlFor="targetId" className="text-sm font-medium">
                                        Ziel (PVE)
                                    </label>
                                    <select
                                        id="targetId"
                                        name="targetId"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        required
                                    >
                                        <option value="">Ziel wählen...</option>
                                        {/* PVE servers would be loaded here */}
                                    </select>
                                </div>
                            )}
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
                            <Button type="submit" disabled={loading}>
                                {loading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Job erstellen
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
