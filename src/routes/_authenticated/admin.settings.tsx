import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseRpcError } from "@/lib/betting";
import { useSettings } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const { can } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const [bank, setBank] = useState(settings.bank_details);
  const [busy, setBusy] = useState(false);

  useEffect(() => setBank(settings.bank_details), [settings.bank_details]);

  if (!can("settings") && !can("finance")) return <p className="text-sm text-muted-foreground">You don't have permission to change settings.</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!bank.bank_name.trim() || !bank.account_name.trim() || !bank.account_number.trim()) return toast.error("Fill in all bank fields.");
    setBusy(true);
    const { error } = await supabase.rpc("admin_update_setting", { _key: "bank_details", _value: bank });
    setBusy(false);
    if (error) return toast.error(parseRpcError(error).message);
    toast.success("Bank details saved — customers can now deposit");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-3 rounded-lg border border-border bg-card p-4">
      <h1 className="font-semibold">Deposit bank account</h1>
      <p className="text-xs text-muted-foreground">Customers transfer money to this account and upload their slip.</p>
      <div className="space-y-1.5"><Label htmlFor="s-bank">Bank name</Label>
        <Input id="s-bank" value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="s-name">Account name</Label>
        <Input id="s-name" value={bank.account_name} onChange={(e) => setBank({ ...bank, account_name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="s-num">Account number</Label>
        <Input id="s-num" value={bank.account_number} onChange={(e) => setBank({ ...bank, account_number: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="s-ins">Instructions</Label>
        <Textarea id="s-ins" rows={3} value={bank.instructions} onChange={(e) => setBank({ ...bank, instructions: e.target.value })} /></div>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save bank details"}</Button>
    </form>
  );
}
