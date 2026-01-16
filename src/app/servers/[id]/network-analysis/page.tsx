'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { runNetworkAnalysis, getLatestNetworkAnalysis } from '@/app/actions/network_analysis';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, ArrowLeft, Network, Clock, Bot } from "lucide-react";
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function NetworkAnalysisPage() {
    const params = useParams();
    const serverId = Number(params.id);

    const [analysis, setAnalysis] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadAnalysis = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getLatestNetworkAnalysis(serverId);
            if (result) {
                setAnalysis(result.content);
                setLastUpdate(result.created_at);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [serverId]);

    useEffect(() => {
        loadAnalysis();
    }, [loadAnalysis]);

    async function handleRefresh() {
        setRefreshing(true);
        try {
            const text = await runNetworkAnalysis(serverId);
            setAnalysis(text);
            setLastUpdate(new Date().toISOString());
            toast.success("Analyse abgeschlossen");
        } catch (e: any) {
            toast.error("Analyse fehlgeschlagen: " + e.message);
        } finally {
            setRefreshing(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href={`/servers/${serverId}`}>
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Network className="h-8 w-8" />
                            Netzwerk Integritäts-Analyse
                        </h1>
                        <p className="text-muted-foreground mt-1 flex items-center gap-2">
                            <Bot className="h-4 w-4" />
                            KI-gestützte Analyse der Netzwerkkonfiguration
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {lastUpdate && (
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Letztes Update: {new Date(lastUpdate).toLocaleString('de-DE')}
                        </div>
                    )}
                    <Button onClick={handleRefresh} disabled={refreshing}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'Analysiere...' : 'Jetzt Aktualisieren'}
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <Card className="min-h-[calc(100vh-12rem)]">
                <CardHeader className="border-b">
                    <CardTitle className="text-lg">Analyse-Ergebnis</CardTitle>
                    <CardDescription>
                        Detaillierte Analyse der Netzwerkschnittstellen, Bridges, Bonds und VLANs
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : analysis ? (
                        <ScrollArea className="h-[calc(100vh-18rem)]">
                            <div className="p-6 prose dark:prose-invert prose-sm max-w-none 
                                prose-headings:border-b prose-headings:pb-2 prose-headings:mb-4
                                prose-table:border prose-table:border-border
                                prose-th:bg-muted/50 prose-th:p-2 prose-th:text-left prose-th:border prose-th:border-border
                                prose-td:p-2 prose-td:border prose-td:border-border
                                prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                                prose-pre:bg-black/90 prose-pre:border prose-pre:border-border">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {analysis}
                                </ReactMarkdown>
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                            <Network className="h-12 w-12 mb-4 opacity-50" />
                            <p className="text-lg font-medium">Keine Analyse vorhanden</p>
                            <p className="text-sm">Klicken Sie auf "Jetzt Aktualisieren" um eine Analyse zu starten.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
