import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { ProvenanceBadge } from "@/components/sports/MatchCard";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseRpcError } from "@/lib/betting";
import { useCompetitions } from "@/lib/sportsbook";

export const Route = createFileRoute("/_authenticated/admin/matches/")({
  component: AdminMatches,
});

const STATUSES = ["all", "scheduled", "live", "finished", "postponed", "cancelled", "abandoned"] as const;

function AdminMatches() {
  const { can } = useAuth();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "matches", status],
    queryFn: async () => {
      let query = supabase
        .from("matches")
        .select("id, home_team, away_team, kickoff_at, status, minute, home_score, away_score, is_hidden, provenance, updated_at, competition:competitions(name), markets(status)")
        .order("kickoff_at", { ascending: status !== "finished" })
        .limit(300);
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const list = (data ?? []).filter(
    (m) => !q || `${m.home_team} ${m.away_team} ${m.competition?.name}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-black uppercase">Matches & odds</h1>
        {can("trade") && <CreateMatchDialog />}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search team or competition" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-44" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Kick-off</th>
              <th className="px-3 py-2">Match</th>
              <th className="px-3 py-2">Competition</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Markets</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-4 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {list.map((m) => {
              const open = m.markets.filter((x) => x.status === "open").length;
              return (
                <tr key={m.id} className="hover:bg-surface/60">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{format(new Date(m.kickoff_at), "d MMM HH:mm")}</td>
                  <td className="px-3 py-2">
                    <Link to="/admin/matches/$id" params={{ id: m.id }} className="font-semibold hover:text-primary">
                      {m.home_team} v {m.away_team}
                    </Link>
                    {m.is_hidden && <span className="ml-2 text-[10px] uppercase text-warning">Hidden</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{m.competition?.name}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={m.status} />
                    {m.status === "live" && m.minute != null && <span className="ml-1 text-xs">{m.minute}'</span>}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {m.home_score}–{m.away_score}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {open}/{m.markets.length} open
                  </td>
                  <td className="px-3 py-2">
                    <ProvenanceBadge provenance={m.provenance as "manual"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateMatchDialog() {
  const { data: comps } = useCompetitions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ comp: "", home: "", away: "", kickoff: "", h: "", d: "", a: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.comp || !f.kickoff) return toast.error("Choose a competition and kick-off time.");
    const { data, error } = await supabase.rpc("admin_create_match", {
      _competition: f.comp,
      _home: f.home,
      _away: f.away,
      _kickoff: new Date(f.kickoff).toISOString(),
      _h: Number(f.h),
      _d: Number(f.d),
      _a: Number(f.a),
    });
    if (error) return toast.error(parseRpcError(error).message);
    toast.success("Match created", { description: "Secondary markets start suspended — review their odds before opening." });
    queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
    queryClient.invalidateQueries({ queryKey: ["matches"] });
    setOpen(false);
    navigate({ to: "/admin/matches/$id", params: { id: data as string } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" /> New match
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create match (manual entry)</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Manually entered events are labelled “Manual” to customers. Use verified fixture information only.
          </p>
          <div className="space-y-1.5">
            <Label>Competition</Label>
            <Select value={f.comp} onValueChange={(v) => setF({ ...f, comp: v })}>
              <SelectTrigger aria-label="Competition">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {(comps ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.sport})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cm-home">Home team</Label>
              <Input id="cm-home" required value={f.home} onChange={set("home")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm-away">Away team</Label>
              <Input id="cm-away" required value={f.away} onChange={set("away")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-ko">Kick-off (your local time)</Label>
            <Input id="cm-ko" type="datetime-local" required value={f.kickoff} onChange={set("kickoff")} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["h", "d", "a"] as const).map((k) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`cm-${k}`}>{k === "h" ? "Home (1)" : k === "d" ? "Draw (X)" : "Away (2)"}</Label>
                <Input id={`cm-${k}`} inputMode="decimal" required className="font-mono" value={f[k]} onChange={set(k)} placeholder="2.10" />
              </div>
            ))}
          </div>
          <Button type="submit" className="w-full">
            Create match
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
