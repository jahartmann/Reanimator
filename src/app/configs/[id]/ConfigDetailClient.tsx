'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Copy, Check, Upload, Loader2, HardDrive, Info, BookOpen, Terminal, Network, ShieldCheck, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { FileBrowser } from "@/components/ui/FileBrowser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

interface ParsedSystemInfo {
    osRelease: Record<string, string>;
    hostname: string;
    network: string;
    disks: string;
    fstab: string;
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

    // New States for parsed info
    const [guideContent, setGuideContent] = useState<string | null>(null);
    const [systemInfoRaw, setSystemInfoRaw] = useState<string | null>(null);
    const [parsedSysInfo, setParsedSysInfo] = useState<ParsedSystemInfo | null>(null);

    // Tab default
    const [activeTab, setActiveTab] = useState('files');

    useEffect(() => {
        loadFiles();
    }, [backupId]);

    // Parse System Info when raw data is available
    useEffect(() => {
        if (systemInfoRaw) {
            parseSystemInfo(systemInfoRaw);
        }
    }, [systemInfoRaw]);

    function parseSystemInfo(raw: string) {
        try {
            // Split by separator defined in backup-logic.ts: echo "---";
            const parts = raw.split('---').map(s => s.trim());

            // Expected order:
            // 0: os-release
            // 1: hostname
            // 2: ip a
            // 3: lsblk
            // 4: fstab

            const osReleaseLines = parts[0]?.split('\n').filter(l => l.includes('=')) || [];
            const osRelease: Record<string, string> = {};
            osReleaseLines.forEach(line => {
                const [key, val] = line.split('=');
                if (key && val) osRelease[key] = val.replace(/"/g, '');
            });

            setParsedSysInfo({
                osRelease,
                hostname: parts[1] || 'Unbekannt',
                network: parts[2] || '',
                disks: parts[3] || '',
                fstab: parts[4] || ''
            });
        } catch (e) {
            console.error("Failed to parse system info", e);
        }
    }

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
            if (infoData.content) setSystemInfoRaw(infoData.content);
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
        <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
            <div className="flex items-center gap-4 shrink-0">
                <Link href="/configs">
                    <Button variant="ghost" size="icon" className="h-10 w-10">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">{serverName}</h1>
                        <Badge variant="outline" className="text-muted-foreground">
                            {formatBytes(totalSize)}
                        </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                        Backup vom {new Date(backupDate).toLocaleString('de-DE')}
                    </p>
                </div>
                {downloading && (
                    <div className="flex items-center gap-2 text-primary animate-pulse">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm font-medium">Download...</span>
                    </div>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="border-b shrink-0 bg-background/95 backdrop-blur z-10">
                    <TabsList className="w-full justify-start h-12 bg-transparent p-0">
                        <TabsTrigger
                            value="files"
                            className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 font-medium"
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Dateien ({files.length})
                        </TabsTrigger>
                        <TabsTrigger
                            value="guide"
                            className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 font-medium"
                        >
                            <BookOpen className="mr-2 h-4 w-4" />
                            Anleitung
                        </TabsTrigger>
                        <TabsTrigger
                            value="info"
                            className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 font-medium"
                        >
                            <Info className="mr-2 h-4 w-4" />
                            System-Info
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* FILES TAB */}
                <TabsContent value="files" className="flex-1 min-h-0 pt-4 data-[state=inactive]:hidden">
                    <div className="grid lg:grid-cols-3 gap-6 h-full">
                        {/* File Browser */}
                        <Card className="lg:col-span-1 h-full overflow-hidden flex flex-col border-muted/60 shadow-sm">
                            <CardContent className="flex-1 overflow-hidden p-0">
                                {loading ? (
                                    <div className="flex justify-center items-center h-full text-muted-foreground">
                                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                        Lade Datei-Liste...
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
                        <Card className="lg:col-span-2 h-full overflow-hidden flex flex-col border-muted/60 shadow-sm">
                            <CardHeader className="shrink-0 py-3 px-4 border-b bg-muted/30 flex flex-row items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <CardTitle className="text-sm font-mono truncate">
                                        {selectedFile || 'Keine Datei ausgewählt'}
                                    </CardTitle>
                                </div>
                                {selectedFile && (
                                    <div className="flex gap-2 ml-4">
                                        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8">
                                            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8"
                                            onClick={() => handleDownload([selectedFile])}
                                        >
                                            <Download className="h-4 w-4" />
                                        </Button>
                                        <Separator orientation="vertical" className="h-4 self-center" />
                                        <Button variant="outline" size="sm" className="h-8 shadow-none" onClick={handleRestore} disabled={restoring}>
                                            {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                            <span className="ml-2">Restore</span>
                                        </Button>
                                    </div>
                                )}
                            </CardHeader>
                            <CardContent className="flex-1 overflow-auto p-0 bg-[#1e1e1e]">
                                {loadingContent ? (
                                    <div className="flex justify-center items-center h-full text-muted-foreground/50">
                                        <Loader2 className="h-8 w-8 animate-spin" />
                                    </div>
                                ) : fileContent ? (
                                    <ScrollArea className="h-full">
                                        <pre className="p-4 text-xs text-zinc-300 mobile:text-[10px] whitespace-pre-wrap font-mono leading-relaxed">
                                            {fileContent}
                                        </pre>
                                    </ScrollArea>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                                        <div className="w-16 h-16 rounded-full bg-muted/10 flex items-center justify-center">
                                            <FileText className="h-8 w-8 opacity-20" />
                                        </div>
                                        <p>Wählen Sie eine Datei aus, um den Inhalt anzuzeigen</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* GUIDE TAB */}
                <TabsContent value="guide" className="flex-1 min-h-0 pt-4 data-[state=inactive]:hidden">
                    <Card className="h-full overflow-hidden border-muted/60 shadow-sm flex flex-col">
                        <CardHeader className="py-4 px-6 border-b bg-muted/10">
                            <CardTitle className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-green-500" />
                                Disaster Recovery Anleitung
                            </CardTitle>
                            <CardDescription>
                                Automatisch generierte Schritte zur Wiederherstellung dieses Servers
                            </CardDescription>
                        </CardHeader>
                        <ScrollArea className="flex-1">
                            <CardContent className="p-8 max-w-4xl mx-auto">
                                {guideContent ? (
                                    <article className="prose prose-sm dark:prose-invert max-w-none">
                                        <pre className="bg-muted/50 p-6 rounded-lg font-sans text-sm leading-relaxed whitespace-pre-wrap border shadow-sm">
                                            {guideContent}
                                        </pre>
                                    </article>
                                ) : (
                                    <div className="text-center py-20 text-muted-foreground">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 opacity-20" />
                                        <p>Lade Anleitung...</p>
                                    </div>
                                )}
                            </CardContent>
                        </ScrollArea>
                    </Card>
                </TabsContent>

                {/* SYSTEM INFO TAB */}
                <TabsContent value="info" className="flex-1 min-h-0 pt-4 data-[state=inactive]:hidden">
                    <div className="h-full overflow-hidden grid lg:grid-cols-2 gap-6">
                        {/* Left Column: OS & Network */}
                        <div className="space-y-6 overflow-y-auto pr-2">
                            <Card className="border-muted/60 shadow-sm overflow-hidden">
                                <CardHeader className="py-4 bg-muted/20 border-b">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <HardDrive className="h-4 w-4 text-blue-500" />
                                        OS & Host
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {parsedSysInfo ? (
                                        <div className="divide-y divide-border/50">
                                            <div className="p-4 grid grid-cols-3 gap-2 hover:bg-muted/5 transition-colors">
                                                <span className="text-sm font-medium text-muted-foreground">Hostname</span>
                                                <span className="col-span-2 text-sm font-mono bg-muted/30 px-2 py-0.5 rounded w-fit">{parsedSysInfo.hostname}</span>
                                            </div>
                                            <div className="p-4 grid grid-cols-3 gap-2 hover:bg-muted/5 transition-colors">
                                                <span className="text-sm font-medium text-muted-foreground">OS Name</span>
                                                <span className="col-span-2 text-sm">{parsedSysInfo.osRelease.PRETTY_NAME || parsedSysInfo.osRelease.NAME || 'N/A'}</span>
                                            </div>
                                            <div className="p-4 grid grid-cols-3 gap-2 hover:bg-muted/5 transition-colors">
                                                <span className="text-sm font-medium text-muted-foreground">Version</span>
                                                <span className="col-span-2 text-sm">{parsedSysInfo.osRelease.VERSION || 'N/A'}</span>
                                            </div>
                                            <div className="p-4 grid grid-cols-3 gap-2 hover:bg-muted/5 transition-colors">
                                                <span className="text-sm font-medium text-muted-foreground">ID</span>
                                                <span className="col-span-2 text-sm font-mono text-muted-foreground">{parsedSysInfo.osRelease.ID || 'N/A'}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="border-muted/60 shadow-sm overflow-hidden">
                                <CardHeader className="py-4 bg-muted/20 border-b">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Network className="h-4 w-4 text-purple-500" />
                                        Netzwerk-Konfiguration
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0 bg-[#1e1e1e]">
                                    {parsedSysInfo ? (
                                        <ScrollArea className="h-[300px]">
                                            <pre className="p-4 text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                                {parsedSysInfo.network}
                                            </pre>
                                        </ScrollArea>
                                    ) : (
                                        <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Right Column: Storage */}
                        <div className="space-y-6 overflow-y-auto pr-2">
                            <Card className="border-muted/60 shadow-sm overflow-hidden flex flex-col h-full">
                                <CardHeader className="py-4 bg-muted/20 border-b shrink-0">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <HardDrive className="h-4 w-4 text-emerald-500" />
                                        Disks & Filesystem
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 flex-1 bg-[#1e1e1e]">
                                    {parsedSysInfo ? (
                                        <div className="space-y-6">
                                            <div>
                                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Block Devices (lsblk)</h4>
                                                <pre className="text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/50 p-3 rounded border border-zinc-800">
                                                    {parsedSysInfo.disks}
                                                </pre>
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">File System Table (fstab)</h4>
                                                <pre className="text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/50 p-3 rounded border border-zinc-800">
                                                    {parsedSysInfo.fstab}
                                                </pre>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex justify-center items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
