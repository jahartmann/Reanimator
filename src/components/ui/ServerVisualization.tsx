'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, MemoryStick, HardDrive, Network, Wifi, Server, Activity, Database, Gauge } from 'lucide-react';

interface NetworkInterface {
    name: string;
    ip: string;
    mac: string;
    state: string;
    type: string;
    speed?: string;
    bridge?: string;
    slaves?: string[];
}

interface DiskInfo {
    name: string;
    size: string;
    type: string;
    mountpoint: string;
    model?: string;
    serial?: string;
    filesystem?: string;
    rotational?: boolean;
    transport?: string;
}

interface StoragePool {
    name: string;
    type: 'zfs' | 'ceph' | 'lvm' | 'dir';
    size: string;
    used: string;
    available: string;
    health?: string;
}

interface SystemInfo {
    hostname: string;
    os: string;
    kernel: string;
    uptime: string;
    cpu: string;
    cpuCores: number;
    cpuUsage: number;
    memory: string;
    memoryTotal: number;
    memoryUsed: number;
    memoryUsage: number;
    loadAvg: string;
}

interface ServerVisualizationProps {
    system: SystemInfo;
    networks: NetworkInterface[];
    disks: DiskInfo[];
    pools: StoragePool[];
    serverType: 'pve' | 'pbs';
}

function UsageBar({ usage, color, label }: { usage: number; color: string; label: string }) {
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
                <span className="text-zinc-400">{label}</span>
                <span className="text-zinc-300 font-medium">{usage.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(usage, 100)}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />
            </div>
        </div>
    );
}

