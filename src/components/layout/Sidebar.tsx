"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Server, FolderCog, Clock, Settings, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

export function Sidebar() {
    const pathname = usePathname();
    const { t } = useTranslation();

    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Server', href: '/servers', icon: Server },
        { name: 'Konfigurationen', href: '/configs', icon: FolderCog },
        { name: 'Automatisierung', href: '/jobs', icon: Clock },
        { name: 'Einstellungen', href: '/settings', icon: Settings },
    ];

    return (
        <div className="flex flex-col w-64 border-r border-border bg-card h-screen fixed left-0 top-0 z-30">
            <div className="p-6">
                <div className="flex items-center gap-2 mb-1">
                    <div className="bg-indigo-500 p-1.5 rounded-lg">
                        <Activity className="h-4 w-4 text-white fill-current" />
                    </div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        Reanimator
                    </h1>
                </div>
                <p className="text-xs text-muted-foreground pl-9">Backup & Recovery</p>
            </div>
            <nav className="flex-1 px-4 space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
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
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                        <span className="text-xs font-bold text-white">A</span>
                    </div>
                    <div>
                        <p className="text-sm font-medium">Admin</p>
                        <p className="text-xs text-muted-foreground">Online</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
