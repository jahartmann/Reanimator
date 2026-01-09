import Link from 'next/link';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Folder, File } from "lucide-react";
import { getBackupFiles, readBackupFile } from '@/app/actions/configBackup';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface ConfigBackup {
    id: number;
    server_id: number;
    backup_path: string;
    backup_date: string;
    file_count: number;
    total_size: number;
}

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

export default async function ConfigDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ file?: string }>;
}) {
    const { id } = await params;
    const { file: selectedFile } = await searchParams;
    const backupId = parseInt(id);

    const backup = db.prepare('SELECT * FROM config_backups WHERE id = ?').get(backupId) as ConfigBackup | undefined;

    if (!backup) {
        return (
            <div className="text-center py-20">
                <h1 className="text-2xl font-bold">Backup nicht gefunden</h1>
                <Link href="/configs">
                    <Button className="mt-4">Zurück</Button>
                </Link>
            </div>
        );
    }

    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(backup.server_id) as any;
    const files = await getBackupFiles(backupId);

    // Read selected file content
    let fileContent: string | null = null;
    if (selectedFile) {
        fileContent = await readBackupFile(backupId, selectedFile);
    }

    // Group files by top-level directory
    const groupedFiles: Record<string, FileEntry[]> = {};
    for (const file of files) {
        const parts = file.path.split('/');
        const topDir = parts[0] || 'root';
        if (!groupedFiles[topDir]) {
            groupedFiles[topDir] = [];
        }
        groupedFiles[topDir].push(file);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/configs">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Backup Details</h1>
                    <p className="text-muted-foreground">
                        {server?.name} · {new Date(backup.backup_date).toLocaleString('de-DE')}
                    </p>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* File List */}
                <Card className="lg:col-span-1 h-[600px] overflow-hidden flex flex-col">
                    <CardHeader className="shrink-0">
                        <CardTitle className="text-sm">
                            {files.length} Dateien · {formatBytes(backup.total_size)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-2">
                        <div className="space-y-1 font-mono text-sm">
                            {Object.entries(groupedFiles).map(([dir, dirFiles]) => (
                                <div key={dir}>
                                    <div className="flex items-center gap-2 p-2 font-semibold text-amber-500">
                                        <Folder className="h-4 w-4" />
                                        {dir}
                                    </div>
                                    {dirFiles.slice(0, 20).map((file) => (
                                        <Link
                                            key={file.path}
                                            href={`/configs/${backupId}?file=${encodeURIComponent(file.path)}`}
                                            className={`flex items-center gap-2 p-2 pl-6 rounded hover:bg-muted/50 ${selectedFile === file.path ? 'bg-muted' : ''
                                                }`}
                                        >
                                            <File className="h-3 w-3 text-muted-foreground" />
                                            <span className="truncate flex-1">{file.path.split('/').pop()}</span>
                                            <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                                        </Link>
                                    ))}
                                    {dirFiles.length > 20 && (
                                        <p className="pl-6 text-xs text-muted-foreground">
                                            +{dirFiles.length - 20} weitere Dateien
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* File Content */}
                <Card className="lg:col-span-2 h-[600px] overflow-hidden flex flex-col">
                    <CardHeader className="shrink-0 bg-muted/30">
                        <CardTitle className="text-sm font-mono">
                            {selectedFile || 'Datei auswählen'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-0 bg-zinc-900">
                        {fileContent ? (
                            <pre className="p-4 text-xs text-zinc-300 whitespace-pre-wrap font-mono">
                                {fileContent}
                            </pre>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                Wählen Sie eine Datei aus der Liste
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
