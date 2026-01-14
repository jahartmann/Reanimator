import { getLibraryContent } from '@/app/actions/library';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Disc, FileCode, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";
import Link from 'next/link';
import db from '@/lib/db';
import { SyncDialog } from '@/components/library/SyncDialog';

export const dynamic = 'force-dynamic';

function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default async function LibraryPage() {
    const items = await getLibraryContent();
    const servers = db.prepare('SELECT id, name FROM servers').all() as { id: number, name: string }[];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">ISO & Template Library</h1>
                    <p className="text-muted-foreground">
                        Globaler Katalog aller ISO-Images und Container-Templates im Cluster.
                    </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                    <Link href="/library">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Aktualisieren
                    </Link>
                </Button>
            </div>

            <Card className="border-muted/60">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Disc className="h-5 w-5 text-primary" />
                        Verfügbare Images ({items.length})
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead>Dateiname</TableHead>
                                <TableHead className="w-[120px] text-right">Größe</TableHead>
                                <TableHead>Verfügbarkeit</TableHead>
                                <TableHead className="w-[100px] text-right">Aktionen</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                                        Keine Images gefunden. Prüfen Sie die Storage-Verbindungen.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                items.map((item) => (
                                    <TableRow key={item.name} className="hover:bg-muted/5">
                                        <TableCell>
                                            {item.type === 'iso' ? (
                                                <Disc className="h-8 w-8 text-purple-500/50" />
                                            ) : (
                                                <FileCode className="h-8 w-8 text-blue-500/50" />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{item.name}</div>
                                            <div className="text-xs text-muted-foreground uppercase">{item.format}</div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs">
                                            {formatBytes(item.size)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
                                                {item.locations.map((loc, i) => (
                                                    <Badge key={i} variant="secondary" className="font-normal bg-muted/50 hover:bg-muted">
                                                        <span className="font-semibold mr-1">{loc.serverName}</span>
                                                        <span className="text-muted-foreground/50">({loc.storage})</span>
                                                    </Badge>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <SyncDialog item={item} servers={servers} />
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
