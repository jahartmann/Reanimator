import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings, RefreshCw } from "lucide-react";
import { revalidatePath } from 'next/cache';

async function handleRestart() {
    'use server';
    const { exec } = await import('child_process');
    exec('systemctl restart proxhost-backup');
    revalidatePath('/settings');
}

export default function SettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Einstellungen</h1>
                <p className="text-muted-foreground">System-Konfiguration</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Systemwartung
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                        <div>
                            <h4 className="font-medium">Anwendung neu starten</h4>
                            <p className="text-sm text-muted-foreground">
                                Startet den Server-Dienst neu
                            </p>
                        </div>
                        <form action={handleRestart}>
                            <Button variant="outline">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Neustarten
                            </Button>
                        </form>
                    </div>

                    <div className="p-4 rounded-lg border border-dashed text-sm text-muted-foreground">
                        <p><strong>Manuelles Update:</strong></p>
                        <code className="block mt-2 p-2 bg-muted rounded text-xs">
                            cd ~/Reanimator && git pull && npm install --include=dev && npm run build && sudo systemctl restart proxhost-backup
                        </code>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Info</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p><strong>Version:</strong> 1.0.0</p>
                    <p><strong>Datenbank:</strong> SQLite (data/proxhost.db)</p>
                    <p><strong>Backups:</strong> data/config-backups/</p>
                </CardContent>
            </Card>
        </div>
    );
}
