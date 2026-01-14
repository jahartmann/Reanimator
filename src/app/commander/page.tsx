import db from '@/lib/db';
import { CommanderInterface } from '@/components/commander/CommanderInterface';
import { Terminal } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CommanderPage() {
    const servers = db.prepare('SELECT id, name, type FROM servers WHERE type = ?').all('pve') as any[];
    const vms = db.prepare('SELECT id, vmid, name, server_id, tags FROM vms').all() as any[];

    // Map server name to VM for convenience
    const vmsWithServer = vms.map(vm => {
        const s = servers.find((srv: any) => srv.id === vm.server_id);
        return { ...vm, serverName: s ? s.name : 'Unknown' };
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <Terminal className="h-6 w-6 text-green-500" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Bulk Commander</h1>
                    <p className="text-muted-foreground">
                        Führen Sie Befehle auf mehreren Servern oder VMs gleichzeitig aus.
                    </p>
                </div>
            </div>

            <CommanderInterface servers={servers} vms={vmsWithServer} />
        </div>
    );
}
