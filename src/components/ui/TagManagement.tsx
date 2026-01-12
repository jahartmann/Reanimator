'use client';

import { useState, useEffect } from 'react';
import { Tag, getTags, createTag, deleteTag, syncTagsFromProxmox, pushTagsToServer } from '@/app/actions/tags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function TagManagement({ serverId }: { serverId: number }) {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#EF4444'); // Default red
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        loadTags();
    }, []);

    async function loadTags() {
        setLoading(true);
        try {
            const fetchedTags = await getTags();
            setTags(fetchedTags);
        } catch (e) {
            toast.error('Failed to load tags');
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateTag() {
        if (!newTagName) return;
        try {
            const res = await createTag(newTagName, newTagColor);
            if (res.success && res.tag) {
                setTags([...tags, res.tag]);
                setNewTagName('');
                toast.success('Tag created');
            } else {
                toast.error(res.error || 'Failed to create tag');
            }
        } catch (e) {
            toast.error('Failed to create tag');
        }
    }

    async function handleDeleteTag(id: number) {
        if (!confirm('Are you sure? This will only delete the tag from the local database.')) return;
        try {
            await deleteTag(id);
            setTags(tags.filter(t => t.id !== id));
            toast.success('Tag deleted');
        } catch (e) {
            toast.error('Failed to delete tag');
        }
    }

    async function handleSync() {
        setSyncing(true);
        try {
            const res = await syncTagsFromProxmox(serverId);
            if (res.success) {
                toast.success(res.message);
                loadTags();
            } else {
                toast.error(res.message);
            }
        } catch (e) {
            toast.error('Sync failed');
        } finally {
            setSyncing(false);
        }
    }

    async function handlePush() {
        setSyncing(true);
        try {
            const res = await pushTagsToServer(serverId, tags);
            if (res.success) {
                toast.success('Tags pushed to server');
            } else {
                toast.error(res.message);
            }
        } catch (e) {
            toast.error('Push failed');
        } finally {
            setSyncing(false);
        }
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span>Tag Management</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                            Sync from Proxmox
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handlePush} disabled={syncing}>
                            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                            Push to Proxmox
                        </Button>
                    </div>
                </CardTitle>
                <CardDescription>
                    Manage tags locally and sync with Proxmox.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-4">
                    {/* Create New Tag */}
                    <div className="flex gap-2 items-end">
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <label htmlFor="tagName" className="text-sm font-medium">Name</label>
                            <Input
                                id="tagName"
                                placeholder="e.g. production"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                            />
                        </div>
                        <div className="grid items-center gap-1.5">
                            <label htmlFor="tagColor" className="text-sm font-medium">Color</label>
                            <Input
                                id="tagColor"
                                type="color"
                                className="w-12 h-10 p-1 cursor-pointer"
                                value={newTagColor}
                                onChange={(e) => setNewTagColor(e.target.value)}
                            />
                        </div>
                        <Button onClick={handleCreateTag} disabled={!newTagName}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create
                        </Button>
                    </div>

                    <div className="border rounded-md p-4 min-h-[100px]">
                        {loading ? (
                            <div className="flex justify-center p-4">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                        ) : tags.length === 0 ? (
                            <div className="text-center text-muted-foreground p-4">
                                No tags found.
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {tags.map(tag => (
                                    <div key={tag.id} className="flex items-center gap-1 bg-secondary rounded-full pl-3 pr-1 py-1">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: tag.color.startsWith('#') ? tag.color : `#${tag.color}` }}
                                        />
                                        <span className="text-sm font-medium mr-1">{tag.name}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 rounded-full hover:bg-destructive/20 hover:text-destructive"
                                            onClick={() => handleDeleteTag(tag.id)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
