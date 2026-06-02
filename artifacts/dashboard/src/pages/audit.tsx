import { useParams, useLocation } from "wouter";
import { useGetWallet, useListAuditLog } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCkb } from "@/lib/format";
import { ChevronLeft, Activity, ExternalLink } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">success</Badge>;
  if (status === "blocked") return <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-xs">blocked</Badge>;
  if (status === "failed") return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">failed</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function AuditPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();

  const { data: wallet } = useGetWallet(id);
  const { data: logs, isLoading } = useListAuditLog(id);

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => setLocation(`/wallets/${id}`)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ChevronLeft className="h-3 w-3" /> {wallet?.name ?? "Wallet"}
        </button>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Audit Log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{logs?.length ?? 0} entries — complete record of all agent operations</p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}
            </div>
          ) : logs && logs.length > 0 ? (
            <div className="space-y-1">
              {logs.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between p-3 rounded hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      entry.status === "success" ? "bg-green-400" :
                      entry.status === "blocked" ? "bg-yellow-400" : "bg-red-400"
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{entry.action.replace(/_/g, " ")}</span>
                        <StatusBadge status={entry.status} />
                        {entry.amountShannons && (
                          <span className="text-xs text-muted-foreground">{formatCkb(entry.amountShannons)}</span>
                        )}
                      </div>
                      {entry.blockedReason && (
                        <p className="text-xs text-yellow-400/80 mt-0.5">{entry.blockedReason}</p>
                      )}
                      {entry.txHash && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono">
                            tx: {entry.txHash.slice(0, 10)}...{entry.txHash.slice(-6)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-4">{timeAgo(entry.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No audit log entries yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
