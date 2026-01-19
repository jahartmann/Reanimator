'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { runNetworkAnalysis, getLatestNetworkAnalysis } from '@/app/actions/network_analysis';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, ArrowLeft, Network, Clock, Bot, Shield, Zap, Lightbulb, Map } from "lucide-react";
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Parse AI markdown into sections
function parseAnalysisSections(markdown: string) {
    const sections: { icon: string; title: string; content: string }[] = [];

    // Split by ## headers
    const parts = markdown.split(/^##\s+/gm);

    for (const part of parts) {
        if (!part.trim()) continue;

        const lines = part.split('\n');
        const titleLine = lines[0].trim();
        const content = lines.slice(1).join('\n').trim();

        if (!titleLine) continue;

        // Determine icon based on title keywords
        let icon = 'info';
        const lowerTitle = titleLine.toLowerCase();
        if (lowerTitle.includes('topologie') || lowerTitle.includes('überblick') || lowerTitle.includes('🗺')) {
            icon = 'map';
        } else if (lowerTitle.includes('sicherheit') || lowerTitle.includes('security') || lowerTitle.includes('🛡')) {
            icon = 'shield';
        } else if (lowerTitle.includes('performance') || lowerTitle.includes('redundanz') || lowerTitle.includes('🚀')) {
            icon = 'zap';
        } else if (lowerTitle.includes('empfehlung') || lowerTitle.includes('💡')) {
            icon = 'lightbulb';
        }

        // Clean emoji from title
        const cleanTitle = titleLine.replace(/[🗺️🛡️🚀💡]/g, '').trim();

        sections.push({
            icon,
            title: cleanTitle,
            content
        });
    }

    return sections;
}

function SectionIcon({ type }: { type: string }) {
    switch (type) {
        case 'map': return <Map className="h-5 w-5 text-blue-500" />;
        case 'shield': return <Shield className="h-5 w-5 text-green-500" />;
        case 'zap': return <Zap className="h-5 w-5 text-yellow-500" />;
        case 'lightbulb': return <Lightbulb className="h-5 w-5 text-purple-500" />;
        default: return <Network className="h-5 w-5 text-muted-foreground" />;
    }
}

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

    const sections = analysis ? parseAnalysisSections(analysis) : [];

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header - Compact */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href={`/servers/${serverId}`}>
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Network className="h-6 w-6" />
                            Netzwerk-Analyse
                        </h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            KI-gestützt
                            {lastUpdate && (
                                <span className="ml-2 flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {new Date(lastUpdate).toLocaleString('de-DE')}
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <Button onClick={handleRefresh} disabled={refreshing} size="sm">
                    <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Analysiere...' : 'Aktualisieren'}
                </Button>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : sections.length > 0 ? (
                <div className="grid gap-4">
                    {sections.map((section, idx) => (
                        <Card key={idx} className="overflow-hidden">
                            <CardHeader className="py-3 px-4 bg-muted/30 border-b">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <SectionIcon type={section.icon} />
                                    {section.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="prose dark:prose-invert prose-sm max-w-none
                                    prose-p:text-base prose-p:leading-relaxed prose-p:my-2
                                    prose-li:text-base prose-li:my-1
                                    prose-table:text-sm prose-table:border prose-table:border-border
                                    prose-th:bg-muted/50 prose-th:p-2 prose-th:text-left prose-th:border prose-th:border-border prose-th:font-medium
                                    prose-td:p-2 prose-td:border prose-td:border-border
                                    prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                                    prose-pre:bg-black/90 prose-pre:border prose-pre:border-border prose-pre:text-xs">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {section.content}
                                    </ReactMarkdown>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : analysis ? (
                // Fallback: Show raw markdown if parsing fails
                <Card>
                    <CardContent className="p-6">
                        <div className="prose dark:prose-invert max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {analysis}
                            </ReactMarkdown>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <Network className="h-12 w-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium">Keine Analyse vorhanden</p>
                        <p className="text-sm">Klicken Sie auf "Aktualisieren" um eine Analyse zu starten.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
