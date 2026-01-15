'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Activity, Loader2 } from "lucide-react";
import { scanEntireInfrastructure } from '@/app/actions/scan';
import { toast } from 'sonner';

export function GlobalScanButton() {
    const [scanning, setScanning] = useState(false);

    async function handleScan() {
        if (!confirm('Gesamte Infrastruktur scannen? Dies kann einige Zeit dauern.')) return;

        setScanning(true);
        const toastId = toast.loading('Starte globalen Scan...');

        try {
            const res = await scanEntireInfrastructure();
            if (res.success && res.results) {
                toast.success(`Scan Abgeschlossen!`, {
                    id: toastId,
                    description: `${res.results.servers} Server und ${res.results.vms} VMs gescannt.`
                });

                if (res.results.errors.length > 0) {
                    toast.warning('Einige Fehler aufgetreten', {
                        description: res.results.errors.join('\n')
                    });
                }
            } else {
                toast.error('Scan fehlgeschlagen: ' + res.error, { id: toastId });
            }
        } catch (e: any) {
            toast.error('Fehler: ' + e.message, { id: toastId });
        } finally {
            setScanning(false);
        }
    }

    return (
        <Button onClick={handleScan} disabled={scanning} variant="default" className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
            Global Scan
        </Button>
    );
}
