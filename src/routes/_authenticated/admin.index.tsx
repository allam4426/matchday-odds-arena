import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/money";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
});

type Stats = Record<string, number>;

function Card({ label, value, sub, to, alert }: { label: string; value: string | number; sub?: string; to?: string; alert?: boolean }) {
  const inner = (
    <div className={cn("h-full rounded-lg border bg-card p-4", alert ? "border-warning/60" : "border-border")}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  return to ? (
    <Link to={to} className="block hover:opacity-90">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function AdminOverview() {
  const settings = useSettings();
  const m = (v?: number) => formatMoney(v ?? 0, settings.currency);
  const { data: s } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
    refetchInterval: 30_000,
  });
  const { data: audit } = useQuery({
    queryKey: ["admin", "audit", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_audit_logs").select("*").order("id", { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ggr = (s?.settled_stakes_minor ?? 0) - (s?.settled_returns_minor ?? 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-black uppercase">Overview</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4",
            s?.ledger_mismatches ? "border-destructive/60 bg-destructive/10" : "border-success/40 bg-success/5",
          )}
        >
          {s?.ledger_mismatches ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-success" />
          )}
          <div className="text-sm">
            <p className="font-semibold">Ledger reconciliation</p>
            <p className="text-muted-foreground">
              {s?.ledger_mismatches
                ? `${s.ledger_mismatches} wallet(s) do not match their ledger. Investigate immediately.`
                : "All wallet balances match the sum of their ledger entries."}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <div className="text-sm">
            <p className="font-semibold">Sports-data & odds feed</p>
            <p className="text-muted-foreground">
              Status: {settings.sports_data_provider.status.replace(/_/g, " ")}. Fixtures and odds are managed manually
              by traders until a licensed provider is connected.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Pending deposits" value={s?.pending_deposits ?? "–"} sub={m(s?.pending_deposits_minor)} to="/admin/deposits" alert={!!s?.pending_deposits} />
        <Card label="Flagged duplicates" value={s?.flagged_deposits ?? "–"} to="/admin/deposits" alert={!!s?.flagged_deposits} />
        <Card label="Pending withdrawals" value={s?.pending_withdrawals ?? "–"} sub={m(s?.pending_withdrawals_minor)} to="/admin/withdrawals" alert={!!s?.pending_withdrawals} />
        <Card label="Live matches" value={s?.live_matches ?? "–"} sub={`${s?.upcoming_matches ?? 0} upcoming`} to="/admin/matches" />
        <Card label="Suspended markets" value={s?.suspended_markets ?? "–"} sub="On open events" to="/admin/matches" />
        <Card label="Open bets" value={s?.open_bets ?? "–"} sub={`Stakes ${m(s?.open_stakes_minor)}`} to="/admin/bets" />
        <Card label="Settled bets" value={s?.settled_bets ?? "–"} sub={`Stakes ${m(s?.settled_stakes_minor)}`} />
        <Card label="Settled returns" value={m(s?.settled_returns_minor)} sub={`Gross gaming revenue ${m(ggr)}`} />
        <Card label="Registered users" value={s?.users ?? "–"} sub={`${s?.active_users ?? 0} active · ${s?.restricted_users ?? 0} restricted`} to="/admin/users" />
        <Card label="Approved deposits" value={m(s?.approved_deposits_minor)} sub="Gross, all time" />
        <Card label="Paid withdrawals" value={m(s?.paid_withdrawals_minor)} sub="Gross, all time" />
        <Card label="Customer liability" value={m(s?.wallet_liability_minor)} sub="Balances + reserved funds" />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-semibold">Recent admin activity</h2>
          <Link to="/admin/audit" className="text-xs text-primary">
            View all
          </Link>
        </header>
        <ul className="divide-y divide-border text-sm">
          {(audit ?? []).length === 0 && <li className="p-4 text-muted-foreground">No activity yet.</li>}
          {(audit ?? []).map((a) => (
            <li key={a.id} className="flex justify-between gap-2 px-4 py-2">
              <span>
                <span className="font-semibold">{a.action.replace(/_/g, " ")}</span>{" "}
                <span className="text-muted-foreground">
                  {a.entity_type} {a.entity_id?.slice(0, 8)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{format(new Date(a.created_at), "d MMM HH:mm")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
