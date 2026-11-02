import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format, isToday, isTomorrow } from "date-fns";
import { DatabaseZap, RefreshCw } from "lucide-react";

import { MatchCard, ProvenanceBadge } from "@/components/sports/MatchCard";
import { Skeleton } from "@/components/ui/skeleton";
import { MARKET_TABS, matchesQuery, type Match, type MatchFilter } from "@/lib/sportsbook";
import { cn } from "@/lib/utils";

type Day = "today" | "tomorrow" | "all";
const PAGE = 25;

export function MatchList({
  filter,
  competitionId,
  search,
  emptyText,
}: {
  filter: MatchFilter;
  competitionId?: string;
  search?: string;
  emptyText?: string;
}) {
  const [marketKey, setMarketKey] = useState<string>("1x2");
  const [dayChoice, setDayChoice] = useState<Day | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const { data, isLoading, isError, refetch, dataUpdatedAt, isFetching } = useQuery(matchesQuery(filter, competitionId));
  const showDays = filter !== "live" && !search;

  const filtered = useMemo(() => {
    const q = search?.trim().toLowerCase();
    return (data ?? []).filter(
      (m) =>
        !q ||
        m.home_team.toLowerCase().includes(q) ||
        m.away_team.toLowerCase().includes(q) ||
        m.competition.name.toLowerCase().includes(q),
    );
  }, [data, search]);

  const dayCounts = useMemo(() => {
    let today = 0;
    let tomorrow = 0;
    for (const m of filtered) {
      const d = new Date(m.kickoff_at);
      if (m.status === "live" || isToday(d)) today++;
      else if (isTomorrow(d)) tomorrow++;
    }
    return { today, tomorrow, all: filtered.length };
  }, [filtered]);

  // Default to today's matches; fall back to tomorrow, then everything.
  const day: Day = !showDays
    ? "all"
    : dayChoice ?? (dayCounts.today > 0 ? "today" : dayCounts.tomorrow > 0 ? "tomorrow" : "all");

  const { groups, total } = useMemo(() => {
    const list = filtered.filter((m) => {
      if (day === "all") return true;
      const d = new Date(m.kickoff_at);
      return day === "today" ? m.status === "live" || isToday(d) : isTomorrow(d);
    });
    const shown = list.slice(0, limit);
    const map = new Map<string, { comp: Match["competition"]; matches: Match[] }>();
    for (const m of shown) {
      const g = map.get(m.competition.id) ?? { comp: m.competition, matches: [] };
      g.matches.push(m);
      map.set(m.competition.id, g);
    }
    return { groups: [...map.values()].sort((a, b) => a.comp.sort_order - b.comp.sort_order), total: list.length };
  }, [filtered, day, limit]);

  return (
    <div className="space-y-3">
      {showDays && (
        <div className="flex gap-1.5" role="tablist" aria-label="Day">
          {(
            [
              ["today", "Today"],
              ["tomorrow", "Tomorrow"],
              ["all", "All"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={day === k}
              onClick={() => {
                setDayChoice(k);
                setLimit(PAGE);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold transition-colors",
                day === k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span className={cn("text-[11px] font-semibold", day === k ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {dayCounts[k]}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-none" role="tablist" aria-label="Market type">
          {MARKET_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={marketKey === t.key}
              onClick={() => setMarketKey(t.key)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                marketKey === t.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          {dataUpdatedAt ? `Updated ${format(dataUpdatedAt, "HH:mm:ss")}` : "Loading"}
        </button>
      </div>

      {(data ?? []).some((m) => m.provenance !== "provider") && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          <DatabaseZap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            Live sports-data feed not connected. Fixtures and odds shown are operator-managed; items tagged{" "}
            <ProvenanceBadge provenance="sample" /> are demonstration data.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center text-sm">
          Match data is temporarily unavailable.{" "}
          <button className="font-semibold underline" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <p className="font-display text-xl font-bold uppercase">No events</p>
          <p className="mt-1 text-sm text-muted-foreground">{emptyText ?? "There are no events to show right now."}</p>
          {filter === "live" && (
            <Link to="/upcoming" className="mt-3 inline-block text-sm font-semibold text-primary">
              See upcoming matches
            </Link>
          )}
        </div>
      ) : (
        <>
          {groups.map(({ comp, matches }) => (
            <section key={comp.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
                <Link
                  to="/competition/$id"
                  params={{ id: comp.id }}
                  className="flex items-center gap-2 text-sm font-semibold hover:text-primary"
                >
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{comp.country}</span>
                  <span>{comp.name}</span>
                </Link>
                <div className="hidden w-[300px] gap-1.5 pr-14 text-center text-[11px] font-semibold uppercase text-muted-foreground md:flex">
                  {(matches[0].markets.find((m) => m.key === marketKey) ?? matches[0].markets[0])?.selections.map((s) => (
                    <span key={s.id} className="flex-1">
                      {s.label}
                    </span>
                  ))}
                </div>
              </header>
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} marketKey={marketKey} />
              ))}
            </section>
          ))}
          {total > limit && (
            <button
              onClick={() => setLimit((l) => l + PAGE)}
              className="w-full rounded-lg border border-border bg-card py-3 text-sm font-semibold text-primary hover:bg-secondary"
            >
              Show more matches ({total - limit} more)
            </button>
          )}
        </>
      )}
    </div>
  );
}
