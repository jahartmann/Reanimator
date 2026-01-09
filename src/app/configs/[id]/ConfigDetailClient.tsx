'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Copy, Check, Upload, Loader2, HardDrive, Info, BookOpen } from "lucide-react";
import { FileBrowser } from "@/components/ui/FileBrowser";

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

export default function ConfigDetailClient({
    backupId,
    serverName,
    backupDate,
    totalSize
}: {
    backupId: number;
    serverName: string;
    backupDate: string;
    totalSize: number;
}) {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [loadingContent, setLoadingContent] = useState(false);
    const [copied, setCopied] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [activeTab, setActiveTab] = useState<'files' | 'guide' | 'info'>('files');
    const [guideContent, setGuideContent] = useState<string | null>(null);
    const [systemInfo, setSystemInfo] = useState<string | null>(null);

    useEffect(() => {
        loadFiles();
    }, [backupId]);

    async function loadFiles() {
        setLoading(true);
        try {
            const res = await fetch(`/api/config-backups/${backupId}`);
            const data = await res.json();
            setFiles(data);

            // Load guide and system info
            const guideRes = await fetch(`/api/config-backups/${backupId}?file=WIEDERHERSTELLUNG.md`);
            const guideData = await guideRes.json();
            if (guideData.content) setGuideContent(guideData.content);

            const infoRes = await fetch(`/api/config-backups/${backupId}?file=SYSTEM_INFO.txt`);
            const infoData = await infoRes.json();
            if (infoData.content) setSystemInfo(infoData.content);
        } catch (err) {
            console.error('Failed to load files:', err);
        }
        setLoading(false);
    }

    async function handleSelectFile(path: string) {
        setSelectedFile(path);
        setLoadingContent(true);
        try {
            const res = await fetch(`/api/config-backups/${backupId}?file=${encodeURIComponent(path)}`);
            const data = await res.json();
            setFileContent(data.content || 'Fehler beim Laden');
        } catch {
            setFileContent('Fehler beim Laden');
        }
        setLoadingContent(false);
    }

    async function handleDownload(paths: string[]) {
        if (paths.length === 0) return;

        setDownloading(true);
        try {
            const res = await fetch(`/api/config-backups/${backupId}/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: paths })
            });

            if (!res.ok) throw new Error('Download failed');

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = paths.length === 1 ? paths[0].split('/').pop() || 'file' : `backup-${backupId}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            alert('Download fehlgeschlagen');
        }
        setDownloading(false);
    }

    async function handleRestore() {
        if (!selectedFile || !confirm(`Datei "${selectedFile}" auf dem Server wiederherstellen?`)) return;

        setRestoring(true);
        try {
            const res = await fetch(`/api/config-backups/${backupId}/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: selectedFile })
            });
            const result = await res.json();
            alert(result.message);
        } catch {
            alert('Restore fehlgeschlagen');
        }
        setRestoring(false);
    }

    function handleCopy() {
        if (fileContent) {
            navigator.clipboard.writeText(fileContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/configs">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">Backup Details</h1>
                    <p className="text-muted-foreground">
                        {serverName} · {new Date(backupDate).toLocaleString('de-DE')} · {formatBytes(totalSize)}
                    </p>
                </div>
                {downloading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-border pb-2">
                <Button
                    variant={activeTab === 'files' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('files')}
                >
                    <Download className="mr-2 h-4 w-4" />
                    Dateien ({files.length})
                </Button>
                <Button
                    variant={activeTab === 'guide' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('guide')}
                >
                    <BookOpen className="mr-2 h-4 w-4" />
                    Anleitung
                </Button>
                <Button
                    variant={activeTab === 'info' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('info')}
                >
                    <Info className="mr-2 h-4 w-4" />
                    System-Info
                </Button>
            </div>

            {activeTab === 'files' && (
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* File Browser */}
                    <Card className="lg:col-span-1 h-[650px] overflow-hidden flex flex-col">
                        <CardContent className="flex-1 overflow-hidden p-0">
                            {loading ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                </div>
                            ) : (
                                <FileBrowser
                                    files={files}
                                    selectedFile={selectedFile}
                                    onSelectFile={handleSelectFile}
                                    onDownload={handleDownload}
                                />
                            )}
                        </CardContent>
                    </Card>

                    {/* File Viewer */}
                    <Card className="lg:col-span-2 h-[650px] overflow-hidden flex flex-col">
                        <CardHeader className="shrink-0 py-3 px-4 border-b bg-muted/30 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-mono truncate flex-1">
                                {selectedFile || 'Datei zum Anzeigen auswählen'}
                            </CardTitle>
                            {selectedFile && (
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={handleCopy}>
                                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDownload([selectedFile])}
                                    >
                                        <Download className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={handleRestore} disabled={restoring}>
                                        {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                        <span className="ml-2">Restore</span>
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto p-0 bg-zinc-900">
                            {loadingContent ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : fileContent ? (
                                <pre className="p-4 text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                                    {fileContent}
                                </pre>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                                    <Download className="h-8 w-8 opacity-30" />
                                    <p>Klicken Sie auf eine Datei zum Anzeigen</p>
                                    <p className="text-xs">oder wählen Sie mehrere aus und laden Sie sie herunter</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {activeTab === 'guide' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-blue-500" />
                            Wiederherstellungs-Anleitung
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {guideContent ? (
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                                {guideContent}
                            </pre>
                        ) : (
                            <p className="text-muted-foreground">
                                Keine Anleitung verfügbar. Erstellen Sie ein neues Backup.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'info' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <HardDrive className="h-5 w-5 text-green-500" />
                            System-Informationen
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {systemInfo ? (
                            <pre className="bg-muted p-4 rounded-lg text-sm font-mono whitespace-pre-wrap">
                                {systemInfo}
                            </pre>
                        ) : (
                            <p className="text-muted-foreground">
                                Keine System-Info verfügbar. Erstellen Sie ein neues Backup.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
