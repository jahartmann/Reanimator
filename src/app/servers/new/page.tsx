import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import { addServer } from '@/app/actions';

export default function NewServerPage() {
    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/servers">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Server hinzufügen</h1>
                    <p className="text-muted-foreground">Proxmox VE oder PBS verbinden</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Server-Konfiguration</CardTitle>
                    <CardDescription>Geben Sie die Verbindungsdaten ein.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={addServer} className="space-y-4">
                        <div className="grid gap-2">
                            <label htmlFor="name" className="text-sm font-medium">Name</label>
                            <Input id="name" name="name" placeholder="Mein PVE Server" required />
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="type" className="text-sm font-medium">Typ</label>
                            <select
                                id="type"
                                name="type"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                required
                            >
                                <option value="pve">Proxmox VE</option>
                                <option value="pbs">Proxmox Backup Server</option>
                            </select>
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="url" className="text-sm font-medium">URL</label>
                            <Input id="url" name="url" placeholder="https://192.168.1.100:8006" required />
                        </div>

                        <div className="grid gap-2">
                            <label htmlFor="token" className="text-sm font-medium">API Token</label>
                            <Input id="token" name="token" placeholder="user@pam!tokenid=secret" required />
                            <p className="text-xs text-muted-foreground">
                                Format: user@realm!tokenname=token-secret
                            </p>
                        </div>

                        <hr className="my-4" />

                        <div className="space-y-4">
                            <h4 className="font-medium">SSH für Config-Backups</h4>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <label htmlFor="ssh_host" className="text-sm font-medium">SSH Host</label>
                                    <Input id="ssh_host" name="ssh_host" placeholder="Leer = aus URL" />
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="ssh_port" className="text-sm font-medium">SSH Port</label>
                                    <Input id="ssh_port" name="ssh_port" type="number" defaultValue="22" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <label htmlFor="ssh_user" className="text-sm font-medium">SSH Benutzer</label>
                                    <Input id="ssh_user" name="ssh_user" defaultValue="root" />
                                </div>
                                <div className="grid gap-2">
                                    <label htmlFor="ssh_password" className="text-sm font-medium">SSH Passwort</label>
                                    <Input id="ssh_password" name="ssh_password" type="password" />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <Link href="/servers">
                                <Button type="button" variant="ghost">Abbrechen</Button>
                            </Link>
                            <Button type="submit">
                                <Save className="mr-2 h-4 w-4" />
                                Speichern
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
