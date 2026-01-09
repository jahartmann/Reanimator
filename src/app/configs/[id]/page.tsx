'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ArrowLeft, File, Folder, FolderOpen, Download, RotateCcw,
    Loader2, ChevronRight, Copy, CheckCircle2, BookOpen, Info, HardDrive
} from "lucide-react";

interface FileEntry {
    path: string;
    size: number;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Build tree structure
function buildTree(files: FileEntry[]): Record<string, any> {
    const root: Record<string, any> = {};
    for (const file of files) {
        const parts = file.path.split('/').filter(Boolean);
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                current[part] = { _file: true, _size: file.size, _path: file.path };
            } else {
                if (!current[part]) current[part] = {};
                current = current[part];
            }
        }
    }
    return root;
}

function TreeNode({ name, node, path, onFileClick, level = 0 }: any) {
    const [expanded, setExpanded] = useState(level < 2);
    const isFile = node._file;

    if (isFile) {
        return (
            <div
                className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer"
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={() => onFileClick(node._path)}
            >
                <File className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(node._size)}</span>
            </div>
        );
    }

    const childKeys = Object.keys(node).filter(k => !k.startsWith('_'));
    return (
        <div>
            <div
                className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer font-medium"
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={() => setExpanded(!expanded)}
            >
                {expanded ? (
                    <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                ) : (
                    <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                )}
                <span>{name}</span>
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </div>
            {expanded && (
                <div>
                    {childKeys.sort().map(key => (
                        <TreeNode
                            key={key}
                            name={key}
                            node={node[key]}
                            path={`${path}/${key}`}
                            onFileClick={onFileClick}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ConfigBackupDetailPage() {
    const params = useParams();
    const backupId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [guideContent, setGuideContent] = useState<string | null>(null);
    const [systemInfo, setSystemInfo] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('guide');

    useEffect(() => {
        loadData();
    }, [backupId]);

    // Added special handling for guide and system info
    async function loadData() {
        setLoading(true);
        try {
            const res = await fetch(`/api/config-backups/${backupId}`);
            const data = await res.json();
            setFiles(data);

            // Fetch Guide automatically
            const guideRes = await fetch(`/api/config-backups/${backupId}?file=WIEDERHERSTELLUNG.md`);
            const guideData = await guideRes.json();
            setGuideContent(guideData.content);

            // Fetch System Info automatically
            const sysRes = await fetch(`/api/config-backups/${backupId}?file=SYSTEM_INFO.txt`);
            const sysData = await sysRes.json();
            setSystemInfo(sysData.content);
        } catch (err) {
            console.error('Failed to load data:', err);
        }
        setLoading(false);
    }

    async function loadFileContent(filePath: string) {
        setSelectedFile(filePath);
        try {
            const res = await fetch(`/api/config-backups/${backupId}?file=${encodeURIComponent(filePath)}`);
            const data = await res.json();
            setFileContent(data.content);
        } catch (err) {
            setFileContent('Fehler beim Laden der Datei.');
        }
    }

    const tree = buildTree(files);

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto">
            <div className="flex items-center gap-4">
                <Link href="/configs">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Reanimator Backup</h2>
                    <p className="text-muted-foreground">
                        {files.length} Dateien · Gesichert am {new Date().toLocaleDateString('de-DE')}
                    </p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
                    <TabsTrigger value="guide">Anleitung</TabsTrigger>
                    <TabsTrigger value="files">Dateien</TabsTrigger>
                    <TabsTrigger value="info">System-Info</TabsTrigger>
                </TabsList>

                {/* GUIDE TAB */}
                <TabsContent value="guide" className="space-y-4">
                    <Card className="border-indigo-500/20 bg-indigo-500/5">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-indigo-500" />
                                Wiederherstellungs-Anleitung
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="prose dark:prose-invert max-w-none">
                                {guideContent ? (
                                    <pre className="whitespace-pre-wrap font-sans text-sm">{guideContent}</pre>
                                ) : (
                                    <p className="text-muted-foreground">Keine Anleitung gefunden.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* FILES TAB */}
                <TabsContent value="files" className="space-y-4">
                    <div className="grid lg:grid-cols-3 gap-6">
                        <Card className="h-[700px] overflow-hidden flex flex-col lg:col-span-1">
                            <CardHeader className="shrink-0 p-4 border-b">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Folder className="h-4 w-4" /> Dateisystem
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 overflow-auto p-2">
                                {loading ? (
                                    <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                                ) : (
                                    <div className="font-mono text-sm">
                                        {Object.keys(tree).sort().map(key => (
                                            <TreeNode
                                                key={key}
                                                name={key}
                                                node={tree[key]}
                                                path={key}
                                                onFileClick={loadFileContent}
                                            />
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="h-[700px] overflow-hidden flex flex-col lg:col-span-2">
                            <CardHeader className="shrink-0 p-4 border-b bg-muted/30">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <File className="h-4 w-4" />
                                    {selectedFile || 'Datei auswählen'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 overflow-auto p-0 bg-[#1e1e1e] text-zinc-300">
                                {fileContent ? (
                                    <pre className="p-4 text-xs font-mono whitespace-pre">{fileContent}</pre>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        Wählen Sie eine Datei aus der Liste.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* INFO TAB */}
                <TabsContent value="info" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Info className="h-5 w-5 text-blue-500" />
                                System Informationen
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid lg:grid-cols-2 gap-4">
                                <div className="p-4 rounded bg-muted/50">
                                    <h3 className="font-medium mb-2 flex items-center gap-2">
                                        <HardDrive className="h-4 w-4" /> Disk UUIDs
                                    </h3>
                                    <pre className="text-xs font-mono whitespace-pre-wrap bg-background p-2 rounded border">
                                        Coming soon (in new backup)
                                    </pre>
                                </div>
                                <div className="p-4 rounded bg-muted/50">
                                    <h3 className="font-medium mb-2">System Status</h3>
                                    <pre className="text-xs font-mono whitespace-pre-wrap bg-background p-2 rounded border">
                                        {systemInfo || 'Keine Info verfügbar'}
                                    </pre>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
