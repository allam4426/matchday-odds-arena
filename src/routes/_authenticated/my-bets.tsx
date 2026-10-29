import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";

import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatOdds } from "@/lib/betting";
import { formatMoney } from "@/lib/money";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/my-bets")({
  head: () => ({
    meta: [
      { title: "My Bets | Pitchside" },
      { name: "description", content: "Your open and settled bets, stakes, odds and returns." },
      { property: "og:title", content: "My Bets | Pitchside" },
      { property: "og:description", content: "Your open and settled bets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyBets,
});

function MyBets() {
  const { user } = useAuth();
  const { currency } = useSettings();
  const [tab, setTab] = useState<"open" | "settled">("open");

  const { data, isLoading } = useQuery({
    queryKey: ["bets", user?.id, tab],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("bets")
        .select("*, bet_selections(id, match_label, market_name, selection_label, odds_accepted, result, matches(status, home_score, away_score))")
        .order("placed_at", { ascending: false })
        .limit(100);
      q = tab === "open" ? q.eq("status", "open") : q.neq("status", "open");
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-3xl font-black uppercase">My Bets</h1>
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {(["open", "settled"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-semibold uppercase",
              tab === t ? "bg-secondary text-foreground" : "text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No {tab} bets.
        </div>
      ) : (
        (data ?? []).map((b) => {
          const net = b.payout_minor - b.stake_minor;
          return (
            <article key={b.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
                <div className="text-sm font-semibold">
                  {b.bet_type === "combo" ? `${b.bet_selections.length}-fold combo` : "Single"}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{b.reference}</span>
                </div>
                <StatusBadge status={b.status} />
              </header>
              <ul className="divide-y divide-border">
                {b.bet_selections.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{s.selection_label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.market_name} · {s.match_label}
                        {s.matches && s.matches.status !== "scheduled" && (
                          <span className="ml-1 font-mono font-semibold text-foreground">
                            ({s.matches.home_score}-{s.matches.away_score})
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <LegBadge result={s.result} />
                      <span className="font-mono text-sm font-bold">{formatOdds(s.odds_accepted)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <footer className="grid grid-cols-3 gap-2 border-t border-border px-4 py-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Stake</p>
                  <p className="font-mono text-sm font-semibold">{formatMoney(b.stake_minor, currency)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Odds</p>
                  <p className="font-mono text-sm font-semibold">{formatOdds(b.total_odds)}</p>
                </div>
                <div className="text-right">
                  {b.status === "open" ? (
                    <>
                      <p className="text-muted-foreground">Potential returns</p>
                      <p className="font-mono text-sm font-bold text-primary">
                        {formatMoney(b.potential_return_minor, currency)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground">Returns</p>
                      <p className="font-mono text-sm font-bold">{formatMoney(b.payout_minor, currency)}</p>
                      {b.status === "won" && (
                        <p className="text-[11px] text-success">Net winnings {formatMoney(net, currency)}</p>
                      )}
                      {b.status === "void" && <p className="text-[11px] text-muted-foreground">Stake returned</p>}
                    </>
                  )}
                </div>
              </footer>
              <p className="border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
                Placed {format(new Date(b.placed_at), "d MMM yyyy, HH:mm")}
                {b.settled_at && ` · Settled ${format(new Date(b.settled_at), "d MMM yyyy, HH:mm")}`}
                {b.void_reason && ` · ${b.void_reason}`}
              </p>
            </article>
          );
        })
      )}
    </div>
  );
}

function LegBadge({ result }: { result: string }) {
  const cls =
    result === "won"
      ? "bg-success/20 text-success"
      : result === "lost"
        ? "bg-destructive/20 text-destructive"
        : result === "void"
          ? "bg-muted text-muted-foreground"
          : "bg-secondary text-muted-foreground";
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", cls)}>{result}</span>;
}
