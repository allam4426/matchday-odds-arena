import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { Copy, FileUp, Landmark } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseRpcError } from "@/lib/betting";
import { formatMoney, maskAccount, parseMoneyToMinor } from "@/lib/money";
import { useSettings } from "@/lib/settings";
import { DEPOSIT_STATUS_LABEL, LEDGER_TYPE_LABEL, WITHDRAWAL_STATUS_LABEL, useWalletSummary } from "@/lib/wallet";
import { cn } from "@/lib/utils";

type Tab = "overview" | "deposit" | "withdraw" | "history";

export const Route = createFileRoute("/_authenticated/wallet")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab: ["overview", "deposit", "withdraw", "history"].includes(s.tab as string) ? (s.tab as Tab) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Wallet — Deposits, Withdrawals & Transactions | Pitchside" },
      { name: "description", content: "Your balance, bank-transfer deposits, withdrawals and transaction history." },
      { property: "og:title", content: "Wallet | Pitchside" },
      { property: "og:description", content: "Balance, deposits, withdrawals and transactions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const { tab = "overview" } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="font-display text-3xl font-black uppercase">Wallet</h1>
      <Tabs value={tab} onValueChange={(v) => navigate({ to: "/wallet", search: { tab: v as Tab }, replace: true })}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="deposit">Deposit</TabsTrigger>
          <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <Overview />
        </TabsContent>
        <TabsContent value="deposit" className="mt-4">
          <Deposit />
        </TabsContent>
        <TabsContent value="withdraw" className="mt-4">
          <Withdraw />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <History />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, accent, hint }: { label: string; value: string; accent?: boolean; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-xl font-bold tabular", accent && "text-primary")}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Overview() {
  const { data: w } = useWalletSummary();
  const { currency } = useSettings();
  const m = (v?: number) => formatMoney(v ?? 0, currency);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="col-span-2 rounded-lg border border-primary/40 bg-card p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Available balance</p>
        <p className="mt-1 font-mono text-4xl font-bold text-primary tabular">{m(w?.available_minor)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Calculated from verified ledger movements only.</p>
      </div>
      <Stat label="Reserved" value={m(w?.reserved_minor)} hint="Held for pending withdrawals" />
      <Stat label="Open stakes" value={m(w?.open_stakes_minor)} hint="On unsettled bets" />
      <Stat label="Pending deposits" value={m(w?.pending_deposits_minor)} hint="Awaiting verification" />
      <Stat label="Pending withdrawals" value={m(w?.pending_withdrawals_minor)} />
      <Stat label="Total deposited" value={m(w?.total_deposits_minor)} />
      <Stat label="Total withdrawn" value={m(w?.total_withdrawals_minor)} />
      <Stat label="Net winnings" value={m(w?.net_winnings_minor)} hint="Returns minus stakes on won bets" />
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-mono text-sm font-semibold">
        {value}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
          }}
          aria-label={`Copy ${label}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

function Deposit() {
  const { user } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const banks = visibleBanks(settings);
  const [bankId, setBankId] = useState<string | null>(null);
  const bank = banks.find((b) => b.id === bankId) ?? null;
  const configured = !!bank;

  const { data: deposits } = useQuery({
    queryKey: ["wallet", "deposits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const minor = parseMoneyToMinor(amount);
    if (!minor) return toast.error("Enter a valid amount.");
    if (minor < settings.min_deposit_minor || minor > settings.max_deposit_minor)
      return toast.error(
        `Deposits must be between ${formatMoney(settings.min_deposit_minor, settings.currency)} and ${formatMoney(settings.max_deposit_minor, settings.currency)}.`,
      );
    if (!ref.trim()) return toast.error("Enter the bank transfer reference.");
    if (!file) return toast.error("Upload your payment slip.");
    if (file.size > 10 * 1024 * 1024) return toast.error("The slip must be under 10 MB.");
    if (!/^(image\/(png|jpe?g|webp|heic)|application\/pdf)$/.test(file.type)) return toast.error("Upload an image or PDF.");

    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const path = `${user!.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("payment-slips").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { error } = await supabase.rpc("submit_deposit", {
        _amount_minor: minor,
        _bank_reference: ref.trim(),
        _slip_path: path,
        _note: `Paid to: ${bank!.bank_name} ${bank!.account_number}${note ? ` — ${note}` : ""}`,
      });
      if (error) throw error;
      toast.success("Deposit submitted", { description: "We'll credit your wallet once the transfer is verified." });
      setAmount("");
      setRef("");
      setNote("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    } catch (err) {
      toast.error("Deposit not submitted", { description: parseRpcError(err).message });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    const { error } = await supabase.rpc("cancel_deposit", { _id: id });
    if (error) return toast.error(parseRpcError(error).message);
    queryClient.invalidateQueries({ queryKey: ["wallet"] });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Bank transfer</h2>
        {banks.length === 0 ? (
          <p className="mt-2 text-xs font-semibold text-warning">Deposits are unavailable until the operator adds bank details.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {banks.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBankId(b.id)}
                className={cn(
                  "flex h-20 items-center justify-center rounded-lg border-2 bg-surface px-3 text-center font-display text-sm font-black uppercase leading-tight transition",
                  bankId === b.id ? "border-primary text-primary" : "border-transparent hover:border-border",
                )}
              >
                <Landmark className="mr-2 h-5 w-5 shrink-0" />
                {b.bank_name}
              </button>
            ))}
          </div>
        )}
      </section>
      {bank && (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Landmark className="h-4 w-4 text-primary" /> 1. Transfer to this account
          </h2>
          <div className="mt-2 divide-y divide-border">
            <CopyRow label="Bank" value={bank.bank_name} />
            <CopyRow label="Account name" value={bank.account_name} />
            <CopyRow label="Account number" value={bank.account_number} />
          </div>
          {bank.instructions && <p className="mt-3 rounded-md bg-surface p-2 text-xs text-muted-foreground">{bank.instructions}</p>}
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileUp className="h-4 w-4 text-primary" /> 2. Submit your payment slip
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="dep-amount">Amount ({settings.currency})</Label>
            <Input id="dep-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
            <p className="text-[11px] text-muted-foreground">
              Min {formatMoney(settings.min_deposit_minor, settings.currency)} · Max{" "}
              {formatMoney(settings.max_deposit_minor, settings.currency)}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-ref">Bank transfer reference</Label>
            <Input id="dep-ref" value={ref} maxLength={100} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-slip">Payment slip (image or PDF, max 10 MB)</Label>
            <Input id="dep-slip" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-note">Note (optional)</Label>
            <Textarea id="dep-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" className="w-full font-bold uppercase" disabled={busy || !configured}>
            {busy ? "Submitting…" : "Submit deposit request"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Your wallet is credited only after finance verifies the transfer against bank records.
          </p>
        </form>
      </div>
      )}

      <section className="rounded-lg border border-border bg-card">
        <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">Deposit requests</h2>
        {(deposits ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No deposits yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {deposits!.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-mono font-semibold">{formatMoney(d.amount_minor, settings.currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.reference} · Bank ref {d.bank_reference} · {format(new Date(d.created_at), "d MMM, HH:mm")}
                  </p>
                  {d.status === "rejected" && d.review_note && <p className="text-xs text-destructive">Reason: {d.review_note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={d.status} label={DEPOSIT_STATUS_LABEL[d.status]} />
                  {d.status === "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => cancel(d.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Withdraw() {
  const { user } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const { data: w } = useWalletSummary();
  const [f, setF] = useState({ amount: "", bank_name: "", account_name: "", account_number: "" });
  const [busy, setBusy] = useState(false);

  const { data: list } = useQuery({
    queryKey: ["wallet", "withdrawals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const minor = parseMoneyToMinor(f.amount);
    if (!minor) return toast.error("Enter a valid amount.");
    if (minor > (w?.available_minor ?? 0)) return toast.error("Amount exceeds your available balance.");
    setBusy(true);
    const { error } = await supabase.rpc("request_withdrawal", {
      _amount_minor: minor,
      _bank_name: f.bank_name,
      _account_name: f.account_name,
      _account_number: f.account_number,
    });
    setBusy(false);
    if (error) return toast.error("Withdrawal not requested", { description: parseRpcError(error).message });
    toast.success("Withdrawal requested", { description: "The amount is reserved while we review your request." });
    setF({ ...f, amount: "" });
    queryClient.invalidateQueries({ queryKey: ["wallet"] });
  }

  async function cancel(id: string) {
    const { error } = await supabase.rpc("cancel_withdrawal", { _id: id });
    if (error) return toast.error(parseRpcError(error).message);
    toast.success("Withdrawal cancelled and funds released");
    queryClient.invalidateQueries({ queryKey: ["wallet"] });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <div className="md:col-span-2 flex items-baseline justify-between">
          <h2 className="font-semibold">Request a bank withdrawal</h2>
          <p className="text-xs text-muted-foreground">
            Available <span className="font-mono font-bold text-primary">{formatMoney(w?.available_minor ?? 0, settings.currency)}</span>
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wd-amount">Amount ({settings.currency})</Label>
          <Input id="wd-amount" inputMode="decimal" className="font-mono" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <p className="text-[11px] text-muted-foreground">
            Min {formatMoney(settings.min_withdrawal_minor, settings.currency)} · Max{" "}
            {formatMoney(settings.max_withdrawal_minor, settings.currency)}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wd-bank">Bank name</Label>
          <Input id="wd-bank" value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wd-name">Account holder name</Label>
          <Input id="wd-name" value={f.account_name} onChange={(e) => setF({ ...f, account_name: e.target.value })} />
          <p className="text-[11px] text-muted-foreground">Must match the name on your account.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wd-num">Account number</Label>
          <Input id="wd-num" inputMode="numeric" value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" className="w-full font-bold uppercase md:w-auto" disabled={busy}>
            {busy ? "Requesting…" : "Request withdrawal"}
          </Button>
        </div>
      </form>

      <section className="rounded-lg border border-border bg-card">
        <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">Withdrawal requests</h2>
        {(list ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No withdrawals yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list!.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-mono font-semibold">{formatMoney(r.amount_minor, settings.currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.reference} · {r.bank_name} {maskAccount(r.account_number)} · {format(new Date(r.created_at), "d MMM, HH:mm")}
                  </p>
                  {r.payment_reference && <p className="text-xs text-success">Payment ref {r.payment_reference}</p>}
                  {(r.status === "rejected" || r.status === "failed") && r.review_note && (
                    <p className="text-xs text-destructive">Reason: {r.review_note}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} label={WITHDRAWAL_STATUS_LABEL[r.status]} />
                  {(r.status === "requested" || r.status === "pending_review") && (
                    <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function History() {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { data } = useQuery({
    queryKey: ["wallet", "ledger", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("ledger_entries").select("*").order("id", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <section className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-surface text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Details</th>
            <th className="px-4 py-2 text-right">Amount</th>
            <th className="px-4 py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {(data ?? []).length === 0 && (
            <tr>
              <td colSpan={5} className="p-4 text-center text-muted-foreground">
                No transactions yet.
              </td>
            </tr>
          )}
          {(data ?? []).map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{format(new Date(e.created_at), "d MMM yy, HH:mm")}</td>
              <td className="px-4 py-2 font-medium">{LEDGER_TYPE_LABEL[e.entry_type] ?? e.entry_type}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {e.description}
                <span className="block font-mono text-[10px]">{e.reference}</span>
              </td>
              <td className={cn("px-4 py-2 text-right font-mono font-semibold", e.amount_minor > 0 ? "text-success" : e.amount_minor < 0 ? "text-foreground" : "text-muted-foreground")}>
                {e.amount_minor > 0 ? "+" : ""}
                {formatMoney(e.amount_minor, currency)}
              </td>
              <td className="px-4 py-2 text-right font-mono">{formatMoney(e.balance_after_minor, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
