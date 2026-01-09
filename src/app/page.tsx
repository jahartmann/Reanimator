import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Server, Activity, AlertCircle, CheckCircle2, Clock } from "lucide-react";

export const dynamic = 'force-dynamic';

function getStats() {
  const serverCount = db.prepare('SELECT COUNT(*) as count FROM servers').get() as { count: number };
  const pveCount = db.prepare("SELECT COUNT(*) as count FROM servers WHERE type = 'pve'").get() as { count: number };
  const pbsCount = db.prepare("SELECT COUNT(*) as count FROM servers WHERE type = 'pbs'").get() as { count: number };
  const jobCount = db.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number };

  // Get recent history
  const recentHistory = db.prepare(`
    SELECT h.*, j.name as job_name 
    FROM history h 
    JOIN jobs j ON h.job_id = j.id 
    ORDER BY start_time DESC 
    LIMIT 5
  `).all() as any[];

  return {
    servers: { total: serverCount.count, pve: pveCount.count, pbs: pbsCount.count },
    jobs: jobCount.count,
    history: recentHistory
  };
}

export default function Dashboard() {
  const stats = getStats();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Dashboard</h2>
          <p className="text-muted-foreground mt-1">Overview of your infrastructure and backup status.</p>
        </div>
        <div className="px-4 py-2 bg-indigo-500/10 text-indigo-400 rounded-full text-sm font-medium border border-indigo-500/20">
          System Healthy
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors border-l-4 border-l-indigo-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Servers</CardTitle>
            <Server className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.servers.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.servers.pve} PVE Nodes, {stats.servers.pbs} PBS Nodes
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.jobs}</div>
            <p className="text-xs text-muted-foreground">
              Scheduled backup tasks
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">100%</div>
            <p className="text-xs text-muted-foreground">
              Last 24 hours
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Run</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">
              No pending jobs
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest backup and sync operations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
                  <p>No activity recorded yet.</p>
                </div>
              ) : (
                stats.history.map((item) => (
                  <div key={item.id} className="flex items-center">
                    {/* Activity Item Mockup */}
                    <div className="ml-4 space-y-1">
                      <p className="text-sm font-medium leading-none">{item.job_name}</p>
                      <p className="text-sm text-muted-foreground">{item.status}</p>
                    </div>
                    <div className="ml-auto font-medium">
                      {new Date(item.start_time).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Storage Overview</CardTitle>
            <CardDescription>
              Capacity of connected PBS nodes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mb-2">
                <div className="h-full bg-indigo-500 w-[0%]"></div>
              </div>
              <p className="text-xs">0 GB / 0 GB Used</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
