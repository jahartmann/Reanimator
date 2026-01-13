'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { VirtualMachine, migrateVM, getTargetResources } from '@/app/actions/vm';
import { useRouter } from 'next/navigation';

interface MigrationDialogProps {
    vm: VirtualMachine;
    sourceId: number;
    otherServers: { id: number; name: string }[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function MigrationDialog({ vm, sourceId, otherServers, open, onOpenChange }: MigrationDialogProps) {
    const router = useRouter();
    const [targetServerId, setTargetServerId] = useState<string>('');
    const [targetStorage, setTargetStorage] = useState<string>('');
    const [targetBridge, setTargetBridge] = useState<string>('');
    const [online, setOnline] = useState(true);

    // VMID options
    const [autoVmid, setAutoVmid] = useState(true);  // Default: auto-select next free
    const [targetVmid, setTargetVmid] = useState<string>('');

    const [loadingResources, setLoadingResources] = useState(false);
    const [storages, setStorages] = useState<string[]>([]);
    const [bridges, setBridges] = useState<string[]>([]);

    const [migrating, setMigrating] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Fetch resources
    useEffect(() => {
        if (!targetServerId) return;
        async function fetchResources() {
            setLoadingResources(true);
            setStorages([]);
            setBridges([]);
            setTargetStorage('');
            setTargetBridge('');
            try {
                const res = await getTargetResources(parseInt(targetServerId));
                setStorages(res.storages);
                setBridges(res.bridges);
                if (res.storages.length > 0) {
                    const pref = res.storages.find(s => s.includes('zfs') || s.includes('lvm')) || res.storages[0];
                    setTargetStorage(pref);
                }
                if (res.bridges.length > 0) setTargetBridge(res.bridges[0]);
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingResources(false);
            }
        }
        fetchResources();
    }, [targetServerId]);

    async function handleMigrate() {
        if (!targetServerId || !targetStorage || !targetBridge) return;
        if (!autoVmid && !targetVmid) return; // Require VMID if auto is off
        setMigrating(true);
        setError(null);
        setLogs(prev => [...prev, `Starting migration of ${vm.name} (${vm.vmid})...`]);

        try {
            const res = await migrateVM(sourceId, vm.vmid, vm.type, {
                targetServerId: parseInt(targetServerId),
                targetStorage,
                targetBridge,
                online,
                autoVmid,
                targetVmid: autoVmid ? undefined : targetVmid
            });
            if (res.success) {
                setLogs(prev => [...prev, 'Migration finished successfully.', 'Log:', res.message || '']);
                setTimeout(() => {
                    onOpenChange(false);
                    router.refresh();
                }, 1500);
            } else {
                setError(res.message);
                setLogs(prev => [...prev, `Error: ${res.message}`]);
            }
        } catch (e) {
            setError(String(e));
            setLogs(prev => [...prev, `Exception: ${String(e)}`]);
        } finally {
            setMigrating(false);
        }
    }

    const targetServerName = otherServers.find(s => s.id.toString() === targetServerId)?.name || 'Unknown';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ArrowRightLeft className="h-5 w-5" />
                        Live Migration: {vm.name}
                    </DialogTitle>
                    <DialogDescription>
                        Move virtual machine/container to another node active.
                    </DialogDescription>
                </DialogHeader>

                {!migrating && logs.length === 0 ? (
                    <div className="grid gap-6 py-4">
                        {/* Source VM Info */}
                        <div className="p-4 border rounded-lg bg-muted/30">
                            <h4 className="font-medium text-sm mb-3">Aktuelle Konfiguration</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Netzwerk:</span>
                                    <div className="font-mono mt-1">
                                        {vm.networks?.length ? vm.networks.join(', ') : <span className="text-muted-foreground">-</span>}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Storage:</span>
                                    <div className="font-mono mt-1">
                                        {vm.storages?.length ? vm.storages.join(', ') : <span className="text-muted-foreground">-</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="mb-2 block">Target Node</Label>
                                    <Select value={targetServerId} onValueChange={setTargetServerId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Server" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {otherServers.map(s => (
                                                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col justify-end pb-2">
                                    <div className="flex items-center justify-between border p-3 rounded-md bg-muted/40">
                                        <Label htmlFor="online" className="cursor-pointer">Online Mode</Label>
                                        <Switch id="online" checked={online} onCheckedChange={setOnline} />
                                    </div>
                                </div>
                            </div>

                            {targetServerId && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                                    <div>
                                        <Label className="mb-2 block">Target Storage</Label>
                                        {loadingResources ? (
                                            <div className="h-10 flex items-center px-3 border rounded-md bg-muted text-muted-foreground text-sm">
                                                <Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading...
                                            </div>
                                        ) : (
                                            <Select value={targetStorage} onValueChange={setTargetStorage}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {storages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                    <div>
                                        <Label className="mb-2 block">Target Network</Label>
                                        {loadingResources ? (
                                            <div className="h-10 flex items-center px-3 border rounded-md bg-muted text-muted-foreground text-sm">
                                                <Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading...
                                            </div>
                                        ) : (
                                            <Select value={targetBridge} onValueChange={setTargetBridge}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {bridges.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* VMID Selection */}
                            {targetServerId && (
                                <div className="p-4 border rounded-lg bg-muted/30 animate-in fade-in">
                                    <div className="flex items-center justify-between mb-3">
                                        <Label htmlFor="autoVmid" className="cursor-pointer font-medium text-sm">
                                            Automatisch nächste freie VMID verwenden
                                        </Label>
                                        <Switch id="autoVmid" checked={autoVmid} onCheckedChange={setAutoVmid} />
                                    </div>
                                    {!autoVmid && (
                                        <div className="animate-in fade-in slide-in-from-top-2">
                                            <Label className="mb-2 block text-sm">Ziel-VMID</Label>
                                            <Input
                                                type="number"
                                                placeholder={vm.vmid}
                                                value={targetVmid}
                                                onChange={(e) => setTargetVmid(e.target.value)}
                                                className="max-w-[150px]"
                                            />
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Original: {vm.vmid}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {targetServerId && targetStorage && targetBridge && (
                                <div className="mt-4 p-4 border rounded-lg bg-blue-500/5 border-blue-200 dark:border-blue-900">
                                    <h4 className="font-medium text-sm mb-2 text-blue-700 dark:text-blue-400">Migration Summary</h4>
                                    <div className="text-sm space-y-1 text-muted-foreground">
                                        <div className="flex justify-between">
                                            <span>Target:</span> <span className="font-medium text-foreground">{targetServerName}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Storage:</span> <span className="font-medium text-foreground">{targetStorage}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Network:</span> <span className="font-medium text-foreground">{targetBridge}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Mode:</span>
                                            <span className={`font-medium ${online ? 'text-green-600' : 'text-amber-600'}`}>
                                                {online ? 'Online (Live)' : 'Offline (Shutdown)'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="py-4 space-y-4">
                        <div className="bg-black/90 text-green-400 p-4 rounded-md font-mono text-xs max-h-[300px] overflow-y-auto whitespace-pre-wrap border border-green-900/50 shadow-inner">
                            {logs.map((log, i) => (
                                <div key={i} className="mb-1 border-l-2 border-transparent hover:border-green-500/50 pl-2">{log}</div>
                            ))}
                            {migrating && (
                                <div className="flex items-center mt-2 text-primary animate-pulse">
                                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                    Processing migration...
                                </div>
                            )}
                        </div>
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-center gap-2 text-sm text-red-600">
                                <AlertTriangle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {!migrating && (
                        <>
                            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button
                                onClick={handleMigrate}
                                disabled={!targetServerId || !targetStorage || !targetBridge || loadingResources}
                                className={online ? "bg-green-600 hover:bg-green-700" : ""}
                            >
                                {online ? <ArrowRightLeft className="h-4 w-4 mr-2" /> : <Loader2 className="h-4 w-4 mr-2" />}
                                {online ? 'Start Online Migration' : 'Start Offline Migration'}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
