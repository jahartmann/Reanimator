'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Save, RefreshCw, AlertTriangle, Play, Loader2 } from "lucide-react";
import { getNetworkConfig, saveNetworkConfig, applyNetworkConfig } from '@/app/actions/network';

export default function NetworkConfigPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const serverId = parseInt(id);

    const [config, setConfig] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [applying, setApplying] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchConfig();
    }, [serverId]);

    async function fetchConfig() {
        setLoading(true);
        setMessage(null);
        try {
            const res = await getNetworkConfig(serverId);
            if (res.success) {
                setConfig(res.content || '');
            } else {
                setMessage({ type: 'error', text: res.message || 'Failed to load config' });
            }
        } catch (e) {
            setMessage({ type: 'error', text: String(e) });
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        setSaving(true);
        setMessage(null);
        try {
            const res = await saveNetworkConfig(serverId, config);
            if (res.success) {
                setMessage({ type: 'success', text: res.message });
            } else {
                setMessage({ type: 'error', text: res.message });
            }
        } catch (e) {
            setMessage({ type: 'error', text: String(e) });
        } finally {
            setSaving(false);
        }
    }

    async function handleApply() {
        if (!confirm('WARNUNG: Das Anwenden der Netzwerkkonfiguration kann dazu führen, dass der Server nicht mehr erreichbar ist! Fortfahren?')) return;

        setApplying(true);
        setMessage(null);
        try {
            const res = await applyNetworkConfig(serverId);
            if (res.success) {
                setMessage({ type: 'success', text: res.message });
            } else {
                // If it fails, it might be because connection dropped, which can mean success in changing IP
                setMessage({ type: 'error', text: res.message });
            }
        } catch (e) {
            setMessage({ type: 'error', text: String(e) });
        } finally {
            setApplying(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href={`/servers/${id}`}>
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold">Netzwerk Konfiguration</h1>
            </div>

            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Vorsicht geboten!</AlertTitle>
                <AlertDescription>
                    Fehlerhafte Änderungen an dieser Datei können dazu führen, dass der Server <strong>nicht mehr erreichbar</strong> ist.
                    Stellen Sie sicher, dass Sie Zugang zur lokalen Konsole (IPMI/Direct Access) haben, falls etwas schief geht.
                </AlertDescription>
            </Alert>

            <Card className="flex flex-col h-[600px]">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle>/etc/network/interfaces</CardTitle>
                        <CardDescription>Bearbeiten Sie die Netzwerkkonfiguration direkt.</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={fetchConfig} disabled={loading || saving || applying}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Reload
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={loading || saving || applying}>
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Speichern
                        </Button>
                        <Button variant="destructive" size="sm" onClick={handleApply} disabled={loading || saving || applying}>
                            {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                            Anwenden (ifreload)
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 p-0 relative">
                    {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <Textarea
                            className="h-full w-full resize-none font-mono text-sm p-4 border-0 rounded-none focus-visible:ring-0"
                            value={config}
                            onChange={(e) => setConfig(e.target.value)}
                            spellCheck={false}
                        />
                    )}
                </CardContent>
            </Card>

            {message && (
                <Alert variant={message.type === 'success' ? 'default' : 'destructive'} className={message.type === 'success' ? 'border-green-500 text-green-500' : ''}>
                    {message.type === 'success' ? <RefreshCw className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    <AlertTitle>{message.type === 'success' ? 'Erfolg' : 'Fehler'}</AlertTitle>
                    <AlertDescription>{message.text}</AlertDescription>
                </Alert>
            )}
        </div>
    );
}
