'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tag as TagIcon, Plus, Trash2, RefreshCw, Server, Loader2 } from "lucide-react";
import { Tag, getTags, createTag, deleteTag, pushTagsToServer } from '@/app/actions/tags';
import { useSearchParams } from 'next/navigation';

export default function TagsPage() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3b82f6');
    const [loading, setLoading] = useState(true);
    const [pushing, setPushing] = useState<number | null>(null);

    // Fetch servers for push dialog (could be fetched from API/Action)
    // For simplicity, we assume we might push to all servers or select one.
    // Let's implement a simple "Push to Cluster" or select server button later.
    // For now, let's just create the management UI.

    useEffect(() => {
        loadTags();
    }, []);

    async function loadTags() {
        setLoading(true);
        try {
            const data = await getTags();
            setTags(data);
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
                loadTags();
            } else {
                alert(res.error);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function handleDelete(id: number) {
        if (!confirm('Tag wirklich löschen?')) return;
        await deleteTag(id);
        loadTags();
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Tags Management</h1>
                <p className="text-muted-foreground">Zentrale Verwaltung von Tags für alle Server</p>
            </div>

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

                {/* Tag List */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Verfügbare Tags</CardTitle>
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
        </div>
    );
}
