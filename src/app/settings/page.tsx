'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { systemRestart, systemUpdate } from '@/app/actions/management';
import { Power, RefreshCcw, Save, Globe, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';

export default function SettingsPage() {
    const { t, language, setLanguage } = useTranslation();
    const [loading, setLoading] = useState<'restart' | 'update' | null>(null);
    const [msg, setMsg] = useState<{ success: boolean, text: string } | null>(null);

    async function handleRestart() {
        if (!confirm(language === 'de' ? 'Möchten Sie den Dienst wirklich neu starten?' : 'Are you sure you want to restart the service?')) return;
        setLoading('restart');
        setMsg(null);
        const res = await systemRestart();
        setMsg({ success: res.success, text: res.message });
        setLoading(null);
    }

    async function handleUpdate() {
        if (!confirm(language === 'de' ? 'Möchten Sie wirklich die neuesten Änderungen abrufen und aktualisieren? Der Dienst wird neu gestartet.' : 'Are you sure you want to pull the latest changes and update? This will restart the service.')) return;
        setLoading('update');
        setMsg(null);
        const res = await systemUpdate();
        setMsg({ success: res.success, text: res.message });
        setLoading(null);
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                    {t('settings.title')}
                </h2>
                <p className="text-muted-foreground mt-1">
                    {language === 'de' ? 'Globale Anwendungseinstellungen konfigurieren.' : 'Configure global application preferences.'}
                </p>
            </div>

            {msg && (
                <div className={`p-4 rounded-lg border flex items-start gap-3 ${msg.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                    {msg.success ? <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" /> : <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />}
                    <pre className="text-sm whitespace-pre-wrap font-mono">{msg.text}</pre>
                </div>
            )}

            {/* Language Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        {t('settings.language')}
                    </CardTitle>
                    <CardDescription>
                        {t('settings.selectLanguage')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <Button
                            variant={language === 'de' ? 'default' : 'outline'}
                            onClick={() => setLanguage('de')}
                            className="flex items-center gap-2"
                        >
                            🇩🇪 {t('settings.german')}
                        </Button>
                        <Button
                            variant={language === 'en' ? 'default' : 'outline'}
                            onClick={() => setLanguage('en')}
                            className="flex items-center gap-2"
                        >
                            🇬🇧 {t('settings.english')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* System Maintenance */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('settings.maintenance')}</CardTitle>
                    <CardDescription>
                        {language === 'de' ? 'Anwendungsdienst und Updates verwalten.' : 'Manage the application service and updates.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" onClick={handleRestart} disabled={loading !== null}>
                            {loading === 'restart' ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Power className="mr-2 h-4 w-4" />
                            )}
                            {loading === 'restart' ? t('settings.restarting') : t('settings.restart')}
                        </Button>
                        <Button variant="secondary" onClick={handleUpdate} disabled={loading !== null}>
                            {loading === 'update' ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCcw className="mr-2 h-4 w-4" />
                            )}
                            {loading === 'update' ? t('settings.updating') : t('settings.update')}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {language === 'de' ? 'Aktueller Modus:' : 'Current Mode:'}{' '}
                        <span className="font-mono text-indigo-400">{process.env.NODE_ENV || 'development'}</span>
                    </p>
                </CardContent>
            </Card>

            {/* General Defaults */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('settings.general')}</CardTitle>
                    <CardDescription>
                        {language === 'de' ? 'Systemweite Konfigurationen.' : 'System wide configurations.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">
                            {language === 'de' ? 'Anwendungsname' : 'Application Name'}
                        </label>
                        <Input defaultValue="ProxHost Backup Manager" />
                    </div>
                    <Button disabled>
                        <Save className="mr-2 h-4 w-4" />
                        {t('common.save')}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
