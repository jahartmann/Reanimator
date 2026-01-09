'use client'

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Requires update to tabs component
import { ArrowLeft, Save, AlertCircle, CheckCircle2, Wand2, Key } from "lucide-react";
import { addServer } from '@/app/actions';
import { testConnection } from '@/app/actions/management';
import { generateApiToken } from '@/app/actions/auth';
import { useState } from 'react';

export default function NewServerPage() {
    const [testResult, setTestResult] = useState<{ success: boolean, message: string } | null>(null);
    const [testing, setTesting] = useState(false);
    const [generatedToken, setGeneratedToken] = useState('');
    const [activeTab, setActiveTab] = useState('auto');
    const [genLoading, setGenLoading] = useState(false);

    async function handleTest(formData: FormData) {
        setTesting(true);
        setTestResult(null);

        const url = formData.get('url') as string;
        // Use generated token if in auto mode and available, otherwise manual input
        const manuallyEnteredToken = formData.get('token') as string;
        const token = generatedToken || manuallyEnteredToken;
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

    async function handleGenerate(formData: FormData) {
        setGenLoading(true);
        setTestResult(null);

        const url = formData.get('url') as string;
        const user = formData.get('username') as string;
        const pass = formData.get('password') as string;
        const type = formData.get('type') as 'pve' | 'pbs';

        if (!url || !user || !pass) {
            setTestResult({ success: false, message: 'URL, Username, and Password required.' });
            setGenLoading(false);
            return;
        }

        const res = await generateApiToken(url, user, pass, type);
        if (res.success && res.token) {
            setGeneratedToken(res.token);
            setTestResult({ success: true, message: 'Token generated successfully! Ready to save.' });
        } else {
            setTestResult({ success: false, message: 'Failed to generate token: ' + res.message });
        }
        setGenLoading(false);
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
                    <CardDescription>Choose how you want to authenticate.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={addServer} className="space-y-6">
                        <div className="space-y-4">
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
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="auto">Automatic (User/Pass)</TabsTrigger>
                                <TabsTrigger value="manual">Manual (API Token)</TabsTrigger>
                            </TabsList>

                            <TabsContent value="auto" className="space-y-4 pt-4 border rounded-md p-4 bg-muted/20">
                                <div className="flex items-center gap-2 text-sm text-indigo-400 mb-2">
                                    <Wand2 className="h-4 w-4" />
                                    <span>Enter credentials to auto-generate a secure API token.</span>
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="username" className="text-sm font-medium">Username</label>
                                    <Input id="username" name="username" placeholder="root@pam" />
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="password" className="text-sm font-medium">Password</label>
                                    <Input id="password" name="password" type="password" placeholder="••••••••" />
                                </div>
                                <Button
                                    type="button"
                                    onClick={(e) => {
                                        const form = e.currentTarget.closest('form');
                                        if (form) handleGenerate(new FormData(form));
                                    }}
                                    disabled={genLoading || !!generatedToken}
                                    className="w-full"
                                    variant="secondary"
                                >
                                    {genLoading ? 'Generating...' : generatedToken ? 'Token Generated!' : 'Generate Token & Connect'}
                                </Button>
                            </TabsContent>

                            <TabsContent value="manual" className="space-y-4 pt-4 border rounded-md p-4 bg-muted/20">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                    <Key className="h-4 w-4" />
                                    <span>Paste an existing API Token.</span>
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="token" className="text-sm font-medium">API Token</label>
                                    {/* If generated, we set input value, but allow override */}
                                    <Input
                                        id="token"
                                        name="token"
                                        type="password"
                                        placeholder="user@pam!token_id=secret"
                                        defaultValue={generatedToken}
                                        key={generatedToken} // Force re-render on gen
                                    />
                                </div>
                            </TabsContent>
                        </Tabs>

                        {/* Hidden input to ensure generated token is submitted if user is on auto tab */}
                        {activeTab === 'auto' && generatedToken && (
                            <input type="hidden" name="token" value={generatedToken} />
                        )}

                        {testResult && (
                            <div className={`p-3 rounded-md flex items-center gap-2 text-sm ${testResult.success ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                                {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                {testResult.message}
                            </div>
                        )}

                        <div className="pt-4 flex justify-between gap-2">
                            {/* Test only visible if manually entering or token generated */}
                            <Button
                                type="button"
                                variant="outline"
                                disabled={testing || (activeTab === 'auto' && !generatedToken)}
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
                                <Button type="submit" disabled={!generatedToken && activeTab === 'auto'}>
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
