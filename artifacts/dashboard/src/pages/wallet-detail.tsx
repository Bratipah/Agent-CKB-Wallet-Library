import { useParams, useLocation } from "wouter";
import {
  useGetWallet,
  useGetWalletBalance,
  useListCells,
  useActivateKillSwitch,
  useRestoreWallet,
  getListWalletsQueryKey,
  getGetWalletQueryKey,
  getGetWalletBalanceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { formatCkb, truncateAddress } from "@/lib/format";
import {
  ShieldAlert,
  ShieldCheck,
  Copy,
  ChevronLeft,
  Zap,
  Layers,
  FileText,
  Shield,
  Activity,
  Hash,
  Check,
  Database,
} from "lucide-react";
import { useState } from "react";

function NavTab({ label, icon: Icon, path, active }: { label: string; icon: React.ElementType; path: string; active: boolean }) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation(path)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export default function WalletDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallet, isLoading: walletLoading } = useGetWallet(id);
  const { data: balance, isLoading: balanceLoading } = useGetWalletBalance(id);
  const { data: cells, isLoading: cellsLoading } = useListCells(id);

  const killSwitch = useActivateKillSwitch();
  const restore = useRestoreWallet();
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleKill = async () => {
    try {
      await killSwitch.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() });
      toast({ title: "Kill switch activated", description: "All agent operations are now disabled." });
    } catch {
      toast({ title: "Failed to activate kill switch", variant: "destructive" });
    }
  };

  const handleRestore = async () => {
    try {
      await restore.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() });
      toast({ title: "Wallet restored", description: "Operations re-enabled." });
    } catch {
      toast({ title: "Failed to restore wallet", variant: "destructive" });
    }
  };

  if (walletLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 rounded-lg" /><Skeleton className="h-48 rounded-lg" /></div>;
  }

  if (!wallet) {
    return <div className="text-sm text-muted-foreground">Wallet not found</div>;
  }

  const base = `/wallets/${id}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <button
          onClick={() => setLocation("/wallets")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ChevronLeft className="h-3 w-3" /> Wallets
        </button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{wallet.name}</h1>
              {wallet.isKilled ? (
                <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1">
                  <ShieldAlert className="h-3 w-3" /> Killed
                </Badge>
              ) : (
                <Badge className="bg-green-500/15 text-green-400 border-green-500/30 gap-1">
                  <ShieldCheck className="h-3 w-3" /> Active
                </Badge>
              )}
              <Badge variant="outline" className="border-border text-xs">{wallet.network}</Badge>
            </div>
            <button onClick={copyAddress} className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono">
              {truncateAddress(wallet.address)}
              {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
          <div>
            {wallet.isKilled ? (
              <Button size="sm" variant="outline" className="border-border gap-2" onClick={handleRestore} disabled={restore.isPending}>
                <ShieldCheck className="h-3.5 w-3.5" />
                {restore.isPending ? "Restoring..." : "Restore"}
              </Button>
            ) : (
              <Button size="sm" variant="destructive" className="gap-2" onClick={handleKill} disabled={killSwitch.isPending}>
                <ShieldAlert className="h-3.5 w-3.5" />
                {killSwitch.isPending ? "Activating..." : "Kill Switch"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Balance */}
      <div className="grid grid-cols-3 gap-3">
        {balanceLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : (
          <>
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Balance</p>
                <p className="text-lg font-bold text-foreground">{formatCkb(balance?.totalCapacity)}</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Free Balance</p>
                <p className="text-lg font-bold text-green-400">{formatCkb(balance?.freeCapacity)}</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Live Cells</p>
                <p className="text-lg font-bold text-foreground">{balance?.cellCount ?? 0}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/50 rounded-lg w-fit">
        <NavTab label="Safety" icon={Shield} path={`${base}/safety`} active={false} />
        <NavTab label="Fiber" icon={Zap} path={`${base}/fiber`} active={false} />
        <NavTab label="DOBs" icon={Layers} path={`${base}/dobs`} active={false} />
        <NavTab label="OTX" icon={FileText} path={`${base}/otx`} active={false} />
        <NavTab label="Audit Log" icon={Activity} path={`${base}/audit`} active={false} />
      </div>

      {/* Live Cells */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            Live Cells
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cellsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
            </div>
          ) : cells && cells.length > 0 ? (
            <div className="space-y-2">
              {cells.slice(0, 10).map((cell, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded bg-muted/40 text-xs">
                  <div className="flex items-center gap-2 font-mono text-muted-foreground">
                    <Hash className="h-3 w-3" />
                    {cell.txHash.slice(0, 10)}...{cell.txHash.slice(-6)}:{cell.index}
                  </div>
                  <div className="flex items-center gap-2">
                    {cell.typeScript && <Badge variant="outline" className="text-xs border-border">type</Badge>}
                    <span className="font-medium text-foreground">{formatCkb(cell.capacity)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">
              No live cells found. Fund this wallet via testnet faucet or mainnet transfer.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Public Key */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Public Key</p>
          <p className="text-xs font-mono text-muted-foreground break-all">{wallet.publicKey}</p>
        </CardContent>
      </Card>
    </div>
  );
}