export function ServerVisualization({ system, networks, disks, pools, serverType }: ServerVisualizationProps) {
    const [hoveredComponent, setHoveredComponent] = useState<string | null>(null);

    const primaryColor = serverType === 'pve' ? '#f97316' : '#3b82f6';
    const primaryColorLight = serverType === 'pve' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)';

    // Count disks by type
    const physicalDisks = disks.filter(d => d.type === 'disk');
    const ssdCount = physicalDisks.filter(d => d.rotational === false).length;
    const hddCount = physicalDisks.filter(d => d.rotational === true).length;
    const nvmeCount = physicalDisks.filter(d => d.transport === 'nvme').length;
    const bootDisk = disks.find(d => d.mountpoint === '/boot' || d.mountpoint === '/boot/efi');

    // Parse memory
    const memUsage = system.memoryUsage || 0;
    const cpuUsage = system.cpuUsage || 0;

    // Get usage color
    const getUsageColor = (usage: number) => {
        if (usage < 50) return '#22c55e';
        if (usage < 80) return '#f59e0b';
        return '#ef4444';
    };

    return (
        <div className="relative w-full max-w-4xl mx-auto">
            {/* Server Chassis */}
            <div
                className="relative bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-xl p-6 border border-zinc-700 shadow-2xl"
                style={{ minHeight: '340px' }}
            >
                {/* Top bezel with vents */}
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-zinc-700 to-zinc-800 rounded-t-xl flex justify-center gap-1 items-center overflow-hidden">
                    {Array.from({ length: 40 }).map((_, i) => (
                        <div key={i} className="w-1 h-1 rounded-full bg-zinc-600" />
                    ))}
                </div>

                {/* Status LEDs */}
                <div className="absolute top-4 right-4 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse shadow-lg ${cpuUsage > 80 ? 'bg-red-500 shadow-red-500/50' : 'bg-green-500 shadow-green-500/50'}`} />
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">CPU</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse shadow-lg ${memUsage > 80 ? 'bg-red-500 shadow-red-500/50' : 'bg-green-500 shadow-green-500/50'}`} />
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">MEM</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Activity className="w-3 h-3 text-green-500" />
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">ACT</span>
                    </div>
                </div>

                {/* Server Type Badge */}
                <div
                    className="absolute top-4 left-4 px-3 py-1 rounded-md text-xs font-bold tracking-wider"
                    style={{ backgroundColor: primaryColorLight, color: primaryColor }}
                >
                    {serverType.toUpperCase()}
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-5 gap-4 mt-10">

                    {/* CPU Section */}
                    <motion.div
                        className="relative bg-zinc-800/50 rounded-lg p-4 border border-zinc-700 cursor-pointer overflow-hidden"
                        onHoverStart={() => setHoveredComponent('cpu')}
                        onHoverEnd={() => setHoveredComponent(null)}
                        whileHover={{ scale: 1.02, borderColor: primaryColor }}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <Cpu className="h-5 w-5" style={{ color: primaryColor }} />
                            <span className="text-xs font-semibold text-zinc-400">CPU</span>
                        </div>

                        {/* CPU Usage Circle */}
                        <div className="relative w-16 h-16 mx-auto">
                            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                                <path
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="#374151"
                                    strokeWidth="3"
                                />
                                <motion.path
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke={getUsageColor(cpuUsage)}
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    initial={{ strokeDasharray: '0, 100' }}
                                    animate={{ strokeDasharray: `${cpuUsage}, 100` }}
                                    transition={{ duration: 1, ease: 'easeOut' }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-bold text-zinc-200">{cpuUsage.toFixed(0)}%</span>
                            </div>
                        </div>

                        <p className="text-center text-[10px] text-zinc-500 mt-2">{system.cpuCores} Cores</p>

                        <AnimatePresence>
                            {hoveredComponent === 'cpu' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute inset-0 bg-zinc-900/98 p-3 flex flex-col justify-center"
                                >
                                    <p className="text-xs text-zinc-400 mb-2">Prozessor</p>
                                    <p className="text-xs text-white font-medium leading-tight mb-3">
                                        {system.cpu || 'Unbekannt'}
                                    </p>
                                    <div className="space-y-2">
                                        <UsageBar usage={cpuUsage} color={getUsageColor(cpuUsage)} label="Auslastung" />
                                        <p className="text-[10px] text-zinc-500">Load: {system.loadAvg}</p>
                                    </div>
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
                        <div className="flex items-center gap-2 mb-3">
                            <MemoryStick className="h-5 w-5" style={{ color: primaryColor }} />
                            <span className="text-xs font-semibold text-zinc-400">RAM</span>
                        </div>

                        {/* Memory Bar */}
                        <div className="flex gap-1 justify-center mb-2">
                            {Array.from({ length: 4 }).map((_, i) => {
                                const segmentFill = Math.min(Math.max((memUsage - i * 25) / 25, 0), 1);
                                return (
                                    <div
                                        key={i}
                                        className="w-2.5 h-12 rounded-sm bg-zinc-700 overflow-hidden flex flex-col-reverse"
                                    >
                                        <motion.div
                                            className="w-full"
                                            style={{ backgroundColor: getUsageColor(memUsage) }}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${segmentFill * 100}%` }}
                                            transition={{ duration: 0.5, delay: i * 0.1 }}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        <p className="text-center text-sm font-bold text-zinc-200">{memUsage.toFixed(0)}%</p>

                        <AnimatePresence>
                            {hoveredComponent === 'ram' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute inset-0 bg-zinc-900/98 p-3 flex flex-col justify-center"
                                >
                                    <p className="text-xs text-zinc-400 mb-2">Arbeitsspeicher</p>
                                    <p className="text-lg text-white font-bold">
                                        {(system.memoryUsed / 1024 / 1024 / 1024).toFixed(1)} / {(system.memoryTotal / 1024 / 1024 / 1024).toFixed(1)} GB
                                    </p>
                                    <div className="mt-3">
                                        <UsageBar usage={memUsage} color={getUsageColor(memUsage)} label="Belegt" />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* Storage Section */}
                    <motion.div
                        className="relative bg-zinc-800/50 rounded-lg p-4 border border-zinc-700 cursor-pointer overflow-hidden col-span-2"
                        onHoverStart={() => setHoveredComponent('storage')}
                        onHoverEnd={() => setHoveredComponent(null)}
                        whileHover={{ scale: 1.02, borderColor: primaryColor }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <HardDrive className="h-5 w-5" style={{ color: primaryColor }} />
                                <span className="text-xs font-semibold text-zinc-400">Storage</span>
                            </div>
                            <div className="flex gap-2 text-[10px]">
                                {nvmeCount > 0 && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">NVMe: {nvmeCount}</span>}
                                {ssdCount > 0 && <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">SSD: {ssdCount}</span>}
                                {hddCount > 0 && <span className="px-1.5 py-0.5 bg-zinc-600/50 text-zinc-400 rounded">HDD: {hddCount}</span>}
                            </div>
                        </div>

                        {/* Disk slots visualization */}
                        <div className="grid grid-cols-4 gap-2">
                            {physicalDisks.slice(0, 8).map((disk, i) => (
                                <div
                                    key={i}
                                    className={`h-10 rounded-sm flex flex-col items-center justify-center text-[9px] ${disk.transport === 'nvme' ? 'bg-purple-500/20 border border-purple-500/40' :
                                            disk.rotational === false ? 'bg-blue-500/20 border border-blue-500/40' :
                                                'bg-zinc-700 border border-zinc-600'
                                        }`}
                                >
                                    <span className="font-mono font-bold text-zinc-300">{disk.name}</span>
                                    <span className="text-zinc-500">{disk.size}</span>
                                </div>
                            ))}
                            {physicalDisks.length > 8 && (
                                <div className="h-10 rounded-sm bg-zinc-700/50 border border-dashed border-zinc-600 flex items-center justify-center text-[9px] text-zinc-500">
                                    +{physicalDisks.length - 8}
                                </div>
                            )}
                        </div>

                        {/* Storage Pools */}
                        {pools.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-zinc-700">
                                <div className="flex gap-2">
                                    {pools.slice(0, 3).map((pool, i) => (
                                        <div key={i} className="flex items-center gap-1.5 text-[10px]">
                                            <Database className={`h-3 w-3 ${pool.type === 'zfs' ? 'text-cyan-400' :
                                                    pool.type === 'ceph' ? 'text-red-400' :
                                                        'text-zinc-400'
                                                }`} />
                                            <span className="text-zinc-400">{pool.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <AnimatePresence>
                            {hoveredComponent === 'storage' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute inset-0 bg-zinc-900/98 p-3 overflow-auto"
                                >
                                    <p className="text-xs text-zinc-400 mb-2">Speichermedien</p>

                                    {/* Physical Disks */}
                                    <div className="space-y-1.5 mb-3">
                                        {physicalDisks.slice(0, 6).map((disk, i) => (
                                            <div key={i} className="flex justify-between items-center text-[10px] p-1.5 bg-zinc-800/50 rounded">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${disk.transport === 'nvme' ? 'bg-purple-500' :
                                                            disk.rotational === false ? 'bg-blue-500' :
                                                                'bg-zinc-500'
                                                        }`} />
                                                    <span className="text-white font-mono">{disk.name}</span>
                                                    <span className="text-zinc-500">{disk.model?.slice(0, 20) || disk.transport || ''}</span>
                                                </div>
                                                <span className="text-zinc-400">{disk.size}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Storage Pools */}
                                    {pools.length > 0 && (
                                        <>
                                            <p className="text-xs text-zinc-400 mb-2">Storage Pools</p>
                                            <div className="space-y-1">
                                                {pools.map((pool, i) => (
                                                    <div key={i} className="flex justify-between items-center text-[10px] p-1.5 bg-zinc-800/50 rounded">
                                                        <div className="flex items-center gap-2">
                                                            <Database className={`h-3 w-3 ${pool.type === 'zfs' ? 'text-cyan-400' :
                                                                    pool.type === 'ceph' ? 'text-red-400' :
                                                                        pool.type === 'lvm' ? 'text-amber-400' :
                                                                            'text-zinc-400'
                                                                }`} />
                                                            <span className="text-white">{pool.name}</span>
                                                            <span className="px-1 py-0.5 rounded bg-zinc-700 text-zinc-400 uppercase text-[8px]">{pool.type}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-zinc-300">{pool.used}</span>
                                                            <span className="text-zinc-500"> / {pool.size}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    {bootDisk && (
                                        <div className="mt-2 pt-2 border-t border-zinc-700 text-[10px] text-zinc-500">
                                            Boot: {bootDisk.name} ({bootDisk.mountpoint})
                                        </div>
                                    )}
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
                        <div className="flex items-center gap-2 mb-3">
                            <Network className="h-5 w-5" style={{ color: primaryColor }} />
                            <span className="text-xs font-semibold text-zinc-400">Network</span>
                        </div>

                        {/* Network Ports visualization */}
                        <div className="grid grid-cols-2 gap-1">
                            {networks.slice(0, 6).map((net, i) => {
                                const isPhysical = net.type === 'physical' || net.name.match(/^(eth|eno|enp|ens)/);
                                const isBridge = net.type === 'bridge' || net.name.startsWith('vmbr');
                                const isBond = net.type === 'bond' || net.name.startsWith('bond');

                                return (
                                    <div
                                        key={i}
                                        className={`h-6 rounded-sm flex items-center justify-center text-[8px] font-mono ${net.state === 'UP'
                                                ? isBridge ? 'bg-purple-500/30 border border-purple-500/50'
                                                    : isBond ? 'bg-amber-500/30 border border-amber-500/50'
                                                        : 'bg-green-500/30 border border-green-500/50'
                                                : 'bg-zinc-700/50 border border-zinc-600'
                                            }`}
                                    >
                                        <span className={net.state === 'UP' ? 'text-white' : 'text-zinc-500'}>{net.name}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <p className="text-center text-[10px] text-zinc-500 mt-2">
                            {networks.filter(n => n.state === 'UP').length}/{networks.length} aktiv
                        </p>

                        <AnimatePresence>
                            {hoveredComponent === 'network' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute inset-0 bg-zinc-900/98 p-3 overflow-auto"
                                >
                                    <p className="text-xs text-zinc-400 mb-2">Netzwerk-Interfaces</p>
                                    <div className="space-y-1.5">
                                        {networks.map((net, i) => {
                                            const isBridge = net.type === 'bridge' || net.name.startsWith('vmbr');
                                            const isBond = net.type === 'bond' || net.name.startsWith('bond');
                                            const isVlan = net.name.includes('.') || net.type === 'vlan';

                                            return (
                                                <div key={i} className="text-[10px] p-1.5 bg-zinc-800/50 rounded">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${net.state === 'UP' ? 'bg-green-500' : 'bg-zinc-600'}`} />
                                                        <span className="text-white font-mono font-medium">{net.name}</span>
                                                        {isBridge && <span className="px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[8px]">Bridge</span>}
                                                        {isBond && <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[8px]">Bond</span>}
                                                        {isVlan && <span className="px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-[8px]">VLAN</span>}
                                                        {net.speed && <span className="text-zinc-500">{net.speed}</span>}
                                                    </div>
                                                    <div className="flex justify-between mt-0.5 text-zinc-500 ml-3.5">
                                                        <span>{net.ip}</span>
                                                        <span className="font-mono text-[9px]">{net.mac}</span>
                                                    </div>
                                                    {net.bridge && (
                                                        <div className="ml-3.5 text-zinc-600 text-[9px]">→ {net.bridge}</div>
                                                    )}
                                                    {net.slaves && net.slaves.length > 0 && (
                                                        <div className="ml-3.5 text-zinc-600 text-[9px]">Slaves: {net.slaves.join(', ')}</div>
                                                    )}
                                                </div>
                                            );
                                        })}
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
                        <span className="text-zinc-600">|</span>
                        <span className="font-mono text-[10px]">{system.kernel}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Gauge className="h-3.5 w-3.5" />
                            <span className="text-zinc-400">Load: {system.loadAvg}</span>
                        </div>
                        <span className="text-zinc-600">|</span>
                        <span className="text-zinc-400">{system.uptime}</span>
                    </div>
                </div>
            </div>

            {/* Instruction */}
            <p className="text-center text-xs text-muted-foreground mt-4">
                Hover über die Komponenten für Details • CPU/RAM Auslastung live
            </p>
        </div>
    );
}
