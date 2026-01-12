'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { HardDrive, Loader2, Database, AlertCircle } from "lucide-react";
import db from '@/lib/db'; // Wait, this is client component? No, I need server action or use 'use client' + fetch
// Checking how other pages do it. ServersPage uses client component wrapper or direct db in server component.
// Let's make this a Server Component if possible, or Client with fetch.
// Given strict directory structure, let's look at `src/app/actions/storage.ts` if it exists.

import { getStorageStatus } from '@/app/actions/storage'; // Need to create this if missing

export default function StoragePage() {
    const [storages, setStorages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStorage();
    }, []);

    async function fetchStorage() {
        try {
            // We need an action to fetch storage from ALL servers? 
            // Or just list configured servers and their storage?
            // Let's assume we want a summary of all storages across all servers.
            const res = await fetch('/api/storage'); // Using API route
            if (res.ok) {
                const data = await res.json();
                setStorages(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Speicher Übersicht</h1>
                <p className="text-muted-foreground">Status aller Storage-Pools im Cluster</p>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : storages.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <HardDrive className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">Keine Speicher gefunden</h3>
                        <p className="text-muted-foreground text-center">
                            Fügen Sie Server hinzu, um deren Speicher hier zu sehen.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {storages.map((storage, i) => (
                        <Card key={i}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center justify-between">
                                    <span className="flex items-center gap-2">
                                        <Database className="h-4 w-4 text-blue-500" />
                                        {storage.name}
                                    </span>
                                    <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded">
                                        {storage.server}
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Typ:</span>
                                        <span className="font-medium">{storage.type}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span>Belegt</span>
                                            <span className="text-muted-foreground">
                                                {storage.used} / {storage.total}
                                            </span>
                                        </div>
                                        <Progress value={storage.percent} className={
                                            storage.percent > 90 ? "bg-red-100 [&>div]:bg-red-500" :
                                                storage.percent > 75 ? "bg-amber-100 [&>div]:bg-amber-500" : ""
                                        } />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-2 border-t">
                                        <div>
                                            <span className="block font-medium text-foreground">{storage.content}</span>
                                            Content
                                        </div>
                                        <div className="text-right">
                                            <span className={`block font-medium ${storage.active ? 'text-green-500' : 'text-red-500'}`}>
                                                {storage.active ? 'Aktiv' : 'Inaktiv'}
                                            </span>
                                            Status
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
