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
import { combinedOdds } from "@/lib/betting";
import { formatMoney, minorToInput, parseMoneyToMinor } from "@/lib/money";
import { Money } from "@/components/Money";
import { BANK_PRESETS, type AppSettings, type BankAccount, useSettings } from "@/lib/settings";

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
      <BettingLimits settings={settings} />
      <div className="flex items-center justify-between gap-2 pt-4">
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

/** House-risk controls: minimum/maximum stake, maximum ticket payout and smooth combo-odds reduction. */
function BettingLimits({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient();
  const [minStake, setMinStake] = useState("");
  const [maxStake, setMaxStake] = useState("");
  const [maxPayout, setMaxPayout] = useState("");
  const [reduceFrom, setReduceFrom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMinStake(minorToInput(settings.min_stake_minor));
    setMaxStake(minorToInput(settings.max_stake_minor));
    setMaxPayout(minorToInput(settings.max_payout_minor));
    setReduceFrom(String(settings.combo_reduce_from ?? 10));
  }, [settings.min_stake_minor, settings.max_stake_minor, settings.max_payout_minor, settings.combo_reduce_from]);

  const reduce = Number(reduceFrom);
  const example = [2.17, 2.15, 2.19, 4.19, 4.42];

  async function save() {
    const min = parseMoneyToMinor(minStake);
    const max = parseMoneyToMinor(maxStake);
    const payout = parseMoneyToMinor(maxPayout);
    if (min == null || max == null || payout == null || min <= 0 || max < min || payout <= 0)
      return toast.error("Check the amounts: minimum must be above 0 and not more than the maximum.");
    if (!(reduce >= 2 && reduce <= 1000)) return toast.error("Combo reduction must start between 2 and 1000.");
    setBusy(true);
    const updates: [string, number][] = [
      ["min_stake_minor", min],
      ["max_stake_minor", max],
      ["max_payout_minor", payout],
      ["combo_reduce_from", Math.round(reduce * 100) / 100],
    ];
    for (const [key, value] of updates) {
      const { error } = await supabase.rpc("admin_update_setting", { _key: key, _value: value });
      if (error) {
        setBusy(false);
        return toast.error(parseRpcError(error).message);
      }
    }
    setBusy(false);
    toast.success("Betting limits saved");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h1 className="font-semibold">Betting &amp; house limits</h1>
        <p className="text-xs text-muted-foreground">Applied by the server to every bet. Amounts in {settings.currency}.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5"><Label>Minimum stake</Label>
          <Input inputMode="decimal" value={minStake} onChange={(e) => setMinStake(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Maximum stake</Label>
          <Input inputMode="decimal" value={maxStake} onChange={(e) => setMaxStake(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Maximum payout per ticket</Label>
          <Input inputMode="decimal" value={maxPayout} onChange={(e) => setMaxPayout(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Reduce combo odds above</Label>
        <Input inputMode="decimal" className="sm:w-40" value={reduceFrom} onChange={(e) => setReduceFrom(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Combos up to this value pay full odds; above it the odds keep growing but much more slowly. Lower = safer for the house.
          {reduce >= 2 && (
            <> Example 5-fold ({example.join(" × ")}): full {combinedOdds(example, 1).toFixed(2)} → paid{" "}
              <span className="font-semibold text-foreground">{combinedOdds(example, reduce).toFixed(2)}</span>
              {(() => { const p = parseMoneyToMinor(maxPayout); return p ? <> (500 stake returns up to <Money minor={Math.min(Math.floor(50000 * combinedOdds(example, reduce)), p)} currency={settings.currency} />)</> : null; })()}.
            </>
          )}
        </p>
      </div>
      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save betting limits"}</Button>
    </div>
  );
}
