'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Network, Wifi, WifiOff, Settings } from "lucide-react";
import Link from 'next/link';

interface ServerNetworkProps {
    info: any;
    serverId: number;
}

export function ServerNetwork({ info, serverId }: ServerNetworkProps) {
    if (!info) return null;

    return (
        <Card className="overflow-hidden border-muted/60">
            <CardHeader className="bg-gradient-to-r from-purple-500/5 to-transparent flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-purple-500" />
                    Network Interfaces ({info.networks.length})
                </CardTitle>
                <Link href={`/servers/${serverId}/network`}>
                    <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Config
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                    {info.networks.map((net: any) => (
                        <div key={net.name} className="p-4 flex items-start gap-4 hover:bg-muted/5 transition-colors">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${net.state === 'UP' ? 'bg-green-500/10' : 'bg-muted'}`}>
                                {net.state === 'UP' ? (
                                    <Wifi className="h-5 w-5 text-green-500" />
                                ) : (
                                    <WifiOff className="h-5 w-5 text-muted-foreground" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-medium">{net.name}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${net.state === 'UP' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                                        {net.state}
                                    </span>
                                    {net.type === 'bridge' && <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-500">Bridge</span>}
                                    {net.type === 'bond' && <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500">Bond</span>}
                                    {net.speed && <span className="text-xs text-muted-foreground">{net.speed}</span>}
                                </div>
                                <p className="text-sm text-muted-foreground font-mono">
                                    {net.ip} <span className="text-muted-foreground/50">·</span> {net.mac}
                                </p>
                                {net.bridge && <p className="text-xs text-muted-foreground mt-1">Bridge: {net.bridge}</p>}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
