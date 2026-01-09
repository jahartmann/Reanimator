'use client'

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { addServer } from '@/app/actions';
import { testConnection } from '@/app/actions/management';
import { useState } from 'react';

export default function NewServerPage() {
    const [testResult, setTestResult] = useState<{ success: boolean, message: string } | null>(null);
    const [testing, setTesting] = useState(false);

    async function handleTest(formData: FormData) {
        setTesting(true);
        setTestResult(null);

        const url = formData.get('url') as string;
        const token = formData.get('token') as string;
        const type = formData.get('type') as 'pve' | 'pbs';

        if (!url || !token) {
            setTestResult({ success: false, message: 'URL and Token are required for testing.' });
            setTesting(false);
            return;
        }

        const result = await testConnection(url, token, type);
        setTestResult(result);
        setTesting(false);
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex items-center gap-4">
                <Link href="/servers">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Add New Server</h2>
                    <p className="text-muted-foreground">Connect a Proxmox VE or Backup Server node.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Server Configuration</CardTitle>
                    <CardDescription>Enter the connection details for your Proxmox node.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={addServer} className="space-y-4">
                        <div className="grid gap-2">
                            <label htmlFor="name" className="text-sm font-medium">Display Name</label>
                            <Input id="name" name="name" placeholder="e.g. Cluster Node 1" required />
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="type" className="text-sm font-medium">Server Type</label>
                            <select
                                id="type"
                                name="type"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="pve">Proxmox VE (PVE)</option>
                                <option value="pbs">Proxmox Backup Server (PBS)</option>
                            </select>
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="url" className="text-sm font-medium">API URL</label>
                            <Input id="url" name="url" placeholder="https://192.168.1.10:8006" required />
                            <p className="text-xs text-muted-foreground">Include protocol and port.</p>
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="token" className="text-sm font-medium">API Token / Password</label>
                            <Input id="token" name="token" type="password" placeholder="user@pam!token_id=secret" />
                            <p className="text-xs text-muted-foreground">Full API Token (preferred) or User Password.</p>
                        </div>

                        {testResult && (
                            <div className={`p-3 rounded-md flex items-center gap-2 text-sm ${testResult.success ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                                {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                {testResult.message}
                            </div>
                        )}

                        <div className="pt-4 flex justify-between gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                disabled={testing}
                                onClick={(e) => {
                                    const form = e.currentTarget.closest('form');
                                    if (form) handleTest(new FormData(form));
                                }}
                            >
                                {testing ? 'Testing...' : 'Test Connection'}
                            </Button>

                            <div className="flex gap-2">
                                <Link href="/servers">
                                    <Button variant="ghost" type="button">Cancel</Button>
                                </Link>
                                <Button type="submit">
                                    <Save className="mr-2 h-4 w-4" /> Save Server
                                </Button>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
