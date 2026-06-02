import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetWallet,
  useListFiberChannels,
  useOpenFiberChannel,
  useCloseFiberChannel,
  useFiberPay,
  getListFiberChannelsQueryKey,
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
import { formatCkb } from "@/lib/format";
import { ChevronLeft, Zap, Plus, X, Send, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface FiberNodeStatus {
  configured: boolean;
  nodeInfo?: { node_name: string; peer_id: string; addresses: string[] } | null;
  error?: string;
}

function ChannelStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-green-500/15 text-green-400 border-green-500/30",
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    closing: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    closed: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge className={`text-xs ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </Badge>
  );
}

function FiberNodeBanner({ status }: { status: FiberNodeStatus | null }) {
  if (!status) return null;

  if (!status.configured) {
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-yellow-400">Fiber node not configured</p>
          <p className="text-xs text-muted-foreground">
            Set <code className="bg-muted px-1 py-0.5 rounded font-mono">FIBER_RPC_URL</code> to
            your Fiber node's RPC URL (default port 8227). Channel records will still be saved.
          </p>
          <a
            href="https://www.fiber.world/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Fiber node setup guide →
          </a>
        </div>
      </div>
    );
  }

  if (status.error || !status.nodeInfo) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-red-400">Fiber node unreachable</p>
          <p className="text-xs text-muted-foreground mt-0.5">{status.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 flex items-start gap-3">
      <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
      <div className="space-y-0.5 min-w-0">
        <p className="text-sm font-medium text-green-400">
          Fiber node connected — {status.nodeInfo.node_name}
        </p>
        <p className="text-xs text-muted-foreground font-mono truncate">
          {status.nodeInfo.peer_id}
        </p>
        {status.nodeInfo.addresses.length > 0 && (
          <p className="text-xs text-muted-foreground font-mono truncate">
            {status.nodeInfo.addresses[0]}
          </p>
        )}
      </div>
    </div>
  );
}

export default function FiberPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallet } = useGetWallet(id);
  const { data: channels, isLoading } = useListFiberChannels(id);
  const openChannel = useOpenFiberChannel();
  const closeChannelMut = useCloseFiberChannel();
  const fiberPay = useFiberPay();

  const [nodeStatus, setNodeStatus] = useState<FiberNodeStatus | null>(null);
  const [nodeLoading, setNodeLoading] = useState(true);

  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [peerAddress, setPeerAddress] = useState("");
  const [capacity, setCapacity] = useState("");

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState("");
  const [payAmount, setPayAmount] = useState("");

  useEffect(() => {
    fetch("/api/fiber/node")
      .then((r) => r.json())
      .then((data: FiberNodeStatus) => setNodeStatus(data))
      .catch(() => setNodeStatus({ configured: false }))
      .finally(() => setNodeLoading(false));
  }, []);

  const handleOpenChannel = async () => {
    if (!peerAddress.trim() || !capacity.trim()) return;
    try {
      await openChannel.mutateAsync({
        id,
        data: {
          peerAddress: peerAddress.trim(),
          localCapacityShannons: String(Math.floor(parseFloat(capacity) * 1e8)),
        },
      });
      queryClient.invalidateQueries({ queryKey: getListFiberChannelsQueryKey(id) });
      setOpenDialogOpen(false);
      setPeerAddress("");
      setCapacity("");
      toast({
        title: nodeStatus?.nodeInfo ? "Channel opening submitted to Fiber node" : "Channel saved",
        description: nodeStatus?.nodeInfo ? "Waiting for on-chain confirmation" : "Configure FIBER_RPC_URL to open real channels",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Failed to open channel", description: msg, variant: "destructive" });
    }
  };

  const handleCloseChannel = async (channelDbId: number) => {
    try {
      await closeChannelMut.mutateAsync({ id, channelId: channelDbId });
      queryClient.invalidateQueries({ queryKey: getListFiberChannelsQueryKey(id) });
      toast({ title: "Channel close initiated" });
    } catch {
      toast({ title: "Failed to close channel", variant: "destructive" });
    }
  };

  const handlePay = async () => {
    if (!payInvoice.trim() && !payAmount.trim()) return;
    const shannons = payAmount ? String(Math.floor(parseFloat(payAmount) * 1e8)) : "0";
    try {
      const res = await fiberPay.mutateAsync({
        id,
        data: { invoice: payInvoice.trim() || undefined, amountShannons: shannons },
      });
      queryClient.invalidateQueries({ queryKey: getListAuditLogQueryKey(id) });
      setPayDialogOpen(false);
      setPayInvoice("");
      setPayAmount("");
      toast({
        title: "Fiber payment sent",
        description: `Hash: ${res.txHash?.slice(0, 14)}...`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      toast({ title: "Payment failed", description: msg, variant: "destructive" });
    }
  };

  const openChannels = channels?.filter((c) => ["open", "pending"].includes(c.status)) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <button
          onClick={() => setLocation(`/wallets/${id}`)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ChevronLeft className="h-3 w-3" /> {wallet?.name ?? "Wallet"}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Fiber Channels
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {openChannels.length} open · {channels?.length ?? 0} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Pay button */}
            <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-border gap-2">
                  <Send className="h-3.5 w-3.5" />
                  Pay Invoice
                </Button>
              </DialogTrigger>
              <DialogContent className="dark bg-card border-border">
                <DialogHeader>
                  <DialogTitle>Send Fiber Payment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">BOLT11 Invoice</Label>
                    <Input
                      value={payInvoice}
                      onChange={(e) => setPayInvoice(e.target.value)}
                      placeholder="fibt1..."
                      className="bg-background border-border text-xs font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste a Fiber invoice from the recipient
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount (CKB) — if not encoded in invoice</Label>
                    <Input
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="0.001"
                      className="bg-background border-border"
                      type="number"
                    />
                  </div>
                  {!nodeStatus?.nodeInfo && (
                    <p className="text-xs text-yellow-400/80">
                      ⚠ Fiber node not connected — payment will be simulated
                    </p>
                  )}
                  <Button
                    className="w-full"
                    onClick={handlePay}
                    disabled={fiberPay.isPending || (!payInvoice && !payAmount)}
                  >
                    {fiberPay.isPending ? "Sending..." : "Send Payment"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Open channel button */}
            <Dialog open={openDialogOpen} onOpenChange={setOpenDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Open Channel
                </Button>
              </DialogTrigger>
              <DialogContent className="dark bg-card border-border">
                <DialogHeader>
                  <DialogTitle>Open Fiber Channel</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Peer Multiaddr</Label>
                    <Input
                      value={peerAddress}
                      onChange={(e) => setPeerAddress(e.target.value)}
                      placeholder="/ip4/x.x.x.x/tcp/8228/p2p/QmXXX..."
                      className="bg-background border-border text-xs font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Full multiaddr including <code className="bg-muted px-1 rounded">/p2p/</code>{" "}
                      component. The peer_id is extracted automatically.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Local Capacity (CKB)</Label>
                    <Input
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      placeholder="61"
                      className="bg-background border-border"
                      type="number"
                    />
                    <p className="text-xs text-muted-foreground">Minimum 61 CKB</p>
                  </div>
                  {!nodeStatus?.nodeInfo && (
                    <p className="text-xs text-yellow-400/80">
                      ⚠ Fiber node not connected — channel will be recorded but not opened on-chain
                    </p>
                  )}
                  <Button
                    className="w-full"
                    onClick={handleOpenChannel}
                    disabled={openChannel.isPending || !peerAddress || !capacity}
                  >
                    {openChannel.isPending ? "Opening..." : "Open Channel"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Fiber node status */}
      {nodeLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        <FiberNodeBanner status={nodeStatus} />
      )}

      {/* Channel list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : channels && channels.length > 0 ? (
        <div className="space-y-3">
          {channels.map((ch) => (
            <Card key={ch.id} className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ChannelStatusBadge status={ch.status} />
                      {ch.channelId && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {ch.channelId.slice(0, 14)}…
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {ch.peerAddress}
                    </p>
                    <div className="flex items-center gap-4 text-xs">
                      <span>
                        <span className="text-muted-foreground">Local: </span>
                        <span className="font-medium text-foreground">
                          {formatCkb(ch.localCapacityShannons)}
                        </span>
                      </span>
                      {ch.remoteCapacityShannons && (
                        <span>
                          <span className="text-muted-foreground">Remote: </span>
                          <span className="font-medium text-foreground">
                            {formatCkb(ch.remoteCapacityShannons)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  {ch.status !== "closed" && ch.status !== "closing" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleCloseChannel(ch.id)}
                      disabled={closeChannelMut.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="h-8 w-8 text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm font-medium text-foreground">No Fiber channels</p>
            <p className="text-xs text-muted-foreground mt-1">
              Open a channel to enable instant off-chain payments
            </p>
          </CardContent>
        </Card>
      )}

      {/* Fiber quickstart */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Fiber Quickstart
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">1. Run a Fiber node</p>
            <code className="block bg-muted/60 rounded px-2 py-1.5 font-mono">
              docker run -it ghcr.io/nervosnetwork/fiber testnet
            </code>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">2. Set the RPC URL</p>
            <code className="block bg-muted/60 rounded px-2 py-1.5 font-mono">
              FIBER_RPC_URL=http://127.0.0.1:8227
            </code>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">3. Open a channel & pay</p>
            <p>
              Connect to any peer from the{" "}
              <a
                href="https://www.fiber.world/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Fiber network
              </a>
              , lock CKB as collateral, then send instant off-chain payments.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
