'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tag as TagIcon, Plus, Trash2, RefreshCw, Server, Loader2, Upload, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { Tag, getTags, createTag, deleteTag, pushTagsToServer, syncTagsFromProxmox } from '@/app/actions/tags';
import { getServers } from '@/app/actions/server';

interface ServerInfo {
    id: number;
    name: string;
}

export default function TagsPage() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [servers, setServers] = useState<ServerInfo[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<string>('');

    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3b82f6');

    const [loading, setLoading] = useState(true);
    const [pushing, setPushing] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [tagsData, serversData] = await Promise.all([
                getTags(),
                getServers()
            ]);
            setTags(tagsData);
            setServers(serversData.map(s => ({ id: s.id, name: s.name })));
            if (serversData.length > 0 && !selectedServerId) {
                setSelectedServerId(serversData[0].id.toString());
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate() {
        if (!newTagName) return;
        try {
            const res = await createTag(newTagName, newTagColor);
            if (res.success) {
                setNewTagName('');
                setMessage({ type: 'success', text: `Tag "${newTagName}" erstellt` });
                loadData();
            } else {
                setMessage({ type: 'error', text: res.error || 'Fehler' });
            }
        } catch (e) {
            setMessage({ type: 'error', text: String(e) });
        }
    }

    async function handleDelete(id: number) {
        if (!confirm('Tag wirklich löschen?')) return;
        await deleteTag(id);
        setMessage({ type: 'success', text: 'Tag gelöscht' });
        loadData();
    }

    async function handlePush() {
        if (!selectedServerId || tags.length === 0) return;
        setPushing(true);
        setMessage(null);
        try {
            const res = await pushTagsToServer(parseInt(selectedServerId), tags);
            if (res.success) {
                setMessage({ type: 'success', text: `${tags.length} Tags zu Server gepusht` });
            } else {
                setMessage({ type: 'error', text: res.message || 'Push fehlgeschlagen' });
            }
        } catch (e) {
            setMessage({ type: 'error', text: String(e) });
        } finally {
            setPushing(false);
        }
    }

    async function handleSync() {
        if (!selectedServerId) return;
        setSyncing(true);
        setMessage(null);
        try {
            const res = await syncTagsFromProxmox(parseInt(selectedServerId));
            if (res.success) {
                setMessage({ type: 'success', text: res.message || 'Synchronisiert' });
                loadData();
            } else {
                setMessage({ type: 'error', text: res.message || 'Sync fehlgeschlagen' });
            }
        } catch (e) {
            setMessage({ type: 'error', text: String(e) });
        } finally {
            setSyncing(false);
        }
    }

    const selectedServerName = servers.find(s => s.id.toString() === selectedServerId)?.name || '';

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Tags Management</h1>
                <p className="text-muted-foreground">Zentrale Verwaltung von Tags für alle Server</p>
            </div>

            {/* Feedback Message */}
            {message && (
                <Alert className={message.type === 'success' ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}>
                    {message.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}
                    <AlertDescription className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>
                        {message.text}
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid gap-6 md:grid-cols-3">
                {/* Create Tag */}
                <Card>
                    <CardHeader>
                        <CardTitle>Neuen Tag erstellen</CardTitle>
                        <CardDescription>Definieren Sie Name und Farbe</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Name</label>
                            <Input
                                placeholder="z.B. Production"
                                value={newTagName}
                                onChange={e => setNewTagName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Farbe</label>
                            <div className="flex gap-2">
                                <Input
                                    type="color"
                                    className="w-12 p-1 h-10"
                                    value={newTagColor}
                                    onChange={e => setNewTagColor(e.target.value)}
                                />
                                <Input
                                    value={newTagColor}
                                    onChange={e => setNewTagColor(e.target.value)}
                                    className="font-mono"
                                />
                            </div>
                        </div>
                        <div className="pt-2">
                            <Button className="w-full" onClick={handleCreate} disabled={!newTagName}>
                                <Plus className="h-4 w-4 mr-2" />
                                Erstellen
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Server Sync Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Server className="h-5 w-5" />
                            Server Synchronisation
                        </CardTitle>
                        <CardDescription>Tags mit Proxmox synchronisieren</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Server auswählen</label>
                            <Select value={selectedServerId} onValueChange={setSelectedServerId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Server wählen..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {servers.map(s => (
                                        <SelectItem key={s.id} value={s.id.toString()}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <Button
                                variant="outline"
                                onClick={handleSync}
                                disabled={!selectedServerId || syncing}
                            >
                                {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                                Abrufen
                            </Button>
                            <Button
                                onClick={handlePush}
                                disabled={!selectedServerId || pushing || tags.length === 0}
                            >
                                {pushing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                                Pushen
                            </Button>
                        </div>
                        {selectedServerName && (
                            <p className="text-xs text-muted-foreground text-center">
                                Ausgewählt: <strong>{selectedServerName}</strong>
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Info Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Hinweis</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-2">
                        <p><strong>Abrufen:</strong> Lädt Tags vom ausgewählten Proxmox Server und speichert sie lokal.</p>
                        <p><strong>Pushen:</strong> Schreibt alle lokalen Tags in die Datacenter-Config des Servers.</p>
                        <p className="text-amber-600">⚠️ Push überschreibt vorhandene Tag-Styles!</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tag List */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Verfügbare Tags ({tags.length})</CardTitle>
                    <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : tags.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <TagIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Keine Tags definiert</p>
                            <p className="text-xs mt-1">Erstellen Sie Tags oder rufen Sie sie von einem Server ab.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Vorschau</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Farbe (Hex)</TableHead>
                                    <TableHead className="text-right">Aktionen</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tags.map(tag => (
                                    <TableRow key={tag.id}>
                                        <TableCell>
                                            <Badge style={{ backgroundColor: `#${tag.color}`, color: '#fff' }}>
                                                {tag.name}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-medium">{tag.name}</TableCell>
                                        <TableCell className="font-mono text-muted-foreground">#{tag.color}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500"
                                                onClick={() => handleDelete(tag.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
