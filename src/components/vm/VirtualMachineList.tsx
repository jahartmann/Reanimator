'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone, ArrowRightLeft, PlayCircle, StopCircle, Loader2 } from "lucide-react";
import { VirtualMachine } from '@/app/actions/vm';
import { MigrationDialog } from './MigrationDialog';
import { Tag, assignTagsToResource } from '@/app/actions/tags';
import { TagSelector } from '@/components/ui/TagSelector';
import { toast } from 'sonner';

interface VirtualMachineListProps {
    vms: VirtualMachine[];
    currentServerId: number;
    otherServers: { id: number; name: string }[];
    availableTags: Tag[];
}

export function VirtualMachineList({ vms, currentServerId, otherServers, availableTags }: VirtualMachineListProps) {
    const [selectedVm, setSelectedVm] = useState<VirtualMachine | null>(null);
    const [loadingTags, setLoadingTags] = useState<Record<string, boolean>>({});

    const handleTagsChange = async (vm: VirtualMachine, newTags: string[]) => {
        setLoadingTags(prev => ({ ...prev, [vm.vmid]: true }));
        try {
            const res = await assignTagsToResource(currentServerId, vm.vmid, newTags);
            if (res.success) {
                toast.success(`Tags updated for ${vm.name}`);
                vm.tags = newTags;
            } else {
                toast.error(res.message || 'Failed to update tags');
            }
        } catch (e) {
            toast.error('Failed to update tags');
        } finally {
            setLoadingTags(prev => ({ ...prev, [vm.vmid]: false }));
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Virtual Machines & Containers
                    <Badge variant="secondary" className="ml-2">
                        {vms.length}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {vms.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                        <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Keine VMs gefunden</p>
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {vms.map((vm) => (
                            <div
                                key={vm.vmid}
                                className="flex flex-col gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${vm.status === 'running' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                                            }`}>
                                            {vm.type === 'qemu' ? (
                                                <Monitor className="h-4 w-4" />
                                            ) : (
                                                <Smartphone className="h-4 w-4" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-sm truncate">{vm.name}</p>
                                                <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
                                                    {vm.vmid}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className={vm.status === 'running' ? 'text-green-500' : ''}>
                                                    {vm.status}
                                                </span>
                                                {vm.cpus && <span>• {vm.cpus} CPU</span>}
                                                {vm.memory && <span>• {Math.round(vm.memory / 1024 / 1024 / 1024)} GB</span>}
                                            </div>
                                            {/* Network and Storage Info */}
                                            {(vm.networks?.length || vm.storages?.length) && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {vm.networks?.map(n => (
                                                        <span key={n} className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded">
                                                            {n}
                                                        </span>
                                                    ))}
                                                    {vm.storages?.map(s => (
                                                        <span key={s} className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded">
                                                            {s}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setSelectedVm(vm)}
                                        title="Migrieren"
                                    >
                                        <ArrowRightLeft className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="pl-11">
                                    <TagSelector
                                        availableTags={availableTags}
                                        selectedTags={vm.tags || []}
                                        onTagsChange={(tags) => handleTagsChange(vm, tags)}
                                        isLoading={loadingTags[vm.vmid]}
                                        compact={true}
                                        maxVisibleTags={2}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>

            {selectedVm && (
                <MigrationDialog
                    vm={selectedVm}
                    sourceId={currentServerId}
                    otherServers={otherServers}
                    open={!!selectedVm}
                    onOpenChange={(open) => !open && setSelectedVm(null)}
                />
            )}
        </Card>
    );
}
