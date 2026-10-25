import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseRpcError } from "@/lib/betting";
import { matchQuery, type Market, type MatchStatus } from "@/lib/sportsbook";

export const Route = createFileRoute("/_authenticated/admin/matches/$id")({
  component: AdminMatch,
});

const STATUSES: MatchStatus[] = ["scheduled", "live", "finished", "postponed", "cancelled", "abandoned"];

function AdminMatch() {
  const { id } = Route.useParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { data: m } = useQuery(matchQuery(id));
  const [f, setF] = useState({ status: "scheduled" as MatchStatus, minute: "", hs: "0", as: "0", hth: "", hta: "", hidden: false });

  useEffect(() => {
    if (!m) return;
    setF({
      status: m.status, minute: m.minute?.toString() ?? "", hs: String(m.home_score), as: String(m.away_score),
      hth: m.ht_home_score?.toString() ?? "", hta: m.ht_away_score?.toString() ?? "", hidden: m.is_hidden,
    });
  }, [m]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["match", id] });
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  };
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  async function saveMatch() {
    const { error } = await supabase.rpc("admin_update_match", {
      _id: id, _status: f.status, _minute: num(f.minute) as number, _home_score: Number(f.hs), _away_score: Number(f.as),
      _ht_home: num(f.hth) as number, _ht_away: num(f.hta) as number, _hidden: f.hidden,
    });
    if (error) return toast.error(parseRpcError(error).message);
    toast.success("Match updated");
    refresh();
  }

  if (!m) return <p className="text-muted-foreground">Loading…</p>;
  const trader = can("trade");

  return (
    <div className="space-y-4">
      <Link to="/admin/matches" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" /> Matches</Link>
      <h1 className="font-display text-3xl font-black uppercase">{m.home_team} v {m.away_team}</h1>
      <p className="text-xs text-muted-foreground">{m.competition.name} · Source: {m.provenance}</p>

      <section className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as MatchStatus })} disabled={!trader}>
            <SelectTrigger aria-label="Match status"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="mm">Minute</Label><Input id="mm" value={f.minute} onChange={(e) => setF({ ...f, minute: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Score (H–A)</Label><div className="flex gap-1"><Input value={f.hs} onChange={(e) => setF({ ...f, hs: e.target.value })} aria-label="Home score" /><Input value={f.as} onChange={(e) => setF({ ...f, as: e.target.value })} aria-label="Away score" /></div></div>
        <div className="space-y-1.5"><Label>Half-time (H–A)</Label><div className="flex gap-1"><Input value={f.hth} onChange={(e) => setF({ ...f, hth: e.target.value })} aria-label="HT home" /><Input value={f.hta} onChange={(e) => setF({ ...f, hta: e.target.value })} aria-label="HT away" /></div></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={f.hidden} onCheckedChange={(v) => setF({ ...f, hidden: v })} /> Hidden from customers</label>
        <div className="sm:col-span-3 flex justify-end"><Button onClick={saveMatch} disabled={!trader}>Save match</Button></div>
        <p className="sm:col-span-4 text-xs text-muted-foreground">Finishing, postponing or cancelling a match suspends its open markets automatically.</p>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {m.markets.map((mk) => <MarketEditor key={mk.id} market={mk} trader={trader} onChange={refresh} />)}
      </div>
    </div>
  );
}

function MarketEditor({ market, trader, onChange }: { market: Market; trader: boolean; onChange: () => void }) {
  const [odds, setOdds] = useState<Record<string, string>>({});
  const [winner, setWinner] = useState("");
  useEffect(() => setOdds(Object.fromEntries(market.selections.map((s) => [s.id, s.odds.toFixed(2)]))), [market]);
  const settled = market.status === "settled" || market.status === "void";

  async function run(p: PromiseLike<{ error: unknown }>, ok: string) {
    const { error } = await p;
    if (error) return toast.error(parseRpcError(error).message);
    toast.success(ok);
    onChange();
  }

  async function saveOdds() {
    for (const s of market.selections) {
      const v = Number(odds[s.id]);
      if (v !== s.odds) {
        const { error } = await supabase.rpc("admin_set_odds", { _selection: s.id, _odds: v });
        if (error) return toast.error(parseRpcError(error).message);
      }
    }
    toast.success("Odds saved");
    onChange();
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{market.name}</h2>
        <StatusBadge status={market.status} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {market.selections.map((s) => (
          <div key={s.id} className="space-y-1">
            <Label className="text-xs">{s.label} {s.result !== "pending" && <StatusBadge status={s.result} />}</Label>
            <Input className="font-mono" value={odds[s.id] ?? ""} disabled={!trader || settled} onChange={(e) => setOdds({ ...odds, [s.id]: e.target.value })} />
          </div>
        ))}
      </div>
      {trader && !settled && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={saveOdds}>Save odds</Button>
          <Button size="sm" variant="secondary" onClick={() => run(supabase.rpc("admin_set_market_status", { _market: market.id, _status: market.status === "open" ? "suspended" : "open" }), "Market updated")}>
            {market.status === "open" ? "Suspend" : "Open market"}
          </Button>
        </div>
      )}
      {trader && !settled && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Select value={winner} onValueChange={setWinner}>
            <SelectTrigger className="w-40" aria-label="Winning selection"><SelectValue placeholder="Winner" /></SelectTrigger>
            <SelectContent>{market.selections.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" disabled={!winner} onClick={() => run(supabase.rpc("admin_settle_market", { _market: market.id, _winners: [winner], _void: false }), "Market settled")}>Settle</Button>
          <Button size="sm" variant="outline" onClick={() => run(supabase.rpc("admin_settle_market", { _market: market.id, _winners: [], _void: true }), "Market voided")}>Void</Button>
        </div>
      )}
    </section>
  );
}
