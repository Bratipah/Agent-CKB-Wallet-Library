import { useGetStats, useListWallets, useListAuditLog } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCkb } from "@/lib/format";
import {
  Wallet,
  ShieldAlert,
  Activity,
  Zap,
  Layers,
  ArrowRight,
  TrendingUp,
  Ban,
} from "lucide-react";

function StatCard({
  title,
  value,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  variant?: "default" | "danger" | "success" | "warning";
}) {
  const colors = {
    default: "text-primary",
    danger: "text-destructive",
    success: "text-green-400",
    warning: "text-yellow-400",
  };
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
          <div className={`p-2 rounded-md bg-muted ${colors[variant]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function statusBadge(status: string) {
  if (status === "success") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">success</Badge>;
  if (status === "blocked") return <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-xs">blocked</Badge>;
  if (status === "failed") return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">failed</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: wallets, isLoading: walletsLoading } = useListWallets();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">System-wide status across all agent wallets</p>
      </div>

      {/* Stats Grid */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Wallets" value={stats?.totalWallets ?? 0} icon={Wallet} />
          <StatCard title="Active Wallets" value={stats?.activeWallets ?? 0} icon={Activity} variant="success" />
          <StatCard title="Killed Wallets" value={stats?.killedWallets ?? 0} icon={ShieldAlert} variant="danger" />
          <StatCard title="Total Operations" value={stats?.totalTransactions ?? 0} icon={TrendingUp} />
          <StatCard title="Blocked Operations" value={stats?.blockedTransactions ?? 0} icon={Ban} variant="warning" />
          <StatCard title="Open Channels" value={stats?.openChannels ?? 0} icon={Zap} variant="success" />
          <StatCard title="Minted DOBs" value={stats?.mintedDobs ?? 0} icon={Layers} />
        </div>
      )}

      {/* Wallets Quick View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">Agent Wallets</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => setLocation("/wallets")}>
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {walletsLoading ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)
            ) : wallets && wallets.length > 0 ? (
              wallets.slice(0, 5).map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/70 cursor-pointer transition-colors"
                  onClick={() => setLocation(`/wallets/${w.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${w.isKilled ? "bg-red-400" : "bg-green-400"}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{w.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {w.address.slice(0, 12)}...{w.address.slice(-6)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-border">
                      {w.network}
                    </Badge>
                    {w.isKilled && (
                      <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">killed</Badge>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No wallets yet. Create one to get started.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full justify-start gap-2"
              onClick={() => setLocation("/wallets")}
            >
              <Wallet className="h-4 w-4" />
              Create New Wallet
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-border"
              onClick={() => setLocation("/wallets")}
            >
              <Zap className="h-4 w-4" />
              Open Fiber Channel
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-border"
              onClick={() => setLocation("/wallets")}
            >
              <Layers className="h-4 w-4" />
              Mint Digital Object
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
