import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseRpcError } from "@/lib/betting";
import { BANK_PRESETS, type BankAccount, useSettings } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettings,
});

const blank = (bank_name = ""): BankAccount => ({
  id: crypto.randomUUID(),
  bank_name,
  account_name: "",
  account_number: "",
  instructions: "",
  visible: true,
});

function AdminSettings() {
  const { can } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.bank_accounts?.length) setBanks(settings.bank_accounts);
    else {
      const legacy = settings.bank_details;
      const seeded = BANK_PRESETS.map((n) => blank(n));
      if (legacy.account_number && legacy.account_number !== "Not configured") seeded.unshift({ ...blank(), ...legacy });
      setBanks(seeded);
    }
  }, [settings.bank_accounts, settings.bank_details]);

  if (!can("settings") && !can("finance")) return <p className="text-sm text-muted-foreground">You don't have permission to change settings.</p>;

  const update = (id: string, patch: Partial<BankAccount>) => setBanks((l) => l.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  async function save() {
    const bad = banks.find((b) => b.visible && (!b.bank_name.trim() || !b.account_name.trim() || !b.account_number.trim()));
    if (bad) return toast.error(`Fill in bank, account name and number for "${bad.bank_name || "new bank"}", or hide it.`);
    setBusy(true);
    const { error } = await supabase.rpc("admin_update_setting", { _key: "bank_accounts", _value: banks });
    setBusy(false);
    if (error) return toast.error(parseRpcError(error).message);
    toast.success("Bank accounts saved");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-semibold">Deposit bank accounts</h1>
          <p className="text-xs text-muted-foreground">Customers choose one of the visible banks, transfer, and upload their slip.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setBanks((l) => [...l, blank()])}>
          <Plus className="mr-1 h-4 w-4" /> Add bank
        </Button>
      </div>

      {banks.map((b) => (
        <div key={b.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold">
              {b.visible ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
              {b.visible ? "Visible to customers" : "Hidden"}
            </span>
            <div className="flex items-center gap-2">
              <Switch checked={b.visible} onCheckedChange={(v) => update(b.id, { visible: v })} aria-label="Visible to customers" />
              <Button variant="ghost" size="icon" aria-label="Delete bank" onClick={() => setBanks((l) => l.filter((x) => x.id !== b.id))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Bank name</Label>
              <Input value={b.bank_name} onChange={(e) => update(b.id, { bank_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Account name</Label>
              <Input value={b.account_name} onChange={(e) => update(b.id, { account_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Account number</Label>
              <Input value={b.account_number} onChange={(e) => update(b.id, { account_number: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Instructions</Label>
            <Textarea rows={2} value={b.instructions} onChange={(e) => update(b.id, { instructions: e.target.value })} /></div>
        </div>
      ))}

      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save bank accounts"}</Button>
    </div>
  );
}
