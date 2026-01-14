'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
    ArrowRight, ArrowLeft, Loader2, CheckCircle2, AlertTriangle,
    Server as ServerIcon, Database, ArrowRightLeft, HardDrive, Network
} from "lucide-react";
import { getServers } from '@/app/actions/server';
import { startServerMigration } from "@/app/actions/migration";
import { getVMs, VirtualMachine } from "@/app/actions/vm";
import { setupSSHTrust } from '@/app/actions/trust';
import { Badge } from "@/components/ui/badge";

// Interface for Mapping
interface VMMapping {
    vmid: string;
    targetStorage: string;
    targetBridge: string;
}

export default function NewMigrationPage() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    // 0: Source/Target
    // 1: VM Selection
    // 2: Resource Mapping
    // 3: Options
    // 4: Confirm

    const [servers, setServers] = useState<any[]>([]);

    // Step 0 Data
    const [sourceId, setSourceId] = useState<string>('');
    const [targetId, setTargetId] = useState<string>('');
    const [loadingResources, setLoadingResources] = useState(false);
    const [targetResources, setTargetResources] = useState<{ storages: string[], bridges: string[] }>({ storages: [], bridges: [] });

    // Step 1 Data
    const [vms, setVms] = useState<VirtualMachine[]>([]);
    const [loadingVms, setLoadingVms] = useState(false);
    const [selectedVmIds, setSelectedVmIds] = useState<string[]>([]);

    // Step 2 Data
    const [mappings, setMappings] = useState<Record<string, VMMapping>>({});

    // Step 3 Data
    const [options, setOptions] = useState({
        autoVmid: true,
        online: false, // Snapshot mode
        deleteSource: false,
        // Config Clone Options
        cloneConfig: false,
        cloneNetwork: true,
        cloneFirewall: false,
        cloneTags: true
    });

    // Execution State
    const [starting, setStarting] = useState(false);
    const [showSshFix, setShowSshFix] = useState(false);
    const [sshPassword, setSshPassword] = useState('');
    const [fixingSsh, setFixingSsh] = useState(false);


    // --- Load Servers ---
    useEffect(() => {
        getServers().then(setServers).catch(console.error);
    }, []);

    // --- Load Source VMs ---
    useEffect(() => {
        if (!sourceId) return;
        setLoadingVms(true);
        setVms([]);
        setSelectedVmIds([]);
        getVMs(parseInt(sourceId))
            .then(res => setVms(res))
            .catch(console.error)
            .finally(() => setLoadingVms(false));
    }, [sourceId]);

    // --- Load Target Resources ---
    useEffect(() => {
        if (!targetId) return;
        setLoadingResources(true);
        import('@/app/actions/server').then(mod => {
            mod.getServerResources(parseInt(targetId))
                .then(setTargetResources)
                .catch(console.error)
                .finally(() => setLoadingResources(false));
        });
    }, [targetId]);

    // --- Initialize Mappings when Selection Changes ---
    useEffect(() => {
        const newMappings = { ...mappings };
        selectedVmIds.forEach(vmid => {
            if (!newMappings[vmid]) {
                newMappings[vmid] = {
                    vmid,
                    targetStorage: 'auto',
                    targetBridge: 'auto'
                };
            }
        });
        setMappings(newMappings);
    }, [selectedVmIds]);


    // --- Actions ---

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedVmIds(vms.map(v => v.vmid));
        } else {
            setSelectedVmIds([]);
        }
    };

    const handleBulkMap = (key: 'targetStorage' | 'targetBridge', value: string) => {
        const newMaps = { ...mappings };
        selectedVmIds.forEach(id => {
            if (newMaps[id]) newMaps[id][key] = value;
        });
        setMappings(newMaps);
    };

    const handleStart = async () => {
        setStarting(true);
        try {
            // Prepare Payload
            const selectedVMs = vms.filter(v => selectedVmIds.includes(v.vmid));
            const migrationPayload = selectedVMs.map(vm => ({
                vmid: vm.vmid,
                type: vm.type,
                name: vm.name,
                targetStorage: mappings[vm.vmid]?.targetStorage === 'auto' ? undefined : mappings[vm.vmid]?.targetStorage,
                targetBridge: mappings[vm.vmid]?.targetBridge === 'auto' ? undefined : mappings[vm.vmid]?.targetBridge
            }));

            const res = await startServerMigration(
                parseInt(sourceId),
                parseInt(targetId),
                migrationPayload,
                {
                    autoVmid: options.autoVmid,
                    // If we had config cloning support in migration.ts we would pass it here
                    // For now, startServerMigration might just handle VMs. 
                    // We will update startServerMigration to accept detailed maps.
                }
            );

            if (res.success && res.taskId) {
                router.push(`/migrations/${res.taskId}`);
            } else {
                if (res.message && (res.message.includes('SSH') || res.message.includes('Permission denied'))) {
                    setShowSshFix(true);
                } else {
                    alert('Fehler: ' + res.message);
                }
                setStarting(false);
            }
        } catch (e: any) {
            const msg = e.message || String(e);
            if (msg.includes('SSH') || msg.includes('Permission denied')) setShowSshFix(true);
            else alert('Error: ' + msg);
            setStarting(false);
        }
    };

    const handleFixSsh = async () => {
        if (!sshPassword) return;
        setFixingSsh(true);
        try {
            await setupSSHTrust(parseInt(sourceId), parseInt(targetId), sshPassword);
            alert('SSH Trust repariert. Bitte versuchen Sie es erneut.');
            setShowSshFix(false);
            setSshPassword('');
        } catch (e: any) {
            alert('Fehler: ' + e.message);
        } finally {
            setFixingSsh(false);
        }
    };


    return (
        <div className="max-w-5xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8">Neue Migration</h1>

            <div className="grid md:grid-cols-4 gap-8">
                {/* Steps Sidebar */}
                <div className="md:col-span-1 space-y-2">
                    {[
                        { t: 'Quelle & Ziel', d: 'Server wählen' },
                        { t: 'VM Auswahl', d: `${selectedVmIds.length} gewählt` },
                        { t: 'Mapping', d: 'Ressourcen zuweisen' },
                        { t: 'Optionen', d: 'Global Settings' },
                        { t: 'Bestätigung', d: 'Starten' }
                    ].map((s, idx) => (
                        <div key={idx} className={`flex items-center p-3 rounded-lg border transition-colors ${step === idx ? 'bg-primary/10 border-primary' : (step > idx ? 'bg-muted border-transparent opacity-50' : 'border-transparent opacity-50')}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border font-bold text-sm mr-3 ${step === idx ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                                {step > idx ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : idx + 1}
                            </div>
                            <div>
                                <div className="font-medium text-sm">{s.t}</div>
                                <div className="text-xs text-muted-foreground">{s.d}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Content */}
                <div className="md:col-span-3">
                    <Card className="min-h-[500px] flex flex-col">
                        <CardContent className="p-6 flex-1 flex flex-col">

                            {/* STEP 0: Servers */}
                            {step === 0 && (
                                <div className="space-y-8 animate-in fade-in">
                                    <h2 className="text-xl font-semibold flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" /> Welcher Weg?</h2>

                                    {servers.length === 0 ? (
                                        <div className="p-8 border-2 border-dashed rounded-lg text-center space-y-4">
                                            <div className="flex justify-center"><ServerIcon className="h-10 w-10 text-muted-foreground/50" /></div>
                                            <h3 className="font-semibold text-lg">Keine Server gefunden</h3>
                                            <p className="text-muted-foreground">Bitte fügen Sie erst Proxmox Server hinzu.</p>
                                            <Button variant="outline" onClick={() => router.push('/servers')}>Zu den Servern</Button>
                                        </div>
                                    ) : (
                                        <div className="grid gap-6 md:grid-cols-2">
                                            <div className="space-y-3">
                                                <Label className="text-base font-semibold">Quell-Server (VON)</Label>
                                                <Card className={`cursor-pointer transition-all hover:border-primary/50 ${sourceId ? 'border-primary bg-primary/5' : ''}`}>
                                                    <CardContent className="p-0">
                                                        <Select value={sourceId} onValueChange={(v) => {
                                                            setSourceId(v);
                                                            // Auto-reset target if same
                                                            if (v === targetId) setTargetId('');
                                                        }}>
                                                            <SelectTrigger className="w-full h-auto p-4 border-0 bg-transparent focus:ring-0">
                                                                <div className="flex items-center gap-4 text-left">
                                                                    <div className="bg-background p-2 rounded-full border shadow-sm">
                                                                        <ServerIcon className="h-5 w-5 text-muted-foreground" />
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <div className="font-bold text-lg">
                                                                            {servers.find(s => s.id.toString() === sourceId)?.name || 'Bitte wählen...'}
                                                                        </div>
                                                                        {sourceId && <div className="text-xs text-muted-foreground">{servers.find(s => s.id.toString() === sourceId)?.host}</div>}
                                                                    </div>
                                                                </div>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {servers.map(s => (
                                                                    <SelectItem key={s.id} value={s.id.toString()} disabled={s.id.toString() === targetId} className="cursor-pointer">
                                                                        <span className="font-medium">{s.name}</span> <span className="text-muted-foreground text-xs ml-2">({s.host})</span>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </CardContent>
                                                </Card>
                                            </div>

                                            <div className="space-y-3">
                                                <Label className="text-base font-semibold">Ziel-Server (NACH)</Label>
                                                <Card className={`cursor-pointer transition-all hover:border-primary/50 ${targetId ? 'border-primary bg-primary/5' : ''}`}>
                                                    <CardContent className="p-0">
                                                        <Select value={targetId} onValueChange={setTargetId}>
                                                            <SelectTrigger className="w-full h-auto p-4 border-0 bg-transparent focus:ring-0">
                                                                <div className="flex items-center gap-4 text-left">
                                                                    <div className="bg-background p-2 rounded-full border shadow-sm">
                                                                        <ServerIcon className="h-5 w-5 text-muted-foreground" />
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <div className="font-bold text-lg">
                                                                            {servers.find(s => s.id.toString() === targetId)?.name || 'Bitte wählen...'}
                                                                        </div>
                                                                        {targetId && <div className="text-xs text-muted-foreground">{servers.find(s => s.id.toString() === targetId)?.host}</div>}
                                                                    </div>
                                                                </div>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {servers.map(s => (
                                                                    <SelectItem key={s.id} value={s.id.toString()} disabled={s.id.toString() === sourceId} className="cursor-pointer">
                                                                        <span className="font-medium">{s.name}</span> <span className="text-muted-foreground text-xs ml-2">({s.host})</span>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </CardContent>
                                                </Card>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Buttons for Step 0 */}
                                    <div className="flex flex-col gap-4 pt-6 mt-4 border-t">
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm text-muted-foreground">
                                                {sourceId && targetId ? (
                                                    loadingVms ? <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Lade Objekte...</span> : <span>{vms.length} Objekte gefunden.</span>
                                                ) : <span>Wähle Server um fortzufahren.</span>}
                                            </div>

                                            <div className="flex gap-4">
                                                <Button
                                                    variant="secondary"
                                                    className="gap-2"
                                                    disabled={!sourceId || !targetId || loadingVms || vms.length === 0}
                                                    onClick={() => {
                                                        setSelectedVmIds(vms.map(v => v.vmid));
                                                        setStep(2);
                                                    }}
                                                >
                                                    <Database className="h-4 w-4" />
                                                    Alles Migrieren
                                                </Button>

                                                <Button
                                                    disabled={!sourceId || !targetId || loadingVms}
                                                    onClick={() => setStep(1)}
                                                >
                                                    Auswahl Treffen <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {loadingResources && <div className="text-sm text-muted-foreground animate-pulse text-center">Lade Ziel-Ressourcen...</div>}
                                </div>
                            )}

                            {/* STEP 1: VM Selection */}
                            {step === 1 && (
                                <div className="space-y-4 animate-in fade-in flex-1 flex flex-col">
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-xl font-semibold">VMs Auswählen</h2>
                                        <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-md">
                                            <Checkbox id="selectAll" checked={selectedVmIds.length === vms.length && vms.length > 0} onCheckedChange={(c) => handleSelectAll(!!c)} />
                                            <Label htmlFor="selectAll" className="text-sm cursor-pointer whitespace-nowrap">Alle wählen</Label>
                                        </div>
                                    </div>

                                    {vms.length === 0 && !loadingVms && (
                                        <div className="text-center py-10 border-2 border-dashed rounded-lg text-muted-foreground">
                                            Keine VMs oder Container auf dem Quellserver gefunden.
                                        </div>
                                    )}

                                    {loadingVms ? (
                                        <div className="flex items-center justify-center flex-1"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                                    ) : (
                                        <div className="border rounded-md flex-1 overflow-y-auto max-h-[400px]">
                                            <table className="w-full text-sm">
                                                <thead className="bg-muted/90 backdrop-blur sticky top-0 z-10">
                                                    <tr className="text-left border-b">
                                                        <th className="p-3 w-10"></th>
                                                        <th className="p-3">ID</th>
                                                        <th className="p-3">Name</th>
                                                        <th className="p-3">Type</th>
                                                        <th className="p-3">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {vms.map(vm => (
                                                        <tr key={vm.vmid} className={`hover:bg-muted/50 cursor-pointer transition-colors ${selectedVmIds.includes(vm.vmid) ? 'bg-blue-500/10' : ''}`} onClick={() => {
                                                            if (selectedVmIds.includes(vm.vmid)) setSelectedVmIds(p => p.filter(id => id !== vm.vmid));
                                                            else setSelectedVmIds(p => [...p, vm.vmid]);
                                                        }}>
                                                            <td className="p-3">
                                                                <Checkbox checked={selectedVmIds.includes(vm.vmid)} />
                                                            </td>
                                                            <td className="p-3 font-mono text-xs">{vm.vmid}</td>
                                                            <td className="p-3 font-medium">{vm.name}</td>
                                                            <td className="p-3 text-muted-foreground uppercase text-xs">{vm.type}</td>
                                                            <td className="p-3">
                                                                <Badge variant={vm.status === 'running' ? 'default' : 'secondary'} className="text-[10px] h-5">
                                                                    {vm.status}
                                                                </Badge>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-xs text-muted-foreground border-t pt-2">
                                        <span>{vms.length} Objekte total</span>
                                        <span className="font-semibold text-primary">{selectedVmIds.length} für Migration markiert</span>
                                    </div>
                                </div>
                            )}

                            {/* STEP 2: Mapping */}
                            {step === 2 && (
                                <div className="space-y-4 animate-in fade-in flex-1 flex flex-col">
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-xl font-semibold">Ressourcen Zuweisung</h2>
                                        <div className="flex gap-2">
                                            <Select onValueChange={(v) => handleBulkMap('targetStorage', v)}>
                                                <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Bulk Storage..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="auto">Auto</SelectItem>
                                                    {targetResources.storages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <Select onValueChange={(v) => handleBulkMap('targetBridge', v)}>
                                                <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Bulk Net..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="auto">Auto</SelectItem>
                                                    {targetResources.bridges.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="border rounded-md flex-1 overflow-y-auto max-h-[400px]">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted sticky top-0 z-10">
                                                <tr className="text-left">
                                                    <th className="p-3">VM</th>
                                                    <th className="p-3 w-1/3">Target Storage</th>
                                                    <th className="p-3 w-1/3">Target Network</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {vms.filter(v => selectedVmIds.includes(v.vmid)).map(vm => (
                                                    <tr key={vm.vmid}>
                                                        <td className="p-3">
                                                            <div className="font-medium">{vm.name}</div>
                                                            <div className="text-xs text-muted-foreground">{vm.vmid}</div>
                                                        </td>
                                                        <td className="p-2">
                                                            <Select value={mappings[vm.vmid]?.targetStorage || 'auto'} onValueChange={(v) => {
                                                                const m = { ...mappings };
                                                                if (!m[vm.vmid]) m[vm.vmid] = { vmid: vm.vmid, targetStorage: 'auto', targetBridge: 'auto' };
                                                                m[vm.vmid].targetStorage = v;
                                                                setMappings(m);
                                                            }}>
                                                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="auto"><span className="text-muted-foreground italic">Auto</span></SelectItem>
                                                                    {targetResources.storages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                                </SelectContent>
                                                            </Select>
                                                        </td>
                                                        <td className="p-2">
                                                            <Select value={mappings[vm.vmid]?.targetBridge || 'auto'} onValueChange={(v) => {
                                                                const m = { ...mappings };
                                                                if (!m[vm.vmid]) m[vm.vmid] = { vmid: vm.vmid, targetStorage: 'auto', targetBridge: 'auto' };
                                                                m[vm.vmid].targetBridge = v;
                                                                setMappings(m);
                                                            }}>
                                                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="auto"><span className="text-muted-foreground italic">Auto</span></SelectItem>
                                                                    {targetResources.bridges.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                                                </SelectContent>
                                                            </Select>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* STEP 3: Options */}
                            {step === 3 && (
                                <div className="space-y-6 animate-in fade-in">
                                    <h2 className="text-xl font-semibold">Optionen</h2>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="p-4 border rounded-lg space-y-4">
                                            <h3 className="font-medium flex items-center gap-2"><ServerIcon className="h-4 w-4" /> Migration Strategie</h3>
                                            <div className="space-y-3">
                                                <div className="flex items-start gap-3">
                                                    <Checkbox id="autoVmid" checked={options.autoVmid} onCheckedChange={(c) => setOptions(o => ({ ...o, autoVmid: !!c }))} />
                                                    <div className="grid gap-1.5 leading-none">
                                                        <Label htmlFor="autoVmid">Auto VMID</Label>
                                                        <p className="text-xs text-muted-foreground">Weist automatisch neue IDs auf dem Ziel zu um Konflikte zu vermeiden.</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <Checkbox id="online" checked={options.online} onCheckedChange={(c) => setOptions(o => ({ ...o, online: !!c }))} />
                                                    <div className="grid gap-1.5 leading-none">
                                                        <Label htmlFor="online">Online Mode</Label>
                                                        <p className="text-xs text-muted-foreground">Snapshot Migration ohne Downtime (Experimentell).</p>
                                                    </div>
                                                </div>
                                                {/* Future: Delete Source? */}
                                            </div>
                                        </div>

                                        <div className="p-4 border rounded-lg space-y-4">
                                            <h3 className="font-medium flex items-center gap-2"><Database className="h-4 w-4" /> Config Cloning</h3>
                                            <p className="text-xs text-muted-foreground mb-2">Diese Funktion kopiert Server-Einstellungen VOR der Migration.</p>

                                            <div className="flex items-center gap-2">
                                                <Checkbox id="cloneCfg" checked={options.cloneConfig} onCheckedChange={(c) => setOptions(o => ({ ...o, cloneConfig: !!c }))} />
                                                <Label htmlFor="cloneCfg">Server Config Sync aktivieren</Label>
                                            </div>

                                            {options.cloneConfig && (
                                                <div className="pl-6 space-y-2 mt-2 border-l-2 ml-1">
                                                    <div className="flex items-center gap-2"><Checkbox checked={options.cloneNetwork} onCheckedChange={(c) => setOptions(o => ({ ...o, cloneNetwork: !!c }))} /> <span className="text-sm">Netzwerk (interfaces)</span></div>
                                                    <div className="flex items-center gap-2"><Checkbox checked={options.cloneFirewall} onCheckedChange={(c) => setOptions(o => ({ ...o, cloneFirewall: !!c }))} /> <span className="text-sm">Firewall Regelsätze</span></div>
                                                    <div className="flex items-center gap-2"><Checkbox checked={options.cloneTags} onCheckedChange={(c) => setOptions(o => ({ ...o, cloneTags: !!c }))} /> <span className="text-sm">Tags & UI Settings</span></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* STEP 4: Confirm */}
                            {step === 4 && (
                                <div className="space-y-6 animate-in fade-in text-center py-8">
                                    <div className="inline-flex items-center justify-center p-6 bg-blue-100 dark:bg-blue-900/20 rounded-full mb-4 animate-pulse">
                                        <ArrowRightLeft className="h-12 w-12 text-blue-600" />
                                    </div>
                                    <h2 className="text-3xl font-bold">Bereit zur Migration</h2>
                                    <p className="text-muted-foreground max-w-md mx-auto">
                                        Sie sind dabei, <strong>{selectedVmIds.length} VMs</strong> von
                                        <em> {servers.find(s => s.id.toString() === sourceId)?.name}</em> nach
                                        <em> {servers.find(s => s.id.toString() === targetId)?.name}</em> zu verschieben.
                                    </p>

                                    <div className="flex justify-center gap-8 py-4 text-sm">
                                        <div className="text-center">
                                            <div className="font-bold text-xl">{selectedVmIds.length}</div>
                                            <div className="text-muted-foreground">VMs</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="font-bold text-xl">{options.autoVmid ? 'Neu' : 'Erhalten'}</div>
                                            <div className="text-muted-foreground">IDs</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="font-bold text-xl">{options.online ? 'Online' : 'Offline'}</div>
                                            <div className="text-muted-foreground">Modus</div>
                                        </div>
                                    </div>

                                    <Button size="lg" className="w-full max-w-sm mx-auto" onClick={handleStart} disabled={starting}>
                                        {starting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRight className="mr-2 h-5 w-5" />}
                                        Migration Starten
                                    </Button>
                                </div>
                            )}


                            {/* Navigation Buttons (Bottom) */}
                            <div className="mt-auto pt-6 flex justify-between border-t">
                                <Button variant="ghost" onClick={() => step > 0 ? setStep(step - 1) : router.back()} disabled={starting}>
                                    <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
                                </Button>

                                {step < 4 && (
                                    <Button onClick={() => setStep(step + 1)} disabled={
                                        (step === 0 && (!sourceId || !targetId)) ||
                                        (step === 1 && selectedVmIds.length === 0)
                                    }>
                                        Weiter <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* SSH Fix Dialog */}
            <Dialog open={showSshFix} onOpenChange={setShowSshFix}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>SSH Verbindung Reparieren</DialogTitle>
                        <DialogDescription>Geben Sie das Root-Passwort des Zielservers ein.</DialogDescription>
                    </DialogHeader>
                    <Input type="password" value={sshPassword} onChange={(e) => setSshPassword(e.target.value)} placeholder="Root Passwort" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSshFix(false)}>Abbrechen</Button>
                        <Button onClick={handleFixSsh} disabled={fixingSsh}>{fixingSsh && <Loader2 className="mr-2 animate-spin" />} Reparieren</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
