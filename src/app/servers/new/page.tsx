'use client'

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, AlertCircle, CheckCircle2, Wand2, Key, Terminal } from "lucide-react";
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
        const manuallyEnteredToken = formData.get('token') as string;
        const token = generatedToken || manuallyEnteredToken;
        const type = formData.get('type') as 'pve' | 'pbs';

        if (!url || !token) {
            setTestResult({ success: false, message: 'URL und Token werden benötigt.' });
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
            setTestResult({ success: false, message: 'URL, Benutzername und Passwort werden benötigt.' });
            setGenLoading(false);
            return;
        }

        const res = await generateApiToken(url, user, pass, type);
        if (res.success && res.token) {
            setGeneratedToken(res.token);
            setTestResult({ success: true, message: 'Token erfolgreich generiert!' });
        } else {
            setTestResult({ success: false, message: 'Token-Generierung fehlgeschlagen: ' + res.message });
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
                    <h2 className="text-2xl font-bold tracking-tight">Server hinzufügen</h2>
                    <p className="text-muted-foreground">Proxmox VE oder Backup Server verbinden.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Server-Konfiguration</CardTitle>
                    <CardDescription>Wählen Sie die Authentifizierungsmethode.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={addServer} className="space-y-6">
                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <label htmlFor="name" className="text-sm font-medium">Anzeigename</label>
                                <Input id="name" name="name" placeholder="z.B. PVE Node 1" required />
                            </div>

                            <div className="grid gap-2">
                                <label htmlFor="type" className="text-sm font-medium">Server-Typ</label>
                                <select
                                    id="type"
                                    name="type"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    <option value="pve">Proxmox VE (PVE)</option>
                                    <option value="pbs">Proxmox Backup Server (PBS)</option>
                                </select>
                            </div>

                            <div className="grid gap-2">
                                <label htmlFor="url" className="text-sm font-medium">API URL</label>
                                <Input id="url" name="url" placeholder="https://192.168.1.10:8006" required />
                                <p className="text-xs text-muted-foreground">Mit Protokoll und Port.</p>
                            </div>
                        </div>

                        {/* SSH Configuration for Config Backups */}
                        <div className="border rounded-lg p-4 bg-muted/20">
                            <div className="flex items-center gap-2 text-sm font-medium mb-4">
                                <Terminal className="h-4 w-4 text-indigo-500" />
                                <span>SSH für Config-Backups</span>
                                <span className="text-muted-foreground font-normal">(optional)</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <label htmlFor="ssh_host" className="text-sm font-medium">SSH Host</label>
                                    <Input id="ssh_host" name="ssh_host" placeholder="IP oder Hostname (leer = aus URL)" />
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="ssh_port" className="text-sm font-medium">SSH Port</label>
                                    <Input id="ssh_port" name="ssh_port" type="number" placeholder="22" defaultValue="22" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div className="grid gap-2">
                                    <label htmlFor="ssh_user" className="text-sm font-medium">SSH Benutzer</label>
                                    <Input id="ssh_user" name="ssh_user" placeholder="root" defaultValue="root" />
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="ssh_password" className="text-sm font-medium">SSH Passwort</label>
                                    <Input id="ssh_password" name="ssh_password" type="password" placeholder="Passwort für SSH" />
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground mt-2">
                                Wird benötigt um /etc/pve/ und /etc/proxmox-backup/ zu sichern.
                            </p>
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="auto">Automatisch (Benutzer/Passwort)</TabsTrigger>
                                <TabsTrigger value="manual">Manuell (API Token)</TabsTrigger>
                            </TabsList>

                            <TabsContent value="auto" className="space-y-4 pt-4 border rounded-md p-4 bg-muted/20">
                                <div className="flex items-center gap-2 text-sm text-indigo-400 mb-2">
                                    <Wand2 className="h-4 w-4" />
                                    <span>Zugangsdaten eingeben, um automatisch API Token zu generieren.</span>
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="username" className="text-sm font-medium">Benutzername</label>
                                    <Input id="username" name="username" placeholder="root@pam" />
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="password" className="text-sm font-medium">Passwort</label>
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
                                    {genLoading ? 'Generiere...' : generatedToken ? 'Token generiert!' : 'Token generieren'}
                                </Button>
                            </TabsContent>

                            <TabsContent value="manual" className="space-y-4 pt-4 border rounded-md p-4 bg-muted/20">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                    <Key className="h-4 w-4" />
                                    <span>Vorhandenen API Token eingeben.</span>
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="token" className="text-sm font-medium">API Token</label>
                                    <Input
                                        id="token"
                                        name="token"
                                        type="password"
                                        placeholder="user@pam!token_id=secret"
                                        defaultValue={generatedToken}
                                        key={generatedToken}
                                    />
                                </div>
                            </TabsContent>
                        </Tabs>

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
                            <Button
                                type="button"
                                variant="outline"
                                disabled={testing || (activeTab === 'auto' && !generatedToken)}
                                onClick={(e) => {
                                    const form = e.currentTarget.closest('form');
                                    if (form) handleTest(new FormData(form));
                                }}
                            >
                                {testing ? 'Teste...' : 'Verbindung testen'}
                            </Button>

                            <div className="flex gap-2">
                                <Link href="/servers">
                                    <Button variant="ghost" type="button">Abbrechen</Button>
                                </Link>
                                <Button type="submit" disabled={!generatedToken && activeTab === 'auto'}>
                                    <Save className="mr-2 h-4 w-4" /> Server speichern
                                </Button>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
