import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Trash2, CalendarClock, ArrowRight } from "lucide-react";
import { deleteJob } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default function JobsPage() {
    const jobs = db.prepare(`
    SELECT j.*, s1.name as source_name, s2.name as target_name 
    FROM jobs j
    JOIN servers s1 ON j.source_server_id = s1.id
    JOIN servers s2 ON j.target_server_id = s2.id
    ORDER BY j.id DESC
  `).all() as any[];

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Sync Jobs</h2>
                    <p className="text-muted-foreground mt-1">Manage automated backup and synchronization schedules.</p>
                </div>
                <Link href="/jobs/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Create Job
                    </Button>
                </Link>
            </div>

            <div className="grid gap-4">
                {jobs.map((job) => (
                    <Card key={job.id} className="group hover:bg-muted/50 transition-colors">
                        <CardContent className="p-6 flex items-center gap-6">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <RefreshCw className="h-5 w-5 text-primary" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-medium leading-none mb-2">{job.name}</h3>
                                <div className="flex items-center text-sm text-muted-foreground gap-2">
                                    <span>{job.source_name}</span>
                                    <ArrowRight className="h-3 w-3" />
                                    <span>{job.target_name}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 text-sm text-muted-foreground hidden md:flex">
                                <div className="flex items-center gap-2">
                                    <CalendarClock className="h-4 w-4" />
                                    <span className="font-mono bg-secondary px-2 py-0.5 rounded text-xs">{job.schedule}</span>
                                </div>
                                <div className={job.enabled ? "text-emerald-500 font-medium" : "text-input"}>
                                    {job.enabled ? "Enabled" : "Disabled"}
                                </div>
                            </div>

                            <form action={deleteJob.bind(null, job.id)}>
                                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                ))}

                {jobs.length === 0 && (
                    <div className="py-16 text-center border-2 border-dashed border-border rounded-lg bg-card/10">
                        <RefreshCw className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                        <p className="text-lg font-medium text-muted-foreground">No jobs scheduled</p>
                        <p className="text-sm text-muted-foreground/80 mb-6">Create a sync job to automate backups.</p>
                        <Link href="/jobs/new">
                            <Button variant="outline">Create First Job</Button>
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
