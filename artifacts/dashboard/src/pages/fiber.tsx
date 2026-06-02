import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetWallet,
  useListFiberChannels,
  useOpenFiberChannel,
  useCloseFiberChannel,
  getListFiberChannelsQueryKey,
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
import { ChevronLeft, Zap, Plus, X } from "lucide-react";

function ChannelStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-green-500/15 text-green-400 border-green-500/30",
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    closing: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    closed: "bg-muted text-muted-foreground border-border",
  };
  return <Badge className={`text-xs ${map[status] ?? "bg-muted text-muted-foreground"}`}>{status}</Badge>;
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
  const closeChannel = useCloseFiberChannel();

  const [open, setOpen] = useState(false);
  const [peerAddress, setPeerAddress] = useState("");
  const [capacity, setCapacity] = useState("");

  const handleOpen = async () => {
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
      setOpen(false);
      setPeerAddress("");
      setCapacity("");
      toast({ title: "Channel opening initiated" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Failed to open channel", description: msg, variant: "destructive" });
    }
  };

  const handleClose = async (channelId: number) => {
    try {
      await closeChannel.mutateAsync({ id, channelId });
      queryClient.invalidateQueries({ queryKey: getListFiberChannelsQueryKey(id) });
      toast({ title: "Channel closing initiated" });
    } catch {
      toast({ title: "Failed to close channel", variant: "destructive" });
    }
  };

  const open_channels = channels?.filter((c) => ["open", "pending"].includes(c.status)) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => setLocation(`/wallets/${id}`)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ChevronLeft className="h-3 w-3" /> {wallet?.name ?? "Wallet"}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Fiber Channels
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{open_channels.length} open, {channels?.length ?? 0} total</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Open Channel</Button>
            </DialogTrigger>
            <DialogContent className="dark bg-card border-border">
              <DialogHeader><DialogTitle>Open Fiber Channel</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Peer Address</Label>
                  <Input
                    value={peerAddress}
                    onChange={(e) => setPeerAddress(e.target.value)}
                    placeholder="/ip4/x.x.x.x/tcp/8228/p2p/Qm..."
                    className="bg-background border-border text-xs font-mono"
                  />
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
                <Button className="w-full" onClick={handleOpen} disabled={openChannel.isPending || !peerAddress || !capacity}>
                  {openChannel.isPending ? "Opening..." : "Open Channel"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : channels && channels.length > 0 ? (
        <div className="space-y-3">
          {channels.map((ch) => (
            <Card key={ch.id} className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <ChannelStatusBadge status={ch.status} />
                      {ch.channelId && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {ch.channelId.slice(0, 10)}...
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">{ch.peerAddress}</p>
                    <div className="flex items-center gap-4 text-xs">
                      <span><span className="text-muted-foreground">Local:</span> <span className="font-medium text-foreground">{formatCkb(ch.localCapacityShannons)}</span></span>
                      {ch.remoteCapacityShannons && (
                        <span><span className="text-muted-foreground">Remote:</span> <span className="font-medium text-foreground">{formatCkb(ch.remoteCapacityShannons)}</span></span>
                      )}
                    </div>
                  </div>
                  {ch.status !== "closed" && ch.status !== "closing" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleClose(ch.id)}
                      disabled={closeChannel.isPending}
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
            <p className="text-xs text-muted-foreground mt-1">Open a channel to enable instant off-chain payments</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
