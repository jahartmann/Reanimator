'use client';

import { useState, useEffect } from 'react';
import { readNetworkConfig, saveNetworkConfig, applyNetworkConfig, saveNetworkInterfaces, NetworkInterface } from '@/app/actions/network';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, RefreshCw, Network, Plus, Trash2, Edit2, Code, ShieldAlert } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const dynamic = 'force-dynamic';

export default function NetworkPage({ params }: { params: Promise<{ id: string }> }) {
    const [serverId, setServerId] = useState<number | null>(null);
    const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
    const [rawContent, setRawContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
    const [editedRaw, setEditedRaw] = useState('');

    // For Dialog
    const [editingIface, setEditingIface] = useState<NetworkInterface | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    useEffect(() => {
        params.then(p => {
            setServerId(parseInt(p.id));
            load(parseInt(p.id));
        });
    }, [params]);

    async function load(sid: number) {
        setLoading(true);
        try {
            const data = await readNetworkConfig(sid);
            setInterfaces(data.interfaces);
            setRawContent(data.content);
            setEditedRaw(data.content);
        } catch (e) {
            toast.error("Failed to load network config");
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveRaw() {
        if (!serverId) return;
        setSaving(true);
        try {
            await saveNetworkConfig(serverId, editedRaw);
            toast.success("Saved!");
            load(serverId);
        } catch (e) {
            toast.error("Save failed");
        } finally {
            setSaving(false);
        }
    }

    async function handleApply() {
        if (!serverId) return;
        if (!confirm("Netzwerk neu laden? Verbindung könnte abbrechen!")) return;
        try {
            const res = await applyNetworkConfig(serverId);
            toast.success("Applied: " + res);
        } catch (e) {
            toast.error("Apply failed");
        }
    }

    // Helper to generate Interface Card
    const InterfaceCard = ({ iface }: { iface: NetworkInterface }) => {
        const isBridge = iface.type === 'bridge';
        const isBond = iface.type === 'bond';
        const isPhysical = iface.type === 'eth';

        return (
            <Card className={`border-l-4 ${isBridge ? 'border-l-purple-500' : isBond ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
                <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="text-lg font-mono flex items-center gap-2">
                                {iface.name}
                                {iface.auto && <Badge variant="outline" className="text-xs">Auto</Badge>}
                            </CardTitle>
                            <CardDescription>{iface.type.toUpperCase()} · {iface.method}</CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setEditingIface(iface); setIsDialogOpen(true); }}>
                            <Edit2 className="h-4 w-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                    {(iface.address || iface.method === 'static') && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">IP/CIDR</span>
                            <span className="font-mono">{iface.address || 'No IP'}</span>
                        </div>
                    )}
                    {iface.gateway && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Gateway</span>
                            <span className="font-mono">{iface.gateway}</span>
                        </div>
                    )}
                    {(isBridge || isBond) && iface.ports && (
                        <div>
                            <span className="text-muted-foreground block mb-1">Ports / Slaves:</span>
                            <div className="flex flex-wrap gap-1">
                                {iface.ports.map(p => (
                                    <Badge key={p} variant="secondary" className="font-mono">{p}</Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    }

    const bridges = interfaces.filter(i => i.type === 'bridge');
    const bonds = interfaces.filter(i => i.type === 'bond');
    const physical = interfaces.filter(i => i.type === 'eth' || i.type === 'unknown');

    // Determine which physicals are USED in bridges/bonds to grey them out or separate
    const usedPorts = new Set<string>();
    [...bridges, ...bonds].forEach(i => i.ports?.forEach(p => usedPorts.add(p)));


    // ... imports

    async function handleSaveChanges() {
        if (!serverId) return;
        setSaving(true);
        try {
            await saveNetworkInterfaces(serverId, interfaces);
            toast.success("Configuration Saved! Click 'Apply' to activate.");
            load(serverId); // Reload to confirm formatting
        } catch (e) {
            toast.error("Failed to save configuration");
            console.error(e);
        } finally {
            setSaving(false);
        }
    }

    function handleDialogSave() {
        if (!editingIface) return;
        setInterfaces(prev => prev.map(i => i.name === editingIface.name ? editingIface : i));
        setIsDialogOpen(false);
        toast.info("Interface updated locally. Click 'Save Configuration' to persist.");
    }

    // ... InterfaceCard

    // ...

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Network className="text-primary" /> Netzwerk Konfiguration
                </h1>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setViewMode(viewMode === 'visual' ? 'raw' : 'visual')}>
                        {viewMode === 'visual' ? <Code className="h-4 w-4 mr-2" /> : <Network className="h-4 w-4 mr-2" />}
                        {viewMode === 'visual' ? 'Raw Editor' : 'Visual Editor'}
                    </Button>
                    {viewMode === 'visual' && (
                        <Button onClick={handleSaveChanges} disabled={saving}>
                            <Save className="h-4 w-4 mr-2" /> Save Configuration
                        </Button>
                    )}
                    <Button variant="destructive" onClick={handleApply}>
                        <ShieldAlert className="h-4 w-4 mr-2" /> Apply
                    </Button>
                </div>
            </div>

            {loading ? (
                // ... loader
                <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8" /></div>
            ) : viewMode === 'raw' ? (
                // ... raw editor
                <Card>
                    <CardHeader><CardTitle>Raw Configuration</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea
                            className="font-mono min-h-[500px]"
                            value={editedRaw}
                            onChange={e => setEditedRaw(e.target.value)}
                        />
                        <div className="flex justify-end">
                            <Button onClick={handleSaveRaw} disabled={saving}>
                                <Save className="mr-2 h-4 w-4" /> Save
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-8">
                    {/* ... Sections (Bridges, Bonds, Physical) ... same as before */}

                    {/* Bridges Section */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 text-purple-400 flex items-center gap-2">
                            Bridges
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {bridges.map(i => <InterfaceCard key={i.name} iface={i} />)}
                            <Card className="border-dashed flex items-center justify-center h-[200px] cursor-pointer hover:bg-muted/50">
                                <div className="text-center text-muted-foreground">
                                    <Plus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    Add Bridge
                                </div>
                            </Card>
                        </div>
                    </section>

                    {/* Bonds Section */}
                    {bonds.length > 0 && (
                        <section>
                            <h2 className="text-lg font-semibold mb-4 text-amber-400">Bonds</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {bonds.map(i => <InterfaceCard key={i.name} iface={i} />)}
                            </div>
                        </section>
                    )}

                    {/* Physical/Other Section */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 text-blue-400">Interfaces</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {physical.map(i => (
                                <div key={i.name} className={usedPorts.has(i.name) ? 'opacity-50' : ''}>
                                    <InterfaceCard iface={i} />
                                    {usedPorts.has(i.name) && (
                                        <div className="text-xs text-center text-muted-foreground mt-1">
                                            Genutzt in Bridge/Bond
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {/* Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit {editingIface?.name}</DialogTitle>
                    </DialogHeader>
                    {editingIface && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>IPv4 (CIDR)</Label>
                                <Input
                                    value={editingIface.address || ''}
                                    onChange={e => setEditingIface({ ...editingIface, address: e.target.value })}
                                    placeholder="192.168.1.10/24"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Gateway</Label>
                                <Input
                                    value={editingIface.gateway || ''}
                                    onChange={e => setEditingIface({ ...editingIface, gateway: e.target.value })}
                                    placeholder="192.168.1.1"
                                />
                            </div>

                            {/* Ports Editor for Bridge/Bond */}
                            {(editingIface.type === 'bridge' || editingIface.type === 'bond') && (
                                <div className="space-y-2">
                                    <Label>Ports / Slaves (Space separated)</Label>
                                    <Input
                                        value={editingIface.ports?.join(' ') || ''}
                                        onChange={e => setEditingIface({ ...editingIface, ports: e.target.value.split(/\s+/).filter(Boolean) })}
                                        placeholder="eno1 eno2"
                                    />
                                </div>
                            )}

                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleDialogSave}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
