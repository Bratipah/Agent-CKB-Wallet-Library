import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetWallet,
  useGetSafetyRules,
  useUpdateSafetyRules,
  getGetSafetyRulesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatCkb } from "@/lib/format";
import { ChevronLeft, Shield, Plus, X, ShieldCheck, ShieldAlert } from "lucide-react";

const ALL_ACTIONS = ["transfer", "sign", "fiber_open", "fiber_pay", "dob_mint", "otx_compose"];

export default function SafetyPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallet } = useGetWallet(id);
  const { data: rules, isLoading } = useGetSafetyRules(id);
  const update = useUpdateSafetyRules();

  const [maxTransfer, setMaxTransfer] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const initFromRules = () => {
    if (rules) {
      setMaxTransfer(rules.maxTransferAmountShannons ? String(Number(rules.maxTransferAmountShannons) / 1e8) : "");
      setDailyLimit(rules.dailySpendingLimitShannons ? String(Number(rules.dailySpendingLimitShannons) / 1e8) : "");
    }
  };

  const toggleAction = async (action: string) => {
    if (!rules) return;
    const current = rules.allowedActions ?? [];
    const updated = current.includes(action) ? current.filter((a) => a !== action) : [...current, action];
    await update.mutateAsync({ id, data: { allowedActions: updated } });
    queryClient.invalidateQueries({ queryKey: getGetSafetyRulesQueryKey(id) });
  };

  const toggleActive = async () => {
    if (!rules) return;
    await update.mutateAsync({ id, data: { isActive: !rules.isActive } });
    queryClient.invalidateQueries({ queryKey: getGetSafetyRulesQueryKey(id) });
  };

  const saveLimits = async () => {
    setSaving(true);
    try {
      const data: Record<string, string | null> = {};
      if (maxTransfer) data.maxTransferAmountShannons = String(Math.floor(parseFloat(maxTransfer) * 1e8));
      else data.maxTransferAmountShannons = null;
      if (dailyLimit) data.dailySpendingLimitShannons = String(Math.floor(parseFloat(dailyLimit) * 1e8));
      else data.dailySpendingLimitShannons = null;
      await update.mutateAsync({ id, data });
      queryClient.invalidateQueries({ queryKey: getGetSafetyRulesQueryKey(id) });
      toast({ title: "Limits updated" });
    } catch {
      toast({ title: "Failed to update limits", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addToWhitelist = async () => {
    if (!rules || !newAddress.trim()) return;
    const updated = [...(rules.addressWhitelist ?? []), newAddress.trim()];
    await update.mutateAsync({ id, data: { addressWhitelist: updated } });
    queryClient.invalidateQueries({ queryKey: getGetSafetyRulesQueryKey(id) });
    setNewAddress("");
  };

  const removeFromWhitelist = async (address: string) => {
    if (!rules) return;
    const updated = (rules.addressWhitelist ?? []).filter((a) => a !== address);
    await update.mutateAsync({ id, data: { addressWhitelist: updated } });
    queryClient.invalidateQueries({ queryKey: getGetSafetyRulesQueryKey(id) });
  };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32 rounded-lg" /><Skeleton className="h-48 rounded-lg" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => setLocation(`/wallets/${id}`)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ChevronLeft className="h-3 w-3" /> {wallet?.name ?? "Wallet"}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Safety Rails
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Configure spending limits and action restrictions</p>
          </div>
          <div className="flex items-center gap-2">
            {rules?.isActive ? (
              <Badge className="bg-green-500/15 text-green-400 border-green-500/30 gap-1"><ShieldCheck className="h-3 w-3" />Active</Badge>
            ) : (
              <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 gap-1"><ShieldAlert className="h-3 w-3" />Disabled</Badge>
            )}
            <Switch checked={rules?.isActive ?? false} onCheckedChange={toggleActive} />
          </div>
        </div>
      </div>

      {/* Current status */}
      {rules && (
        <Card className="bg-card border-border">
          <CardContent className="pt-4 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Max Per Transfer</p>
              <p className="text-sm font-semibold text-foreground">
                {rules.maxTransferAmountShannons ? formatCkb(rules.maxTransferAmountShannons) : <span className="text-muted-foreground">No limit</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Daily Limit</p>
              <p className="text-sm font-semibold text-foreground">
                {rules.dailySpendingLimitShannons ? formatCkb(rules.dailySpendingLimitShannons) : <span className="text-muted-foreground">No limit</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Spent Today</p>
              <p className="text-sm font-semibold text-foreground">{formatCkb(rules.dailySpentShannons)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spending Limits */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Spending Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Max Transfer (CKB)</Label>
              <Input
                value={maxTransfer}
                onChange={(e) => setMaxTransfer(e.target.value)}
                placeholder={rules?.maxTransferAmountShannons ? String(Number(rules.maxTransferAmountShannons) / 1e8) : "No limit"}
                className="bg-background border-border text-sm"
                type="number"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Daily Limit (CKB)</Label>
              <Input
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                placeholder={rules?.dailySpendingLimitShannons ? String(Number(rules.dailySpendingLimitShannons) / 1e8) : "No limit"}
                className="bg-background border-border text-sm"
                type="number"
              />
            </div>
          </div>
          <Button size="sm" onClick={saveLimits} disabled={saving}>
            {saving ? "Saving..." : "Save Limits"}
          </Button>
        </CardContent>
      </Card>

      {/* Action Whitelist */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Allowed Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_ACTIONS.map((action) => {
              const enabled = rules?.allowedActions?.includes(action) ?? false;
              return (
                <button
                  key={action}
                  onClick={() => toggleAction(action)}
                  className={`flex items-center justify-between px-3 py-2 rounded border text-xs font-medium transition-colors ${
                    enabled
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-muted/30 border-border text-muted-foreground hover:border-border/80"
                  }`}
                >
                  <span>{action.replace("_", " ")}</span>
                  <div className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-primary" : "bg-muted-foreground/40"}`} />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Address Whitelist */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Address Whitelist
            <span className="text-xs font-normal text-muted-foreground ml-2">
              {(rules?.addressWhitelist ?? []).length === 0 ? "All addresses allowed" : `${rules?.addressWhitelist?.length} address(es)`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="ckb1qz... or ckt1qz..."
              className="bg-background border-border text-xs font-mono"
              onKeyDown={(e) => e.key === "Enter" && addToWhitelist()}
            />
            <Button size="sm" variant="outline" className="border-border shrink-0" onClick={addToWhitelist}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {(rules?.addressWhitelist ?? []).length > 0 && (
            <div className="space-y-1.5">
              {rules?.addressWhitelist?.map((addr) => (
                <div key={addr} className="flex items-center justify-between p-2 rounded bg-muted/40 text-xs font-mono">
                  <span className="text-muted-foreground">{addr.slice(0, 20)}...{addr.slice(-8)}</span>
                  <button onClick={() => removeFromWhitelist(addr)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
