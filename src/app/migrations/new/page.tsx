'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Server, HardDrive, Network, CheckCircle, Loader2, Monitor, Smartphone } from "lucide-react";
import { getVMs, VirtualMachine, getTargetResources } from '@/app/actions/vm';

interface ServerOption {
    id: number;
    name: string;
    type: string;
}

export default function NewMigrationPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [servers, setServers] = useState<ServerOption[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [sourceId, setSourceId] = useState<string>('');
    const [targetId, setTargetId] = useState<string>('');
    const [targetStorage, setTargetStorage] = useState<string>('');
    const [targetBridge, setTargetBridge] = useState<string>('');

    // Preview data
    const [vms, setVms] = useState<VirtualMachine[]>([]);
    const [storages, setStorages] = useState<string[]>([]);
    const [bridges, setBridges] = useState<string[]>([]);
    const [loadingResources, setLoadingResources] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchServers();
    }, []);

    async function fetchServers() {
        try {
            const res = await fetch('/api/servers');
            if (res.ok) {
                const data = await res.json();
                setServers(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function handleSourceSelect(id: string) {
        setSourceId(id);
        setVms([]);

        if (id) {
            try {
                const vmList = await getVMs(parseInt(id));
                setVms(vmList);
            } catch (e) {
                console.error(e);
            }
        }
    }

    async function handleTargetSelect(id: string) {
        setTargetId(id);
        setStorages([]);
        setBridges([]);
        setTargetStorage('');
        setTargetBridge('');

        if (id) {
            setLoadingResources(true);
            try {
                const res = await getTargetResources(parseInt(id));
                setStorages(res.storages);
                setBridges(res.bridges);
                if (res.storages.length > 0) setTargetStorage(res.storages[0]);
                if (res.bridges.length > 0) setTargetBridge(res.bridges[0]);
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingResources(false);
            }
        }
    }

    async function handleSubmit() {
        setSubmitting(true);
        try {
            const res = await fetch('/api/migrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceId: parseInt(sourceId),
                    targetId: parseInt(targetId),
                    targetStorage,
                    targetBridge
                })
            });

            if (res.ok) {
                const data = await res.json();
                router.push(`/migrations/${data.taskId}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    }

    const canProceed = () => {
        if (step === 1) return !!sourceId;
        if (step === 2) return !!targetId && !!targetStorage && !!targetBridge;
        if (step === 3) return true;
        return false;
    };

    const sourceName = servers.find(s => s.id === parseInt(sourceId))?.name;
    const targetName = servers.find(s => s.id === parseInt(targetId))?.name;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/migrations">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Neue Server-Migration</h1>
                    <p className="text-muted-foreground">Migriere alle VMs und Konfigurationen</p>
                </div>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center gap-2">
                {[1, 2, 3].map((s) => (
                    <div key={s} className="flex items-center gap-2 flex-1">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${step > s ? 'bg-primary text-primary-foreground' :
                                step === s ? 'bg-primary/20 text-primary border-2 border-primary' :
                                    'bg-muted text-muted-foreground'
                            }`}>
                            {step > s ? <CheckCircle className="h-4 w-4" /> : s}
                        </div>
                        <span className={`text-sm ${step >= s ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {s === 1 ? 'Quelle' : s === 2 ? 'Ziel' : 'Bestätigen'}
                        </span>
                        {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
                    </div>
                ))}
            </div>

            <Card>
                <CardContent className="p-6">
                    {/* Step 1: Source */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div>
                                <Label className="text-base">Quell-Server auswählen</Label>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Von welchem Server sollen VMs und Konfigurationen migriert werden?
                                </p>
                                <Select value={sourceId} onValueChange={handleSourceSelect}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Server auswählen..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {servers.map(s => (
                                            <SelectItem key={s.id} value={s.id.toString()}>
                                                <div className="flex items-center gap-2">
                                                    <Server className="h-4 w-4" />
                                                    {s.name}
                                                    <Badge variant="secondary" className="text-xs">{s.type}</Badge>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {sourceId && vms.length > 0 && (
                                <div>
                                    <Label className="text-sm text-muted-foreground">Gefundene VMs/Container:</Label>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {vms.map(vm => (
                                            <Badge key={vm.vmid} variant="outline" className="gap-1">
                                                {vm.type === 'qemu' ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                                                {vm.name} ({vm.vmid})
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Target */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div>
                                <Label className="text-base">Ziel-Server auswählen</Label>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Wohin sollen die VMs und Konfigurationen migriert werden?
                                </p>
                                <Select value={targetId} onValueChange={handleTargetSelect}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Server auswählen..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {servers.filter(s => s.id !== parseInt(sourceId)).map(s => (
                                            <SelectItem key={s.id} value={s.id.toString()}>
                                                <div className="flex items-center gap-2">
                                                    <Server className="h-4 w-4" />
                                                    {s.name}
                                                    <Badge variant="secondary" className="text-xs">{s.type}</Badge>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {targetId && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <Label className="flex items-center gap-2 mb-2">
                                            <HardDrive className="h-4 w-4" />
                                            Ziel-Storage
                                        </Label>
                                        {loadingResources ? (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" /> Lade...
                                            </div>
                                        ) : (
                                            <Select value={targetStorage} onValueChange={setTargetStorage}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {storages.map(s => (
                                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                    <div>
                                        <Label className="flex items-center gap-2 mb-2">
                                            <Network className="h-4 w-4" />
                                            Ziel-Netzwerk
                                        </Label>
                                        {loadingResources ? (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" /> Lade...
                                            </div>
                                        ) : (
                                            <Select value={targetBridge} onValueChange={setTargetBridge}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {bridges.map(b => (
                                                        <SelectItem key={b} value={b}>{b}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Confirm */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="text-center py-4">
                                <div className="inline-flex items-center gap-4 px-6 py-4 bg-muted/50 rounded-lg">
                                    <div className="text-right">
                                        <p className="text-sm text-muted-foreground">Von</p>
                                        <p className="font-bold text-lg">{sourceName}</p>
                                    </div>
                                    <ArrowRight className="h-6 w-6 text-primary" />
                                    <div className="text-left">
                                        <p className="text-sm text-muted-foreground">Nach</p>
                                        <p className="font-bold text-lg">{targetName}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="border rounded-lg p-4 space-y-3">
                                <h3 className="font-medium">Migrations-Schritte:</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-primary" />
                                        Konfiguration sichern & übertragen
                                    </div>
                                    {vms.filter(v => v.type === 'qemu').map(vm => (
                                        <div key={vm.vmid} className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-primary" />
                                            VM {vm.vmid} - {vm.name}
                                        </div>
                                    ))}
                                    {vms.filter(v => v.type === 'lxc').map(lxc => (
                                        <div key={lxc.vmid} className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-primary" />
                                            LXC {lxc.vmid} - {lxc.name}
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-primary" />
                                        Migration abschließen
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 text-sm">
                                <span>⚠️</span>
                                <span>Die Migration kann je nach Größe der VMs einige Zeit dauern. Der Prozess läuft im Hintergrund.</span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-between">
                <Button
                    variant="outline"
                    onClick={() => setStep(s => Math.max(1, s - 1))}
                    disabled={step === 1}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Zurück
                </Button>

                {step < 3 ? (
                    <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
                        Weiter
                        <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                ) : (
                    <Button onClick={handleSubmit} disabled={submitting} className="bg-primary">
                        {submitting ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird gestartet...</>
                        ) : (
                            <>Migration starten</>
                        )}
                    </Button>
                )}
            </div>
        </div>
    );
}
