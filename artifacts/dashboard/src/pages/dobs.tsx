import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetWallet,
  useListDobs,
  useMintDob,
  getListDobsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Layers, Plus, Hash } from "lucide-react";

function DobStatusBadge({ status }: { status: string }) {
  if (status === "minted") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">minted</Badge>;
  if (status === "pending") return <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-xs">pending</Badge>;
  if (status === "burned") return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">burned</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

export default function DobsPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallet } = useGetWallet(id);
  const { data: dobs, isLoading } = useListDobs(id);
  const mintDob = useMintDob();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState("text/plain");
  const [content, setContent] = useState("");
  const [clusterName, setClusterName] = useState("");

  const handleMint = async () => {
    if (!name.trim()) return;
    try {
      await mintDob.mutateAsync({
        id,
        data: {
          name: name.trim(),
          description: description || undefined,
          contentType: contentType || undefined,
          content: content || undefined,
          clusterName: clusterName || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListDobsQueryKey(id) });
      setOpen(false);
      setName("");
      setDescription("");
      setContent("");
      setClusterName("");
      toast({ title: "DOB minted successfully" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Failed to mint DOB", description: msg, variant: "destructive" });
    }
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
              <Layers className="h-5 w-5 text-primary" />
              Digital Objects
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{dobs?.length ?? 0} DOBs minted by this wallet</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Mint DOB</Button>
            </DialogTrigger>
            <DialogContent className="dark bg-card border-border">
              <DialogHeader><DialogTitle>Mint Digital Object</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Genesis Token" className="bg-background border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="bg-background border-border text-sm resize-none" rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Content Type</Label>
                    <Input value={contentType} onChange={(e) => setContentType(e.target.value)} placeholder="text/plain" className="bg-background border-border text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cluster</Label>
                    <Input value={clusterName} onChange={(e) => setClusterName(e.target.value)} placeholder="Optional collection" className="bg-background border-border text-xs" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Content</Label>
                  <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content or URI" className="bg-background border-border text-xs font-mono resize-none" rows={3} />
                </div>
                <Button className="w-full" onClick={handleMint} disabled={mintDob.isPending || !name.trim()}>
                  {mintDob.isPending ? "Minting..." : "Mint DOB"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : dobs && dobs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {dobs.map((dob) => (
            <Card key={dob.id} className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{dob.name}</p>
                    {dob.clusterName && <p className="text-xs text-muted-foreground">{dob.clusterName}</p>}
                  </div>
                  <DobStatusBadge status={dob.status} />
                </div>
                {dob.description && (
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{dob.description}</p>
                )}
                <div className="space-y-1">
                  {dob.contentType && (
                    <Badge variant="outline" className="text-xs border-border mr-1">{dob.contentType}</Badge>
                  )}
                  {dob.tokenId && (
                    <div className="flex items-center gap-1 mt-1">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-mono">{dob.tokenId.slice(0, 12)}...</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Layers className="h-8 w-8 text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm font-medium text-foreground">No Digital Objects</p>
            <p className="text-xs text-muted-foreground mt-1">Mint your first DOB to create on-chain digital assets</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
