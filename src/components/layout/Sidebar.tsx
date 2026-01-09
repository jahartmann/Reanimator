"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Server, RefreshCw, History, Settings, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

export function Sidebar() {
    const pathname = usePathname();
    const { t } = useTranslation();

    const navItems = [
        { name: t('nav.dashboard'), href: '/', icon: LayoutDashboard },
        { name: t('nav.servers'), href: '/servers', icon: Server },
        { name: 'Backups', href: '/backups', icon: Archive },
        { name: t('nav.jobs'), href: '/jobs', icon: RefreshCw },
        { name: t('nav.history'), href: '/history', icon: History },
        { name: t('nav.settings'), href: '/settings', icon: Settings },
    ];

    return (
        <div className="flex flex-col w-64 border-r border-border bg-card h-screen fixed left-0 top-0 z-30">
            <div className="p-6">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                    ProxHost
                </h1>
                <p className="text-xs text-muted-foreground mt-1">Backup Manager</p>
            </div>
            <nav className="flex-1 px-4 space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all duration-200",
                                isActive
                                    ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>
            <div className="p-4 border-t border-border">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-indigo-500">A</span>
                    </div>
                    <div>
                        <p className="text-sm font-medium">Admin User</p>
                        <p className="text-xs text-muted-foreground">{t('servers.online')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
