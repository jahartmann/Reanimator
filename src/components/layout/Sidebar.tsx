import Link from 'next/link';
import { LayoutDashboard, Server, FolderCog, Settings, ArrowRightLeft, Tag as TagIcon, HardDrive, ShieldCheck, Disc, Terminal } from 'lucide-react';
import TaskManager from '../TaskManager';

const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Server', href: '/servers', icon: Server },
    { name: 'Migrationen', href: '/migrations', icon: ArrowRightLeft },
    { name: 'Bibliothek', href: '/library', icon: Disc },
    // { name: 'Commander', href: '/commander', icon: Terminal },
    { name: 'Tags', href: '/tags', icon: TagIcon },
    { name: 'Speicher', href: '/storage', icon: HardDrive },
    { name: 'Konfigurationen', href: '/configs', icon: FolderCog },
    { name: 'Cluster Trust', href: '/settings/trust', icon: ShieldCheck },
    { name: 'Einstellungen', href: '/settings', icon: Settings },
];

export function Sidebar() {
    return (
        <div className="flex flex-col w-64 border-r border-border bg-card h-screen fixed left-0 top-0 z-30">
            <div className="p-6">
                <h1 className="text-xl font-bold text-white">Reanimator</h1>
                <p className="text-xs text-muted-foreground">Backup & Recovery</p>
            </div>
            <nav className="flex-1 px-4 space-y-1">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                        <item.icon className="h-4 w-4" />
                        {item.name}
                    </Link>
                ))}
                <div className="pt-2 mt-2 border-t border-border/50">
                    <TaskManager />
                </div>
            </nav>
            <div className="p-4 border-t border-border text-xs text-muted-foreground">
                v1.0.0
            </div>
        </div>
    );
}
