import { useState } from "react";
import {
  useListWallets,
  useCreateWallet,
  useDeleteWallet,
  getListWalletsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatCkb, truncateAddress } from "@/lib/format";
import {
  Plus,
  ChevronRight,
  Trash2,
  ShieldAlert,
  Copy,
  Check,
} from "lucide-react";

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={(e) => { e.stopPropagation(); copy(); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono">
      {truncateAddress(address)}
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function WalletsList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: wallets, isLoading } = useListWallets();
  const createWallet = useCreateWallet();
  const deleteWallet = useDeleteWallet();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [network, setNetwork] = useState("testnet");

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createWallet.mutateAsync({ data: { name: name.trim(), network: network as "mainnet" | "testnet" } });
      queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() });
      setOpen(false);
      setName("");
      toast({ title: "Wallet created", description: `${name} is ready.` });
    } catch {
      toast({ title: "Failed to create wallet", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number, walletName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteWallet.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() });
      toast({ title: "Wallet deleted", description: walletName });
    } catch {
      toast({ title: "Failed to delete wallet", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Agent Wallets</h1>
          <p className="text-sm text-muted-foreground mt-1">{wallets?.length ?? 0} wallets registered</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New Wallet
            </Button>
          </DialogTrigger>
          <DialogContent className="dark bg-card border-border">
            <DialogHeader>
              <DialogTitle>Create Agent Wallet</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Wallet Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Agent Delta"
                  className="bg-background border-border"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Network</Label>
                <Select value={network} onValueChange={setNetwork}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark bg-card border-border">
                    <SelectItem value="testnet">Testnet</SelectItem>
                    <SelectItem value="mainnet">Mainnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={createWallet.isPending || !name.trim()}>
                {createWallet.isPending ? "Creating..." : "Create Wallet"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : wallets && wallets.length > 0 ? (
        <div className="space-y-3">
          {wallets.map((w) => (
            <div
              key={w.id}
              className="group flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/50 cursor-pointer transition-all"
              onClick={() => setLocation(`/wallets/${w.id}`)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${w.isKilled ? "bg-red-400" : "bg-green-400"}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{w.name}</span>
                    {w.isKilled && (
                      <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs gap-1">
                        <ShieldAlert className="h-2.5 w-2.5" /> killed
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs border-border">{w.network}</Badge>
                  </div>
                  <CopyAddress address={w.address} />
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleDelete(w.id, w.name, e)}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No wallets yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first agent wallet to get started</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
