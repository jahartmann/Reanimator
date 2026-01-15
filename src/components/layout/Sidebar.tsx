'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Server, FolderCog, Settings, ArrowRightLeft, Tag as TagIcon, HardDrive, ShieldCheck, Disc, Users, LogOut, User, Activity } from 'lucide-react';
import TaskManager from '../TaskManager';
import { getCurrentUser, logout, User as UserType } from '@/app/actions/userAuth';
import { Button } from '@/components/ui/button';

const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Server', href: '/servers', icon: Server },
    { name: 'Migrationen', href: '/migrations', icon: ArrowRightLeft },
    { name: 'Bibliothek', href: '/library', icon: Disc },
    { name: 'Tags', href: '/tags', icon: TagIcon },
    { name: 'Speicher', href: '/storage', icon: HardDrive },
    { name: 'Konfigurationen', href: '/configs', icon: FolderCog },
    { name: 'Cluster Trust', href: '/settings/trust', icon: ShieldCheck },
    { name: 'Einstellungen', href: '/settings', icon: Settings },
];

const adminNavItems = [
    { name: 'Benutzer', href: '/users', icon: Users },
];

export function Sidebar() {
    const pathname = usePathname();
    const [user, setUser] = useState<UserType | null>(null);

    useEffect(() => {
        getCurrentUser().then(setUser);
    }, []);

    const handleLogout = async () => {
        await logout();
    };

    // Don't show sidebar on login page
    if (pathname === '/login') {
        return null;
    }

    return (
        <div className="flex flex-col w-64 border-r border-border bg-card h-screen fixed left-0 top-0 z-30">
            <div className="p-6 pb-2">
                <div className="flex items-center gap-2 mb-1">
                    <div className="bg-primary/10 p-2 rounded-lg">
                        <Activity className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-white uppercase">Reanimator</h1>
                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium ml-[-2px]">PRO</span>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground ml-1">Backup & Recovery System</p>
            </div>
            <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${pathname === item.href
                            ? 'text-foreground bg-white/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                            }`}
                    >
                        <item.icon className="h-4 w-4" />
                        {item.name}
                    </Link>
                ))}

                {/* Admin-only items */}
                {user?.is_admin && (
                    <div className="pt-2 mt-2 border-t border-border/50">
                        <p className="px-4 py-2 text-xs text-muted-foreground font-medium">Admin</p>
                        {adminNavItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${pathname === item.href
                                    ? 'text-foreground bg-white/10'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.name}
                            </Link>
                        ))}
                    </div>
                )}

                <div className="pt-2 mt-2 border-t border-border/50">
                    <TaskManager />
                </div>
            </nav>

            {/* User info and logout */}
            <div className="p-4 border-t border-border">
                {user && (
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{user.username}</p>
                                <p className="text-[10px] text-muted-foreground">
                                    {user.is_admin ? 'Administrator' : 'Benutzer'}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleLogout}
                            title="Abmelden"
                            className="shrink-0"
                        >
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">v1.0.0</p>
            </div>
        </div>
    );
}
