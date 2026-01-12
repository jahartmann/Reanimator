'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowRight, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Info, Server, Database } from "lucide-react";
import { getServers } from "@/app/actions/server";
import { startServerMigration } from "@/app/actions/migration";
import { getVMs, VirtualMachine } from "@/app/actions/vm";

export default function NewMigrationPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [servers, setServers] = useState<any[]>([]);

    // Step 1: Selection
    const [sourceId, setSourceId] = useState<string>('');
    const [targetId, setTargetId] = useState<string>('');
    const [vms, setVms] = useState<VirtualMachine[]>([]);
    const [loadingVms, setLoadingVms] = useState(false);

    // Step 2: Preparation (Clone Config)
    const [cloning, setCloning] = useState(false);
    const [cloneResult, setCloneResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null);
    const [cloneOptions, setCloneOptions] = useState({ network: true, tags: true });

    // Step 3: Validation
    const [validating, setValidating] = useState(false);

    // Final
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        async function load() {
            try {
                const s = await getServers();
                setServers(s);
            } catch (e) {
                console.error(e);
            }
        }
        load();
    }, []);

    // Load VMs when source changes
    useEffect(() => {
        if (!sourceId) return;
        async function loadVMs() {
            setLoadingVms(true);
            setVms([]);
            try {
                const res = await getVMs(parseInt(sourceId));
                setVms(res);
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingVms(false);
            }
        }
        loadVMs();
    }, [sourceId]);

    const handleClone = async () => {
        setCloning(true);
        setCloneResult(null);
        try {
            const { cloneServerConfig } = await import('@/app/actions/config');
            const res = await cloneServerConfig(parseInt(sourceId), parseInt(targetId), cloneOptions);
            setCloneResult(res);
        } catch (e: any) {
            setCloneResult({ success: false, message: e.message || String(e), details: [] });
        } finally {
            setCloning(false);
        }
    };

    const handleStart = async () => {
        setStarting(true);
        try {
            const res = await startServerMigration(
                parseInt(sourceId),
                parseInt(targetId),
                vms,
                {} // No override options -> Auto mapping
            );

            if (res.success && res.taskId) {
                router.push(`/migrations/${res.taskId}`);
            } else {
                alert('Error: ' + res.message);
                setStarting(false);
            }
        } catch (e) {
            alert('Error: ' + e);
            setStarting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8">Neue Server-Migration</h1>

            <div className="grid md:grid-cols-3 gap-8">
                {/* Steps Indicator */}
                <div className="md:col-span-1 space-y-4">
                    <StepIndicator current={step} number={1} title="Server wählen" desc="Quelle & Ziel definieren" />
                    <StepIndicator current={step} number={2} title="Vorbereitung" desc="Konfiguration klonen" />
                    <StepIndicator current={step} number={3} title="Prüfung" desc="Voraussetzungen checken" />
                    <StepIndicator current={step} number={4} title="Bestätigung" desc="Migration starten" />
                </div>

                {/* Content Area */}
                <div className="md:col-span-2">
                    <Card>
                        <CardContent className="pt-6">
                            {/* Step 1: Server Selection */}
                            {step === 1 && (
                                <div className="space-y-6">
                                    <h2 className="text-xl font-semibold">Quelle & Ziel</h2>
                                    <div className="grid gap-4">
                                        <div className="space-y-2">
                                            <Label>Quell-Server</Label>
                                            <Select value={sourceId} onValueChange={setSourceId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Wähle Quelle..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {servers.map(s => (
                                                        <SelectItem key={s.id} value={s.id.toString()} disabled={s.id.toString() === targetId}>
                                                            {s.name} ({s.host})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Ziel-Server</Label>
                                            <Select value={targetId} onValueChange={setTargetId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Wähle Ziel..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {servers.map(s => (
                                                        <SelectItem key={s.id} value={s.id.toString()} disabled={s.id.toString() === sourceId}>
                                                            {s.name} ({s.host})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {sourceId && (
                                            <div className="mt-4 p-4 border rounded-md bg-muted/40">
                                                <h3 className="font-medium mb-2 flex items-center">
                                                    <Database className="h-4 w-4 mr-2" />
                                                    Zu migrierende Ressourcen
                                                </h3>
                                                {loadingVms ? (
                                                    <div className="flex items-center text-sm text-muted-foreground">
                                                        <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                                        Lade VMs...
                                                    </div>
                                                ) : (
                                                    <div className="text-sm">
                                                        <p>{vms.filter(v => v.type === 'qemu').length} VMs</p>
                                                        <p>{vms.filter(v => v.type === 'lxc').length} LXC Container</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex justify-end pt-4">
                                            <Button
                                                onClick={() => setStep(2)}
                                                disabled={!sourceId || !targetId || loadingVms || vms.length === 0}
                                            >
                                                Weiter <ArrowRight className="ml-2 h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Preparation */}
                            {step === 2 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-xl font-semibold">Vorbereitung (Konfiguration Klonen)</h2>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Es wird empfohlen, die Netzwerkkonfiguration zu klonen, damit Ziel-Bridges (z.B. <code>vmbr2</code>) existieren.
                                        </p>
                                    </div>

                                    <div className="space-y-4 border p-4 rounded-md">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="clone-net"
                                                checked={cloneOptions.network}
                                                onCheckedChange={(c) => setCloneOptions(prev => ({ ...prev, network: !!c }))}
                                            />
                                            <Label htmlFor="clone-net">Netzwerk-Konfiguration (/etc/network/interfaces)</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="clone-tags"
                                                checked={cloneOptions.tags}
                                                onCheckedChange={(c) => setCloneOptions(prev => ({ ...prev, tags: !!c }))}
                                            />
                                            <Label htmlFor="clone-tags">Tags & Farben (datacenter.cfg)</Label>
                                        </div>
                                    </div>

                                    <Button onClick={handleClone} disabled={cloning} variant="secondary" className="w-full">
                                        {cloning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Server className="h-4 w-4 mr-2" />}
                                        Konfiguration jetzt klonen
                                    </Button>

                                    {cloneResult && (
                                        <Alert className={cloneResult.success ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-300" : "border-red-500/50 bg-red-500/10"}>
                                            <div className="flex items-start gap-2">
                                                {cloneResult.success ? <CheckCircle2 className="h-5 w-5 mt-0.5" /> : <AlertTriangle className="h-5 w-5 mt-0.5" />}
                                                <div className="flex-1">
                                                    <AlertTitle>{cloneResult.success ? "Erfolgreich" : "Fehler"}</AlertTitle>
                                                    <AlertDescription className="text-xs mt-1 space-y-1">
                                                        <p>{cloneResult.message}</p>
                                                        {cloneResult.details && (
                                                            <pre className="mt-2 p-2 bg-black/10 rounded overflow-x-auto whitespace-pre-wrap max-h-32 text-[10px] font-mono">
                                                                {cloneResult.details.join('\n')}
                                                            </pre>
                                                        )}
                                                    </AlertDescription>
                                                </div>
                                            </div>
                                        </Alert>
                                    )}

                                    <div className="flex justify-between pt-4">
                                        <Button variant="outline" onClick={() => setStep(1)}>
                                            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
                                        </Button>
                                        <Button onClick={() => setStep(3)}>
                                            Weiter zur Prüfung <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Step 3: Validation (was 2) */}
                            {step === 3 && (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-semibold">Voraussetzungen prüfen</h2>
                                    </div>

                                    <Alert className="bg-amber-500/10 border-amber-500/50 text-amber-600 dark:text-amber-400">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Konzept: Identische Umgebung</AlertTitle>
                                        <AlertDescription>
                                            <ul className="list-disc ml-5 mt-1 space-y-1">
                                                <li>VMs werden auf <strong>dieselben Storage-IDs</strong> migriert (z.B. <code>local-lvm</code> → <code>local-lvm</code>). UUIDs werden ignoriert.</li>
                                                <li>Falls eine Bridge fehlt, wird automatisch auf <code>vmbr0</code> gewechselt.</li>
                                            </ul>
                                        </AlertDescription>
                                    </Alert>

                                    <div className="flex justify-between pt-4">
                                        <Button variant="outline" onClick={() => setStep(2)}>
                                            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
                                        </Button>
                                        <Button onClick={() => setStep(4)}>
                                            Verstanden & Weiter <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Step 4: Confirm (was 3) */}
                            {step === 4 && (
                                <div className="space-y-6">
                                    <div className="text-center py-6">
                                        <div className="inline-flex items-center justify-center p-4 bg-green-100 dark:bg-green-900/20 rounded-full mb-4">
                                            <CheckCircle2 className="h-8 w-8 text-green-600" />
                                        </div>
                                        <h2 className="text-2xl font-bold mb-2">Bereit zur Migration</h2>
                                        <p className="text-muted-foreground max-w-md mx-auto">
                                            Sie sind dabei, <strong>{vms.length} Objekte</strong> von
                                            HOST A nach HOST B zu verschieben.
                                        </p>
                                    </div>

                                    <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Quelle:</span>
                                            <span className="font-medium">{servers.find(s => s.id.toString() === sourceId)?.name}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Ziel:</span>
                                            <span className="font-medium">{servers.find(s => s.id.toString() === targetId)?.name}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Modus:</span>
                                            <span className="font-medium">Live Migration (Online)</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-between pt-4">
                                        <Button variant="outline" onClick={() => setStep(3)} disabled={starting}>
                                            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
                                        </Button>
                                        <Button onClick={handleStart} disabled={starting} className="bg-green-600 hover:bg-green-700">
                                            {starting ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starte...
                                                </>
                                            ) : (
                                                <>
                                                    Migration Starten <ArrowRight className="ml-2 h-4 w-4" />
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function StepIndicator({ current, number, title, desc }: { current: number, number: number, title: string, desc: string }) {
    const active = current === number;
    const completed = current > number;

    return (
        <div className={`flex items-center p-3 rounded-lg border ${active ? 'bg-background border-primary shadow-sm' : 'bg-transparent border-transparent opacity-70'}`}>
            <div className={`
                flex items-center justify-center w-8 h-8 rounded-full border mr-3 text-sm font-medium
                ${active ? 'bg-primary text-primary-foreground border-primary' : ''}
                ${completed ? 'bg-green-500 text-white border-green-500' : ''}
                ${!active && !completed ? 'bg-muted text-muted-foreground' : ''}
            `}>
                {completed ? <CheckCircle2 className="h-5 w-5" /> : number}
            </div>
            <div>
                <div className={`text-sm font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{title}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
        </div>
    );
}

