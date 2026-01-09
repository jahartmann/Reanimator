'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft, File, Folder, FolderOpen, Download, RotateCcw,
    Loader2, Clock, HardDrive, ChevronRight, Copy, CheckCircle2
} from "lucide-react";

interface FileEntry {
    path: string;
    size: number;
}

interface BackupInfo {
    id: number;
    server_id: number;
    backup_path: string;
    backup_date: string;
    file_count: number;
    total_size: number;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
    return new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'full',
        timeStyle: 'medium'
    }).format(new Date(dateStr));
}

// Build tree structure from flat file list
function buildTree(files: FileEntry[]): Record<string, any> {
    const root: Record<string, any> = {};

    for (const file of files) {
        const parts = file.path.split('/').filter(Boolean);
        let current = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                // It's a file
                current[part] = { _file: true, _size: file.size, _path: file.path };
            } else {
                // It's a directory
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
            }
        }
    }

    return root;
}

function TreeNode({ name, node, path, onFileClick, level = 0 }: {
    name: string;
    node: any;
    path: string;
    onFileClick: (path: string) => void;
    level?: number;
}) {
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
    const [loadingFile, setLoadingFile] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        loadFiles();
    }, [backupId]);

    async function loadFiles() {
        setLoading(true);
        try {
            const res = await fetch(`/api/config-backups/${backupId}`);
            const data = await res.json();
            setFiles(data);
        } catch (err) {
            console.error('Failed to load files:', err);
        }
        setLoading(false);
    }

    async function loadFileContent(filePath: string) {
        setLoadingFile(true);
        setSelectedFile(filePath);
        try {
            const res = await fetch(`/api/config-backups/${backupId}?file=${encodeURIComponent(filePath)}`);
            const data = await res.json();
            setFileContent(data.content);
        } catch (err) {
            console.error('Failed to load file:', err);
            setFileContent(null);
        }
        setLoadingFile(false);
    }

    function copyToClipboard() {
        if (fileContent) {
            navigator.clipboard.writeText(fileContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }

    const tree = buildTree(files);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/configs">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Backup Details</h2>
                    <p className="text-muted-foreground">
                        {files.length} Dateien gesichert
                    </p>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* File Tree */}
                <Card className="h-[600px] overflow-hidden flex flex-col">
                    <CardHeader className="shrink-0">
                        <CardTitle className="flex items-center gap-2">
                            <Folder className="h-5 w-5" />
                            Dateien
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-2">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
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

                {/* File Content */}
                <Card className="h-[600px] overflow-hidden flex flex-col">
                    <CardHeader className="shrink-0">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 truncate">
                                <File className="h-5 w-5 shrink-0" />
                                <span className="truncate">{selectedFile || 'Datei auswählen'}</span>
                            </CardTitle>
                            {fileContent && (
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                                        {copied ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                        <RotateCcw className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-0">
                        {loadingFile ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                        ) : fileContent ? (
                            <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-all bg-muted/30 h-full overflow-auto">
                                {fileContent}
                            </pre>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                Klicken Sie auf eine Datei, um den Inhalt anzuzeigen
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Actions */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            Wählen Sie Dateien aus, um sie wiederherzustellen oder herunterzuladen.
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" disabled>
                                <Download className="mr-2 h-4 w-4" />
                                Herunterladen
                            </Button>
                            <Button disabled>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Wiederherstellen
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
