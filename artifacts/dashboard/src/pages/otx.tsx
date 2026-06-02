import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetWallet,
  useListOtxIntents,
  useComposeOtxIntent,
  useFinalizeOtxIntent,
  getListOtxIntentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, FileText, Plus, CheckCircle, Hash } from "lucide-react";

function IntentStatusBadge({ status }: { status: string }) {
  if (status === "finalized") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">finalized</Badge>;
  if (status === "pending") return <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-xs">pending</Badge>;
  if (status === "failed") return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">failed</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

export default function OtxPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallet } = useGetWallet(id);
  const { data: intents, isLoading } = useListOtxIntents(id);
  const compose = useComposeOtxIntent();
  const finalize = useFinalizeOtxIntent();

  const [open, setOpen] = useState(false);
  const [intentType, setIntentType] = useState("swap");
  const [intentDataStr, setIntentDataStr] = useState('{\n  "fromAsset": "CKB",\n  "toAsset": "USDC",\n  "amount": "1000000000"\n}');

  const handleCompose = async () => {
    let intentData: Record<string, unknown>;
    try {
      intentData = JSON.parse(intentDataStr);
    } catch {
      toast({ title: "Invalid JSON in intent data", variant: "destructive" });
      return;
    }
    try {
      await compose.mutateAsync({ id, data: { intentType, intentData } });
      queryClient.invalidateQueries({ queryKey: getListOtxIntentsQueryKey(id) });
      setOpen(false);
      toast({ title: "OTX intent composed" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Failed to compose intent", description: msg, variant: "destructive" });
    }
  };

  const handleFinalize = async (intentId: number) => {
    try {
      await finalize.mutateAsync({ id, intentId });
      queryClient.invalidateQueries({ queryKey: getListOtxIntentsQueryKey(id) });
      toast({ title: "OTX intent finalized and broadcast" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Failed to finalize intent", description: msg, variant: "destructive" });
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => setLocation(`/wallets/${id}`)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ChevronLeft className="h-3 w-3" /> {wallet?.name ?? "Wallet"}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              OTX Intents
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Open Transaction intents for composable CKB operations</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Compose</Button>
            </DialogTrigger>
            <DialogContent className="dark bg-card border-border max-w-md">
              <DialogHeader><DialogTitle>Compose OTX Intent</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Intent Type</Label>
                  <Select value={intentType} onValueChange={setIntentType}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark bg-card border-border">
                      <SelectItem value="swap">swap</SelectItem>
                      <SelectItem value="transfer">transfer</SelectItem>
                      <SelectItem value="lock">lock</SelectItem>
                      <SelectItem value="unlock">unlock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Intent Data (JSON)</Label>
                  <Textarea
                    value={intentDataStr}
                    onChange={(e) => setIntentDataStr(e.target.value)}
                    className="bg-background border-border text-xs font-mono resize-none"
                    rows={6}
                  />
                </div>
                <Button className="w-full" onClick={handleCompose} disabled={compose.isPending}>
                  {compose.isPending ? "Composing..." : "Compose Intent"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : intents && intents.length > 0 ? (
        <div className="space-y-3">
          {intents.map((intent) => (
            <Card key={intent.id} className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs border-border font-mono">{intent.intentType}</Badge>
                      <IntentStatusBadge status={intent.status} />
                      <span className="text-xs text-muted-foreground ml-auto">{timeAgo(intent.createdAt)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 font-mono overflow-hidden">
                      <pre className="truncate">{JSON.stringify(intent.intentData, null, 0).slice(0, 120)}</pre>
                    </div>
                    {intent.txHash && (
                      <div className="flex items-center gap-1">
                        <Hash className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-mono">{intent.txHash.slice(0, 12)}...{intent.txHash.slice(-6)}</span>
                      </div>
                    )}
                  </div>
                  {intent.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border ml-3 shrink-0 gap-1.5 text-xs"
                      onClick={() => handleFinalize(intent.id)}
                      disabled={finalize.isPending}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Finalize
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
            <FileText className="h-8 w-8 text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm font-medium text-foreground">No OTX intents</p>
            <p className="text-xs text-muted-foreground mt-1">Compose intents to create composable on-chain operations</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
