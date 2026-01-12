'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, MemoryStick, HardDrive, Network, Wifi, Server } from 'lucide-react';

interface NetworkInterface {
    name: string;
    ip: string;
    mac: string;
    state: string;
}

interface DiskInfo {
    name: string;
    size: string;
    type: string;
    mountpoint: string;
}

interface SystemInfo {
    hostname: string;
    os: string;
    kernel: string;
    uptime: string;
    cpu: string;
    memory: string;
}

interface ServerVisualizationProps {
    system: SystemInfo;
    networks: NetworkInterface[];
    disks: DiskInfo[];
    serverType: 'pve' | 'pbs';
}

export function ServerVisualization({ system, networks, disks, serverType }: ServerVisualizationProps) {
    const [hoveredComponent, setHoveredComponent] = useState<string | null>(null);

    const primaryColor = serverType === 'pve' ? '#f97316' : '#3b82f6';
    const primaryColorLight = serverType === 'pve' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)';

    // Count disks by type
    const physicalDisks = disks.filter(d => d.type === 'disk');
    const partitions = disks.filter(d => d.type === 'part');

    // Parse memory
    const memoryMatch = system.memory.match(/^([\d.]+\s*\w+)/);
    const totalMemory = memoryMatch ? memoryMatch[1] : system.memory;

    return (
        <div className="relative w-full max-w-3xl mx-auto">
            {/* Server Chassis */}
            <div
                className="relative bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-xl p-6 border border-zinc-700 shadow-2xl"
                style={{ minHeight: '280px' }}
            >
                {/* Top bezel with vents */}
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-zinc-700 to-zinc-800 rounded-t-xl flex justify-center gap-1 items-center overflow-hidden">
                    {Array.from({ length: 30 }).map((_, i) => (
                        <div key={i} className="w-1 h-1 rounded-full bg-zinc-600" />
                    ))}
                </div>

                {/* Power LED */}
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" />
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">PWR</span>
                </div>

                {/* Server Type Badge */}
                <div
                    className="absolute top-4 left-4 px-3 py-1 rounded-md text-xs font-bold tracking-wider"
                    style={{ backgroundColor: primaryColorLight, color: primaryColor }}
                >
                    {serverType.toUpperCase()}
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-4 gap-4 mt-8">

                    {/* CPU Section */}
                    <motion.div
                        className="relative bg-zinc-800/50 rounded-lg p-4 border border-zinc-700 cursor-pointer overflow-hidden"
                        onHoverStart={() => setHoveredComponent('cpu')}
                        onHoverEnd={() => setHoveredComponent(null)}
                        whileHover={{ scale: 1.02, borderColor: primaryColor }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Cpu className="h-5 w-5" style={{ color: primaryColor }} />
                            <span className="text-xs font-semibold text-zinc-400">CPU</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="h-2 rounded-sm bg-zinc-700"
                                    style={{
                                        backgroundColor: hoveredComponent === 'cpu' ? primaryColor : undefined,
                                        opacity: hoveredComponent === 'cpu' ? 0.3 + (i * 0.08) : 1
                                    }}
                                />
                            ))}
                        </div>

                        <AnimatePresence>
                            {hoveredComponent === 'cpu' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute inset-0 bg-zinc-900/95 p-3 flex flex-col justify-center"
                                >
                                    <p className="text-xs text-zinc-400 mb-1">Prozessor</p>
                                    <p className="text-xs text-white font-medium leading-tight">
                                        {system.cpu || 'Unbekannt'}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* RAM Section */}
                    <motion.div
                        className="relative bg-zinc-800/50 rounded-lg p-4 border border-zinc-700 cursor-pointer overflow-hidden"
                        onHoverStart={() => setHoveredComponent('ram')}
                        onHoverEnd={() => setHoveredComponent(null)}
                        whileHover={{ scale: 1.02, borderColor: primaryColor }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <MemoryStick className="h-5 w-5" style={{ color: primaryColor }} />
                            <span className="text-xs font-semibold text-zinc-400">RAM</span>
                        </div>
                        <div className="flex gap-1 justify-center">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="w-2 h-10 rounded-sm bg-zinc-700"
                                    style={{
                                        backgroundColor: hoveredComponent === 'ram' ? primaryColor : undefined,
                                        opacity: hoveredComponent === 'ram' ? 0.4 + (i * 0.15) : 1
                                    }}
                                />
                            ))}
                        </div>

                        <AnimatePresence>
                            {hoveredComponent === 'ram' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute inset-0 bg-zinc-900/95 p-3 flex flex-col justify-center"
                                >
                                    <p className="text-xs text-zinc-400 mb-1">Arbeitsspeicher</p>
                                    <p className="text-sm text-white font-bold">{totalMemory}</p>
                                    <p className="text-[10px] text-zinc-500 mt-1">{system.memory}</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* Storage Section */}
                    <motion.div
                        className="relative bg-zinc-800/50 rounded-lg p-4 border border-zinc-700 cursor-pointer overflow-hidden"
                        onHoverStart={() => setHoveredComponent('storage')}
                        onHoverEnd={() => setHoveredComponent(null)}
                        whileHover={{ scale: 1.02, borderColor: primaryColor }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <HardDrive className="h-5 w-5" style={{ color: primaryColor }} />
                            <span className="text-xs font-semibold text-zinc-400">Storage</span>
                        </div>
                        <div className="space-y-1">
                            {physicalDisks.slice(0, 4).map((disk, i) => (
                                <div
                                    key={i}
                                    className="h-3 rounded-sm bg-zinc-700 flex items-center px-1"
                                    style={{
                                        backgroundColor: hoveredComponent === 'storage' ? primaryColorLight : undefined,
                                        borderLeft: `2px solid ${primaryColor}`
                                    }}
                                >
                                    <span className="text-[8px] text-zinc-500">{disk.name}</span>
                                </div>
                            ))}
                            {physicalDisks.length > 4 && (
                                <p className="text-[10px] text-zinc-500 text-center">
                                    +{physicalDisks.length - 4} mehr
                                </p>
                            )}
                        </div>

                        <AnimatePresence>
                            {hoveredComponent === 'storage' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute inset-0 bg-zinc-900/95 p-3 flex flex-col justify-center overflow-auto"
                                >
                                    <p className="text-xs text-zinc-400 mb-2">Speichermedien</p>
                                    <div className="space-y-1">
                                        {physicalDisks.map((disk, i) => (
                                            <div key={i} className="flex justify-between text-[10px]">
                                                <span className="text-white font-mono">{disk.name}</span>
                                                <span className="text-zinc-400">{disk.size}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mt-2">
                                        {partitions.length} Partitionen
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* Network Section */}
                    <motion.div
                        className="relative bg-zinc-800/50 rounded-lg p-4 border border-zinc-700 cursor-pointer overflow-hidden"
                        onHoverStart={() => setHoveredComponent('network')}
                        onHoverEnd={() => setHoveredComponent(null)}
                        whileHover={{ scale: 1.02, borderColor: primaryColor }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Network className="h-5 w-5" style={{ color: primaryColor }} />
                            <span className="text-xs font-semibold text-zinc-400">Network</span>
                        </div>
                        <div className="space-y-1">
                            {networks.slice(0, 3).map((net, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-1"
                                >
                                    <Wifi
                                        className={`h-3 w-3 ${net.state === 'UP' ? 'text-green-500' : 'text-zinc-600'}`}
                                    />
                                    <span className="text-[10px] text-zinc-400 truncate">{net.name}</span>
                                </div>
                            ))}
                            {networks.length > 3 && (
                                <p className="text-[10px] text-zinc-500">+{networks.length - 3} mehr</p>
                            )}
                        </div>

                        <AnimatePresence>
                            {hoveredComponent === 'network' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute inset-0 bg-zinc-900/95 p-3 flex flex-col justify-center overflow-auto"
                                >
                                    <p className="text-xs text-zinc-400 mb-2">Netzwerk-Interfaces</p>
                                    <div className="space-y-1.5">
                                        {networks.map((net, i) => (
                                            <div key={i} className="text-[10px]">
                                                <div className="flex items-center gap-1">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${net.state === 'UP' ? 'bg-green-500' : 'bg-zinc-600'}`} />
                                                    <span className="text-white font-medium">{net.name}</span>
                                                </div>
                                                <span className="text-zinc-500 font-mono ml-2.5">{net.ip}</span>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>

                {/* Bottom Info Bar */}
                <div className="mt-6 pt-4 border-t border-zinc-700 flex items-center justify-between text-xs text-zinc-500">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Server className="h-4 w-4" style={{ color: primaryColor }} />
                            <span className="font-mono">{system.hostname}</span>
                        </div>
                        <span className="text-zinc-600">|</span>
                        <span>{system.os}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-zinc-600">Uptime:</span>
                        <span className="text-zinc-400">{system.uptime}</span>
                    </div>
                </div>
            </div>

            {/* Instruction */}
            <p className="text-center text-xs text-muted-foreground mt-4">
                Hover über die Komponenten für Details
            </p>
        </div>
    );
}
