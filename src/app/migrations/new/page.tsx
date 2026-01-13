'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowRight, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Info, Server, Database, Box, HardDrive } from "lucide-react";
import { getServers } from "@/app/actions/server";
import { startServerMigration, startVMMigration } from "@/app/actions/migration";
import { getVMs, VirtualMachine } from "@/app/actions/vm";
import { Badge } from "@/components/ui/badge";

export default function NewMigrationPage() {
    const router = useRouter();
    const [step, setStep] = useState(0); // 0: Mode Selection, 1: Source/Target, 2: Config, 3: Validate, 4: Confirm
    const [servers, setServers] = useState<any[]>([]);
    const [mode, setMode] = useState<'server' | 'vm'>('server');

    // Step 1: Selection
    const [sourceId, setSourceId] = useState<string>('');
    const [targetId, setTargetId] = useState<string>('');
    const [vms, setVms] = useState<VirtualMachine[]>([]);
    const [loadingVms, setLoadingVms] = useState(false);
    const [selectedVmId, setSelectedVmId] = useState<string>('');

    // Step 2: Preparation (Clone Config / VM Options)
    const [cloning, setCloning] = useState(false);
    const [cloneResult, setCloneResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null);
    const [cloneOptions, setCloneOptions] = useState({
        network: true,
        hosts: false,
        dns: false,
        firewall: false,
        users: false,
        domains: false,
        timezone: false,
        locale: false,
        modules: false,
        sysctl: false,
        tags: true,
        storage: false,
        backup: false
    });

    // Single VM Specific Options
    const [vmOptions, setVmOptions] = useState({
        targetStorage: '',
        targetBridge: '',
        autoVmid: true,
        online: false
    });

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
            setSelectedVmId('');
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

    const [targetResources, setTargetResources] = useState<{ storages: string[], bridges: string[] }>({ storages: [], bridges: [] });
    const [loadingResources, setLoadingResources] = useState(false);

    // Fetch target resources when targetId changes
    useEffect(() => {
        if (!targetId) return;
        async function loadResources() {
            setLoadingResources(true);
            try {
                const { getServerResources } = await import('@/app/actions/server');
                const res = await getServerResources(parseInt(targetId));
                setTargetResources(res);
            } catch (e) {
                console.error('Failed to load target resources', e);
            } finally {
                setLoadingResources(false);
            }
        }
        loadResources();
    }, [targetId]);


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
            let res;
            if (mode === 'server') {
                res = await startServerMigration(
                    parseInt(sourceId),
                    parseInt(targetId),
                    vms,
                    {}
                );
            } else {
                // Single VM Migration
                const targetVm = vms.find(v => v.vmid === selectedVmId);
                if (!targetVm) throw new Error("Keine VM ausgewählt");

                res = await startVMMigration(
                    parseInt(sourceId),
                    parseInt(targetId),
                    { vmid: targetVm.vmid, type: targetVm.type, name: targetVm.name },
                    {
                        targetStorage: vmOptions.targetStorage || undefined,
                        targetBridge: vmOptions.targetBridge || undefined,
                        autoVmid: vmOptions.autoVmid,
                        online: vmOptions.online
                    }
                );
            }

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

    // Helper to get total steps based on mode
    const totalSteps = mode === 'server' ? 4 : 3;

    return (
        <div className="max-w-4xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8">Neue Migration</h1>

            <div className="grid md:grid-cols-3 gap-8">
                {/* Steps Indicator */}
                <div className="md:col-span-1 space-y-4">
                    <StepIndicator current={step} number={0} title="Modus" desc="Server oder VM?" />
                    <StepIndicator current={step} number={1} title="Quelle & Ziel" desc="Server wählen" />
                    {mode === 'server' && (
                        <StepIndicator current={step} number={2} title="Vorbereitung" desc="Config Klonen" />
                    )}
                    {mode === 'vm' && (
                        <StepIndicator current={step} number={2} title="Optionen" desc="VM Einstellungen" />
                    )}
                    <StepIndicator current={step} number={mode === 'server' ? 3 : 99} title="Prüfung" desc="Voraussetzungen" hidden={mode === 'vm'} />
                    <StepIndicator current={step} number={mode === 'server' ? 4 : 3} title="Bestätigung" desc="Starten" />
                </div>

                {/* Content Area */}
                <div className="md:col-span-2">
                    <Card>
                        <CardContent className="pt-6">

                            {/* Step 0: Mode Selection */}
                            {step === 0 && (
                                <div className="space-y-6">
                                    <h2 className="text-xl font-semibold">Was möchten Sie migrieren?</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div
                                            className={`cursor-pointer p-6 border-2 rounded-lg hover:border-blue-500 transition-all ${mode === 'server' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-muted'}`}
                                            onClick={() => setMode('server')}
                                        >
                                            <Server className="h-10 w-10 mb-4 text-blue-600" />
                                            <h3 className="font-bold mb-2">Ganzen Server</h3>
                                            <p className="text-sm text-muted-foreground">Alle VMs, Container und Konfigurationen auf einen anderen Server übertragen.</p>
                                        </div>
                                        <div
                                            className={`cursor-pointer p-6 border-2 rounded-lg hover:border-purple-500 transition-all ${mode === 'vm' ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20' : 'border-muted'}`}
                                            onClick={() => setMode('vm')}
                                        >
                                            <Box className="h-10 w-10 mb-4 text-purple-600" />
                                            <h3 className="font-bold mb-2">Einzelne VM / LXC</h3>
                                            <p className="text-sm text-muted-foreground">Einen spezifischen Container oder eine VM auf einen anderen Server verschieben.</p>
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-4">
                                        <Button onClick={() => setStep(1)}>
                                            Weiter <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}

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
                                                    {mode === 'vm' ? <Box className="h-4 w-4 mr-2" /> : <Database className="h-4 w-4 mr-2" />}
                                                    {mode === 'vm' ? 'VM Auswählen' : 'Zu migrierende Ressourcen'}
                                                </h3>
                                                {loadingVms ? (
                                                    <div className="flex items-center text-sm text-muted-foreground">
                                                        <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                                        Lade VMs...
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        {mode === 'vm' ? (
                                                            // Single VM Selection
                                                            <Select value={selectedVmId} onValueChange={setSelectedVmId}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="VM / Container wählen..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {vms.map(vm => (
                                                                        <SelectItem key={vm.vmid} value={vm.vmid}>
                                                                            <span className="font-mono mr-2">[{vm.vmid}]</span> {vm.name} ({vm.type})
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            // Server Mode Summary
                                                            <div className="text-sm space-y-3">
                                                                <div className="flex gap-4">
                                                                    <span>{vms.filter(v => v.type === 'qemu').length} VMs</span>
                                                                    <span>{vms.filter(v => v.type === 'lxc').length} LXC Container</span>
                                                                </div>
                                                                {/* Overview Table */}
                                                                <div className="max-h-48 overflow-y-auto border rounded-md">
                                                                    <table className="w-full text-xs">
                                                                        <thead className="bg-muted sticky top-0">
                                                                            <tr><th className="text-left p-2">ID</th><th className="text-left p-2">Name</th></tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {vms.slice(0, 10).map(vm => (
                                                                                <tr key={vm.vmid} className="border-t"><td className="p-2 font-mono">{vm.vmid}</td><td className="p-2">{vm.name || '-'}</td></tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex justify-between pt-4">
                                            <Button variant="outline" onClick={() => setStep(0)}>
                                                <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
                                            </Button>
                                            <Button
                                                onClick={() => setStep(2)}
                                                disabled={!sourceId || !targetId || loadingVms || (mode === 'vm' && !selectedVmId) || (mode === 'server' && vms.length === 0)}
                                            >
                                                Weiter <ArrowRight className="ml-2 h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Preparation / Options */}
                            {step === 2 && (
                                <div className="space-y-6">
                                    {mode === 'server' ? (
                                        // SERVER MODE: Clone Config
                                        <>
                                            <div>
                                                <h2 className="text-xl font-semibold">Vorbereitung (Server)</h2>
                                                <p className="text-sm text-muted-foreground">Einstellungen klonen.</p>
                                            </div>

                                            {/* Config Cloning UI (REUSED) */}
                                            <div className="border rounded-md p-4 space-y-4">
                                                {/* ... Existing Cloning Checkboxes ... */}
                                                <p className="text-sm text-muted-foreground mb-4">Wählen Sie Konfigurationen, die vor der Migration auf den Zielserver übertragen werden sollen.</p>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label className="font-bold">Netzwerk & Zugriff</Label>
                                                        <div className="flex items-center gap-2"><Checkbox checked={cloneOptions.network} onCheckedChange={(c) => setCloneOptions(o => ({ ...o, network: !!c }))} /> Network</div>
                                                        <div className="flex items-center gap-2"><Checkbox checked={cloneOptions.users} onCheckedChange={(c) => setCloneOptions(o => ({ ...o, users: !!c }))} /> Users</div>
                                                        <div className="flex items-center gap-2"><Checkbox checked={cloneOptions.firewall} onCheckedChange={(c) => setCloneOptions(o => ({ ...o, firewall: !!c }))} /> Firewall</div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="font-bold">System</Label>
                                                        <div className="flex items-center gap-2"><Checkbox checked={cloneOptions.tags} onCheckedChange={(c) => setCloneOptions(o => ({ ...o, tags: !!c }))} /> Tags & Farben</div>
                                                        <div className="flex items-center gap-2"><Checkbox checked={cloneOptions.storage} onCheckedChange={(c) => setCloneOptions(o => ({ ...o, storage: !!c }))} /> <span className="text-red-500">Storage Config</span></div>
                                                    </div>
                                                </div>

                                                <Button onClick={handleClone} disabled={cloning} className="w-full mt-4" variant="secondary">
                                                    {cloning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Server className="h-4 w-4 mr-2" />}
                                                    Konfiguration Klonen
                                                </Button>
                                                {cloneResult && (
                                                    <Alert className={cloneResult.success ? "bg-green-500/10 text-green-700" : "bg-red-500/10"}>
                                                        <AlertTitle>{cloneResult.success ? "OK" : "Error"}</AlertTitle>
                                                        <AlertDescription>{cloneResult.message}</AlertDescription>
                                                    </Alert>
                                                )}
                                            </div>

                                            <div className="flex justify-between pt-4">
                                                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" /> Zurück</Button>
                                                <Button onClick={() => setStep(3)}>Weiter <ArrowRight className="ml-2 h-4 w-4" /></Button>
                                            </div>
                                        </>
                                    ) : (
                                        // VM MODE: Single VM Options
                                        <>
                                            <div>
                                                <h2 className="text-xl font-semibold">VM Optionen</h2>
                                                <p className="text-sm text-muted-foreground">Einstellungen für die Migration von VM {selectedVmId}.</p>
                                            </div>

                                            <div className="space-y-4 border p-4 rounded-md">
                                                <div className="grid gap-2">
                                                    <Label>Ziel Storage (Optional)</Label>
                                                    {loadingResources ? (
                                                        <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin mr-2" /> Lade Storages...</div>
                                                    ) : (
                                                        <Select value={vmOptions.targetStorage} onValueChange={(v) => setVmOptions(o => ({ ...o, targetStorage: v === 'auto' ? '' : v }))}>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Auto (Empfohlen)" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="auto">Auto (Automatisch wählen)</SelectItem>
                                                                {targetResources.storages.map(s => (
                                                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label>Ziel Bridge (Optional)</Label>
                                                    {loadingResources ? (
                                                        <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin mr-2" /> Lade Bridges...</div>
                                                    ) : (
                                                        <Select value={vmOptions.targetBridge} onValueChange={(v) => setVmOptions(o => ({ ...o, targetBridge: v === 'auto' ? '' : v }))}>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Auto (vmbr0)" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="auto">Auto (vmbr0)</SelectItem>
                                                                {targetResources.bridges.map(b => (
                                                                    <SelectItem key={b} value={b}>{b}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                </div>
                                                <div className="flex items-center space-x-2 pt-2">
                                                    <Checkbox
                                                        id="autoVmid"
                                                        checked={vmOptions.autoVmid}
                                                        onCheckedChange={(c) => setVmOptions(o => ({ ...o, autoVmid: !!c }))}
                                                    />
                                                    <Label htmlFor="autoVmid">Automatische neue VMID wählen (empfohlen)</Label>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id="online"
                                                        checked={vmOptions.online}
                                                        onCheckedChange={(c) => setVmOptions(o => ({ ...o, online: !!c }))}
                                                    />
                                                    <Label htmlFor="online">Online Migration (Live)</Label>
                                                </div>
                                            </div>

                                            <div className="flex justify-between pt-4">
                                                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" /> Zurück</Button>
                                                <Button onClick={() => setStep(3)}>Weiter zur Bestätigung <ArrowRight className="ml-2 h-4 w-4" /></Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Step 3: Confirmation (or Validation for Server) */}
                            {step === 3 && (
                                <div className="space-y-6">
                                    {mode === 'server' ? (
                                        // Server Validation Warning
                                        <>
                                            <h2 className="text-xl font-semibold">Voraussetzungen prüfen</h2>
                                            <Alert className="bg-amber-500/10 border-amber-500/50 text-amber-600">
                                                <AlertTriangle className="h-4 w-4" />
                                                <AlertTitle>Konzept: Identische Umgebung</AlertTitle>
                                                <AlertDescription>VMs werden 1:1 migriert. Stellen Sie sicher, dass Storages auf dem Ziel existieren.</AlertDescription>
                                            </Alert>
                                            <div className="flex justify-between pt-4">
                                                <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" /> Zurück</Button>
                                                <Button onClick={() => setStep(4)}>Verstanden & Weiter <ArrowRight className="ml-2 h-4 w-4" /></Button>
                                            </div>
                                        </>
                                    ) : (
                                        // VM Confirmation (Final Step for VM)
                                        <>
                                            <div className="text-center py-6">
                                                <div className="inline-flex items-center justify-center p-4 bg-purple-100 dark:bg-purple-900/20 rounded-full mb-4">
                                                    <Box className="h-8 w-8 text-purple-600" />
                                                </div>
                                                <h2 className="text-2xl font-bold mb-2">VM Migration Starten</h2>
                                                <p className="text-muted-foreground">
                                                    VM <strong>{selectedVmId}</strong> wird von Host A nach Host B verschoben.
                                                </p>
                                            </div>
                                            <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
                                                <div className="flex justify-between"><span>Quelle:</span> <span className="font-medium">{servers.find(s => s.id.toString() === sourceId)?.name}</span></div>
                                                <div className="flex justify-between"><span>Ziel:</span> <span className="font-medium">{servers.find(s => s.id.toString() === targetId)?.name}</span></div>
                                                <div className="flex justify-between"><span>VMID:</span> <span className="font-medium">{vmOptions.autoVmid ? 'Automatisch (Neu)' : 'Beibehalten'}</span></div>
                                            </div>
                                            <div className="flex justify-between pt-4">
                                                <Button variant="outline" onClick={() => setStep(2)} disabled={starting}><ArrowLeft className="mr-2 h-4 w-4" /> Zurück</Button>
                                                <Button onClick={handleStart} disabled={starting} className="bg-purple-600 hover:bg-purple-700">
                                                    {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                                                    Migration Starten
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Step 4: Server Confirmation (Only for Server Mode) */}
                            {step === 4 && mode === 'server' && (
                                <div className="space-y-6">
                                    <div className="text-center py-6">
                                        <div className="inline-flex items-center justify-center p-4 bg-green-100 dark:bg-green-900/20 rounded-full mb-4">
                                            <CheckCircle2 className="h-8 w-8 text-green-600" />
                                        </div>
                                        <h2 className="text-2xl font-bold mb-2">Server Migration Starten</h2>
                                        <p className="text-muted-foreground">
                                            <strong>{vms.length} Objekte</strong> werden verschoben.
                                        </p>
                                    </div>
                                    <div className="flex justify-between pt-4">
                                        <Button variant="outline" onClick={() => setStep(3)} disabled={starting}><ArrowLeft className="mr-2 h-4 w-4" /> Zurück</Button>
                                        <Button onClick={handleStart} disabled={starting} className="bg-green-600 hover:bg-green-700">
                                            {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                                            Alles Migrieren
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

function StepIndicator({ current, number, title, desc, hidden }: { current: number, number: number, title: string, desc: string, hidden?: boolean }) {
    if (hidden) return null;
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
                {completed ? <CheckCircle2 className="h-5 w-5" /> : number === 0 ? 'M' : number}
            </div>
            <div>
                <div className={`text-sm font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{title}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
        </div>
    );
}

