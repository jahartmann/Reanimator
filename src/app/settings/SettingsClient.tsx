'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings, RefreshCw, Download, CheckCircle2, AlertCircle, Loader2, Terminal, GitBranch } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface VersionInfo {
    currentVersion: string;
    currentCommit: string;
    updateAvailable: boolean;
    remoteCommit: string;
    commitsBehind: number;
}

export default function SettingsClient() {
    const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
    const [checking, setChecking] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [updateLog, setUpdateLog] = useState<string[]>([]);
    const [updateComplete, setUpdateComplete] = useState(false);
    const [updateError, setUpdateError] = useState<string | null>(null);

    useEffect(() => {
        checkForUpdates();
    }, []);

    async function checkForUpdates() {
        setChecking(true);
        try {
            const res = await fetch('/api/update');
            const data = await res.json();
            setVersionInfo(data);
        } catch (err) {
            console.error('Failed to check for updates:', err);
        }
        setChecking(false);
    }

    async function performUpdate() {
        if (!confirm('Möchten Sie das Update jetzt durchführen? Die Anwendung wird danach neu gestartet.')) return;

        setUpdating(true);
        setUpdateLog([]);
        setUpdateComplete(false);
        setUpdateError(null);

        try {
            const res = await fetch('/api/update', { method: 'POST' });
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) throw new Error('No response stream');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value);
                const lines = text.split('\n').filter(l => l.startsWith('data: '));

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line.replace('data: ', ''));
                        if (data.message) {
                            setUpdateLog(prev => [...prev, data.message]);
                        }
                        if (data.done) {
                            setUpdateComplete(true);
                        }
                        if (data.error) {
                            setUpdateError(data.error);
                        }
                    } catch {
                        // Ignore parse errors
                    }
                }
            }
        } catch (err) {
            setUpdateError(err instanceof Error ? err.message : String(err));
        }

        setUpdating(false);
    }

    async function handleRestart() {
        if (!confirm('Möchten Sie die Anwendung neu starten?')) return;
        try {
            await fetch('/api/update', {
                method: 'POST',
                headers: { 'X-Restart-Only': 'true' }
            });
        } catch {
            // Expected to fail as server restarts
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Einstellungen</h1>
                <p className="text-muted-foreground">System-Konfiguration</p>
            </div>

            {/* Update Card */}
            <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
                    <CardTitle className="flex items-center gap-2">
                        <Download className="h-5 w-5" />
                        Software-Updates
                    </CardTitle>
                    <CardDescription>
                        Halten Sie Ihre Installation auf dem neuesten Stand
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                    {/* Version Info */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                <GitBranch className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <p className="font-medium">Aktuelle Version</p>
                                {versionInfo ? (
                                    <p className="text-sm text-muted-foreground">
                                        v{versionInfo.currentVersion}
                                        <span className="font-mono text-xs ml-2 px-2 py-0.5 bg-muted rounded">
                                            {versionInfo.currentCommit}
                                        </span>
                                    </p>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Wird geladen...</p>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open('https://github.com/jahartmann/Reanimator', '_blank')}
                            >
                                <GitBranch className="h-4 w-4 mr-2" />
                                GitHub
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={checkForUpdates}
                                disabled={checking}
                            >
                                {checking ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4" />
                                )}
                                <span className="ml-2">Prüfen</span>
                            </Button>
                        </div>
                    </div>

                    {/* Update Available */}
                    {versionInfo?.updateAvailable && !updating && !updateComplete && (
                        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                <div>
                                    <p className="font-medium text-green-600">Update verfügbar!</p>
                                    <p className="text-sm text-muted-foreground">
                                        {versionInfo.commitsBehind} neue Commit{versionInfo.commitsBehind > 1 ? 's' : ''} verfügbar
                                        <span className="font-mono text-xs ml-2">
                                            ({versionInfo.currentCommit} → {versionInfo.remoteCommit})
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <Button onClick={performUpdate}>
                                <Download className="h-4 w-4 mr-2" />
                                Jetzt aktualisieren
                            </Button>
                        </div>
                    )}

                    {/* No Update */}
                    {versionInfo && !versionInfo.updateAvailable && !updating && (
                        <div className="p-4 rounded-lg bg-muted/30 border flex items-center gap-3">
                            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                                Sie verwenden die neueste Version.
                            </p>
                        </div>
                    )}

                    {/* Update Progress */}
                    {(updating || updateLog.length > 0) && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Terminal className="h-4 w-4" />
                                <span className="text-sm font-medium">Update-Log</span>
                                {updating && <Loader2 className="h-4 w-4 animate-spin ml-auto" />}
                            </div>
                            <ScrollArea className="h-[200px] w-full rounded-lg border bg-[#1e1e1e] p-4">
                                <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">
                                    {updateLog.map((line, i) => (
                                        <div key={i} className="py-0.5">{line}</div>
                                    ))}
                                </pre>
                            </ScrollArea>
                        </div>
                    )}

                    {/* Update Complete */}
                    {updateComplete && (
                        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-3">
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                            <p className="font-medium text-green-600">
                                Update erfolgreich! Die Anwendung wurde aktualisiert.
                            </p>
                        </div>
                    )}

                    {/* Update Error */}
                    {updateError && (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                            <div>
                                <p className="font-medium text-red-600">Update fehlgeschlagen</p>
                                <p className="text-sm text-red-500/80">{updateError}</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* System Maintenance */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Systemwartung
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                        <div>
                            <h4 className="font-medium">Anwendung neu starten</h4>
                            <p className="text-sm text-muted-foreground">
                                Startet den Server-Dienst neu
                            </p>
                        </div>
                        <Button variant="outline" onClick={handleRestart}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Neustarten
                        </Button>
                    </div>

                    <div className="p-4 rounded-lg border border-dashed text-sm text-muted-foreground">
                        <p><strong>Manuelles Update:</strong></p>
                        <code className="block mt-2 p-2 bg-muted rounded text-xs">
                            cd ~/Reanimator && git pull && npm install --include=dev && npm run build && sudo systemctl restart proxhost-backup
                        </code>
                    </div>
                </CardContent>
            </Card>

            {/* Info */}
            <Card>
                <CardHeader>
                    <CardTitle>Info</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p><strong>Version:</strong> {versionInfo?.currentVersion || '...'}</p>
                    <p><strong>Datenbank:</strong> SQLite (data/proxhost.db)</p>
                    <p><strong>Backups:</strong> data/config-backups/</p>
                </CardContent>
            </Card>
        </div>
    );
}
