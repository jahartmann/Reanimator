'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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

    const [loadingResources, setLoadingResources] = useState(false);
    const [storages, setStorages] = useState<string[]>([]);
    const [bridges, setBridges] = useState<string[]>([]);

    const [migrating, setMigrating] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Fetch resources when target server changes
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

                // Set defaults
                if (res.storages.length > 0) {
                    // Prefer local-zfs or local-lvm
                    const pref = res.storages.find(s => s.includes('zfs')) || res.storages.find(s => s.includes('lvm')) || res.storages[0];
                    setTargetStorage(pref);
                }
                if (res.bridges.length > 0) {
                    setTargetBridge(res.bridges[0]);
                }
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

        setMigrating(true);
        setError(null);
        setLogs(prev => [...prev, `Starting migration of ${vm.name} (${vm.vmid})...`]);

        try {
            const res = await migrateVM(sourceId, vm.vmid, vm.type, {
                targetServerId: parseInt(targetServerId),
                targetStorage,
                targetBridge,
                online
            });

            if (res.success) {
                setLogs(prev => [...prev, 'Migration command finished successfully.', 'Log output:', res.message || '']);
                setTimeout(() => {
                    onOpenChange(false);
                    router.refresh();
                }, 2000);
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>VM Migration: {vm.name}</DialogTitle>
                    <DialogDescription>
                        Move this VM to another server.
                        {online && " Standard/Live migration is enabled."}
                    </DialogDescription>
                </DialogHeader>

                {!migrating && !error && logs.length === 0 ? (
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="target" className="text-right">Platform</Label>
                            <Select value={targetServerId} onValueChange={setTargetServerId}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select Target Server" />
                                </SelectTrigger>
                                <SelectContent>
                                    {otherServers.map(s => (
                                        <SelectItem key={s.id} value={s.id.toString()}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {targetServerId && (
                            <>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="storage" className="text-right">Storage</Label>
                                    <div className="col-span-3">
                                        {loadingResources ? (
                                            <div className="flex items-center text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading...</div>
                                        ) : (
                                            <Select value={targetStorage} onValueChange={setTargetStorage}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Storage" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {storages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="bridge" className="text-right">Network</Label>
                                    <div className="col-span-3">
                                        {loadingResources ? (
                                            <div className="flex items-center text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading...</div>
                                        ) : (
                                            <Select value={targetBridge} onValueChange={setTargetBridge}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Bridge" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {bridges.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="online" className="text-right">Online</Label>
                            <div className="col-span-3 flex items-center space-x-2">
                                <Switch id="online" checked={online} onCheckedChange={setOnline} />
                                <Label htmlFor="online" className="font-normal text-xs text-muted-foreground">Keep VM running during migration (if compatible)</Label>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="py-4">
                        <div className="bg-muted p-4 rounded-md font-mono text-xs max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                            {logs.map((log, i) => (
                                <div key={i} className="mb-1">{log}</div>
                            ))}
                            {migrating && (
                                <div className="flex items-center mt-2 text-primary">
                                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                    Migrating... (this may take a while)
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {!migrating && (
                        <>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button
                                onClick={handleMigrate}
                                disabled={!targetServerId || !targetStorage || !targetBridge || loadingResources}
                                className="bg-primary"
                            >
                                <ArrowRightLeft className="h-4 w-4 mr-2" />
                                Start Migration
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
