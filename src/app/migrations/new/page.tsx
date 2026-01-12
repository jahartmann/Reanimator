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
import { Badge } from "@/components/ui/badge";

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
    const [cloneOptions, setCloneOptions] = useState({
        network: true,
        hosts: false,
        dns: false,
        timezone: false,
        locale: false,
        tags: true,
        storage: false
    });

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

                            {/* Step 2: Preparation (Guide + Config) */}
                            {step === 2 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-xl font-semibold">Vorbereitung</h2>
                                        <p className="text-sm text-muted-foreground">
                                            Bereiten Sie den Ziel-Server vor, um eine reibungslose Migration zu gewährleisten.
                                        </p>
                                    </div>

                                    {/* Manual Checklist Guide */}
                                    <Alert className="bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300">
                                        <Info className="h-4 w-4" />
                                        <AlertTitle>Manuelle Prüfliste</AlertTitle>
                                        <AlertDescription className="text-sm mt-2">
                                            <ul className="list-disc ml-4 space-y-1">
                                                <li><strong>Storage Pools:</strong> Stellen Sie sicher, dass auf dem Ziel Pools mit <em>identischen Namen</em> (z.B. <code>local-lvm</code>) existieren.</li>
                                                <li><strong>Netzwerk:</strong> Prüfen Sie, ob benötigte Bridges (z.B. <code>vmbr1</code>) vorhanden sind. (Oder klonen Sie die Config unten).</li>
                                                <li><strong>Warnung:</strong> Kopieren von <code>fstab</code> oder UUID-basierten Mounts kann zu Boot-Fehlern führen.</li>
                                            </ul>
                                        </AlertDescription>
                                    </Alert>

                                    {/* Config Cloning UI */}
                                    <div className="border rounded-md p-4 space-y-4">
                                        <h3 className="font-medium flex items-center gap-2">
                                            <Server className="h-4 w-4 text-muted-foreground" />
                                            Konfiguration klonen (Optional)
                                        </h3>

                                        <div className="grid md:grid-cols-3 gap-4">
                                            {/* Network Column */}
                                            <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Netzwerk</h4>
                                                <div className="space-y-2">
                                                    <div className="flex items-start space-x-2">
                                                        <Checkbox id="c-net" checked={cloneOptions.network} onCheckedChange={c => setCloneOptions(o => ({ ...o, network: !!c }))} />
                                                        <div className="grid gap-1.5 leading-none">
                                                            <Label htmlFor="c-net">Interfaces</Label>
                                                            <p className="text-[10px] text-muted-foreground">/etc/network/interfaces</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-start space-x-2">
                                                        <Checkbox id="c-hosts" checked={cloneOptions.hosts} onCheckedChange={c => setCloneOptions(o => ({ ...o, hosts: !!c }))} />
                                                        <div className="grid gap-1.5 leading-none">
                                                            <Label htmlFor="c-hosts">Hosts</Label>
                                                            <p className="text-[10px] text-muted-foreground">/etc/hosts (Backup erstellt)</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-start space-x-2">
                                                        <Checkbox id="c-dns" checked={cloneOptions.dns} onCheckedChange={c => setCloneOptions(o => ({ ...o, dns: !!c }))} />
                                                        <div className="grid gap-1.5 leading-none">
                                                            <Label htmlFor="c-dns">DNS</Label>
                                                            <p className="text-[10px] text-muted-foreground">/etc/resolv.conf</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* System Column */}
                                            <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System</h4>
                                                <div className="space-y-2">
                                                    <div className="flex items-start space-x-2">
                                                        <Checkbox id="c-tz" checked={cloneOptions.timezone} onCheckedChange={c => setCloneOptions(o => ({ ...o, timezone: !!c }))} />
                                                        <div className="grid gap-1.5 leading-none">
                                                            <Label htmlFor="c-tz">Timezone</Label>
                                                            <p className="text-[10px] text-muted-foreground">Setzt Zeitzone neu</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-start space-x-2">
                                                        <Checkbox id="c-loc" checked={cloneOptions.locale} onCheckedChange={c => setCloneOptions(o => ({ ...o, locale: !!c }))} />
                                                        <div className="grid gap-1.5 leading-none">
                                                            <Label htmlFor="c-loc">Locale</Label>
                                                            <p className="text-[10px] text-muted-foreground">Generiert Locales neu</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Proxmox Column */}
                                            <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proxmox</h4>
                                                <div className="space-y-2">
                                                    <div className="flex items-start space-x-2">
                                                        <Checkbox id="c-tags" checked={cloneOptions.tags} onCheckedChange={c => setCloneOptions(o => ({ ...o, tags: !!c }))} />
                                                        <div className="grid gap-1.5 leading-none">
                                                            <Label htmlFor="c-tags">Tags & Farben</Label>
                                                            <p className="text-[10px] text-muted-foreground">datacenter.cfg</p>
                                                        </div>
                                                    </div>

                                                    {/* Storage Config with Warning */}
                                                    <div className="flex items-start space-x-2">
                                                        <Checkbox id="c-sto" checked={cloneOptions.storage} onCheckedChange={c => setCloneOptions(o => ({ ...o, storage: !!c }))} />
                                                        <div className="grid gap-1.5 leading-none">
                                                            <div className="flex items-center gap-2">
                                                                <Label htmlFor="c-sto" className="text-red-600 dark:text-red-400 font-bold">Storage Config</Label>
                                                                <Badge variant="destructive" className="text-[9px] h-4 px-1">Warnung</Badge>
                                                            </div>
                                                            <p className="text-[10px] text-red-600/80">Kopiert UUIDs! Gefahr bei abweichender Hardware.</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <Button
                                            onClick={handleClone}
                                            disabled={cloning}
                                            className="w-full"
                                            variant={Object.values(cloneOptions).some(Boolean) ? 'default' : 'secondary'}
                                        >
                                            {cloning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Server className="h-4 w-4 mr-2" />}
                                            Ausgewählte Konfigurationen klonen
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
                                                                <div className="mt-2 max-h-32 overflow-y-auto text-[10px] font-mono bg-black/5 p-2 rounded">
                                                                    {cloneResult.details.map((line, i) => (
                                                                        <div key={i}>{line}</div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </AlertDescription>
                                                    </div>
                                                </div>
                                            </Alert>
                                        )}
                                    </div>

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

