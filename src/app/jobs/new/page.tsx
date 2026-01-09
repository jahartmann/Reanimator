import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import { addJob } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default function NewJobPage() {
    const servers = db.prepare('SELECT * FROM servers').all() as any[];

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex items-center gap-4">
                <Link href="/jobs">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Create Sync Job</h2>
                    <p className="text-muted-foreground">Schedule a new backup task.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Job Details</CardTitle>
                    <CardDescription>Define source, destination, and schedule.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={addJob} className="space-y-4">
                        <div className="grid gap-2">
                            <label htmlFor="name" className="text-sm font-medium">Job Name</label>
                            <Input id="name" name="name" placeholder="e.g. Daily VM Backup" required />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <label htmlFor="sourceId" className="text-sm font-medium">Source (PVE)</label>
                                <select
                                    id="sourceId"
                                    name="sourceId"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    required
                                >
                                    <option value="">Select Source...</option>
                                    {servers.filter(s => s.type === 'pve').map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.url})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid gap-2">
                                <label htmlFor="targetId" className="text-sm font-medium">Target (PBS)</label>
                                <select
                                    id="targetId"
                                    name="targetId"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    required
                                >
                                    <option value="">Select Target...</option>
                                    {servers.filter(s => s.type === 'pbs').map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.url})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="schedule" className="text-sm font-medium">Cron Schedule</label>
                            <Input id="schedule" name="schedule" placeholder="0 0 * * *" defaultValue="0 0 * * *" required />
                            <p className="text-xs text-muted-foreground">Standard cron expression (e.g. 0 0 * * * = daily at midnight).</p>
                        </div>

                        <div className="pt-4 flex justify-end gap-2">
                            <Link href="/jobs">
                                <Button variant="ghost" type="button">Cancel</Button>
                            </Link>
                            <Button type="submit">
                                <Save className="mr-2 h-4 w-4" /> Create Job
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
