import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetWallet,
  useGetWalletBalance,
  useListCells,
  useActivateKillSwitch,
  useRestoreWallet,
  useTransferCkb,
  getListWalletsQueryKey,
  getGetWalletQueryKey,
  getGetWalletBalanceQueryKey,
  getListAuditLogQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
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
  Send,
  ExternalLink,
} from "lucide-react";

function NavTab({
  label,
  icon: Icon,
  path,
}: {
  label: string;
  icon: React.ElementType;
  path: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation(path)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function TransferDialog({ walletId, network }: { walletId: number; network: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const transfer = useTransferCkb();
  const [open, setOpen] = useState(false);
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [result, setResult] = useState<{ txHash: string; status: string } | null>(null);

  const explorerBase =
    network === "mainnet"
      ? "https://explorer.nervos.org/transaction"
      : "https://pudge.explorer.nervos.org/transaction";

  const handleTransfer = async () => {
    if (!toAddress.trim() || !amount.trim()) return;
    const shannons = String(Math.floor(parseFloat(amount) * 1e8));
    try {
      const res = await transfer.mutateAsync({
        id: walletId,
        data: { toAddress: toAddress.trim(), amount: shannons, memo: memo || undefined },
      });
      setResult({ txHash: res.txHash, status: res.status });
      queryClient.invalidateQueries({ queryKey: getGetWalletBalanceQueryKey(walletId) });
      queryClient.invalidateQueries({ queryKey: getListAuditLogQueryKey(walletId) });
      toast({
        title: "Transfer submitted",
        description: `${amount} CKB → ${truncateAddress(toAddress)}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transfer failed";
      toast({ title: "Transfer failed", description: msg, variant: "destructive" });
    }
  };

  const reset = () => {
    setToAddress("");
    setAmount("");
    setMemo("");
    setResult(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Send className="h-3.5 w-3.5" />
          Transfer CKB
        </Button>
      </DialogTrigger>
      <DialogContent className="dark bg-card border-border">
        <DialogHeader>
          <DialogTitle>Transfer CKB</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4 space-y-2">
              <p className="text-sm font-semibold text-green-400">
                {result.status === "pending" ? "Transaction broadcast!" : "Transaction signed"}
              </p>
              <p className="text-xs text-muted-foreground font-mono break-all">{result.txHash}</p>
              <Badge variant="outline" className="text-xs border-border">{result.status}</Badge>
            </div>
            {result.status === "pending" && (
              <a
                href={`${explorerBase}/${result.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View on CKB Explorer
              </a>
            )}
            <Button className="w-full" variant="outline" onClick={() => { reset(); setOpen(false); }}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient Address</Label>
              <Input
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder={network === "mainnet" ? "ckb1qz..." : "ckt1qz..."}
                className="bg-background border-border text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (CKB)</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="61"
                className="bg-background border-border"
                type="number"
                min="61"
                step="any"
              />
              <p className="text-xs text-muted-foreground">Minimum 61 CKB per cell</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Memo (optional)</Label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Payment note"
                className="bg-background border-border text-sm"
              />
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <p>• Wallet must have funded cells to send</p>
              <p>
                • Get testnet CKB at{" "}
                <a
                  href="https://faucet.nervos.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  faucet.nervos.org
                </a>
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleTransfer}
              disabled={transfer.isPending || !toAddress || !amount}
            >
              {transfer.isPending ? "Signing & broadcasting..." : "Send Transfer"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!wallet) {
    return <div className="text-sm text-muted-foreground">Wallet not found</div>;
  }

  const base = `/wallets/${id}`;
  const explorerBase =
    wallet.network === "mainnet"
      ? "https://explorer.nervos.org/address"
      : "https://pudge.explorer.nervos.org/address";

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
            <div className="flex items-center gap-2 flex-wrap">
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
              <Badge variant="outline" className="border-border text-xs">
                {wallet.network}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <button
                onClick={copyAddress}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
              >
                {truncateAddress(wallet.address)}
                {copied ? (
                  <Check className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
              <a
                href={`${explorerBase}/${wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Explorer
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {!wallet.isKilled && <TransferDialog walletId={id} network={wallet.network} />}
            {wallet.isKilled ? (
              <Button
                size="sm"
                variant="outline"
                className="border-border gap-2"
                onClick={handleRestore}
                disabled={restore.isPending}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {restore.isPending ? "Restoring..." : "Restore"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                className="gap-2"
                onClick={handleKill}
                disabled={killSwitch.isPending}
              >
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
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Total Balance
                </p>
                <p className="text-lg font-bold text-foreground">
                  {formatCkb(balance?.totalCapacity)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Free Balance
                </p>
                <p className="text-lg font-bold text-green-400">
                  {formatCkb(balance?.freeCapacity)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Live Cells
                </p>
                <p className="text-lg font-bold text-foreground">{balance?.cellCount ?? 0}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/50 rounded-lg w-fit">
        <NavTab label="Safety" icon={Shield} path={`${base}/safety`} />
        <NavTab label="Fiber" icon={Zap} path={`${base}/fiber`} />
        <NavTab label="DOBs" icon={Layers} path={`${base}/dobs`} />
        <NavTab label="OTX" icon={FileText} path={`${base}/otx`} />
        <NavTab label="Audit Log" icon={Activity} path={`${base}/audit`} />
      </div>

      {/* Faucet info for empty wallets */}
      {balance && balance.cellCount === 0 && !wallet.isKilled && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 flex items-start gap-3">
          <div className="pt-0.5">
            <Database className="h-4 w-4 text-yellow-400" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-yellow-400">Wallet has no funds</p>
            <p className="text-xs text-muted-foreground">
              Fund this wallet to send transactions.{" "}
              {wallet.network === "testnet" && (
                <a
                  href={`https://faucet.nervos.org/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Get testnet CKB from faucet.nervos.org
                </a>
              )}
            </p>
            <p className="text-xs font-mono text-muted-foreground break-all">{wallet.address}</p>
          </div>
        </div>
      )}

      {/* Live Cells */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            Live Cells
            {balance && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                ({balance.cellCount} total)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cellsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 rounded" />
              ))}
            </div>
          ) : cells && cells.length > 0 ? (
            <div className="space-y-2">
              {cells.slice(0, 10).map((cell, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded bg-muted/40 text-xs"
                >
                  <div className="flex items-center gap-2 font-mono text-muted-foreground">
                    <Hash className="h-3 w-3" />
                    {cell.txHash.slice(0, 10)}...{cell.txHash.slice(-6)}:{cell.index}
                  </div>
                  <div className="flex items-center gap-2">
                    {cell.typeScript && (
                      <Badge variant="outline" className="text-xs border-border">
                        type
                      </Badge>
                    )}
                    <span className="font-medium text-foreground">
                      {formatCkb(cell.capacity)}
                    </span>
                  </div>
                </div>
              ))}
              {cells.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{cells.length - 10} more cells
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">
              No live cells found.{" "}
              {wallet.network === "testnet" && (
                <a
                  href="https://faucet.nervos.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Get testnet CKB →
                </a>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Public Key */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">
            Public Key (secp256k1 compressed)
          </p>
          <p className="text-xs font-mono text-muted-foreground break-all">{wallet.publicKey}</p>
        </CardContent>
      </Card>
    </div>
  );
}
