'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { systemRestart, systemUpdate } from '@/app/actions/management';
import { Power, RefreshCcw, Save } from "lucide-react";
import { useState } from 'react';

export default function SettingsPage() {
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ success: boolean, text: string } | null>(null);

    async function handleRestart() {
        if (!confirm('Are you sure you want to restart the service?')) return;
        setLoading(true);
        const res = await systemRestart();
        setMsg({ success: res.success, text: res.message });
        setLoading(false);
    }

    async function handleUpdate() {
        if (!confirm('Are you sure you want to pull the latest changes and update? This will restart the service.')) return;
        setLoading(true);
        const res = await systemUpdate();
        setMsg({ success: res.success, text: res.message });
        setLoading(false);
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Settings</h2>
                <p className="text-muted-foreground mt-1">Configure global application preferences.</p>
            </div>

            {msg && (
                <div className={`p-4 rounded-md border ${msg.success ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500' : 'bg-destructive/10 border-destructive/50 text-destructive'}`}>
                    {msg.text}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>System Maintenance</CardTitle>
                    <CardDescription>Manage the application service and updates.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" onClick={handleRestart} disabled={loading}>
                            <Power className="mr-2 h-4 w-4" /> Restart Service
                        </Button>
                        <Button variant="secondary" onClick={handleUpdate} disabled={loading}>
                            <RefreshCcw className="mr-2 h-4 w-4" /> Update & Rebuild
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Current Mode: <span className="font-mono text-indigo-400">{process.env.NODE_ENV || 'development'}</span>
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>General Defaults</CardTitle>
                    <CardDescription>System wide configurations.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">Application Name</label>
                        <Input defaultValue="ProxHost Backup Manager" />
                    </div>
                    <Button disabled>
                        <Save className="mr-2 h-4 w-4" /> Save Preferences
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
