import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";

import { OddsButton } from "@/components/sports/OddsButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Match } from "@/lib/sportsbook";
import { cn } from "@/lib/utils";

export function TeamCrest({ src, name, size = 20 }: { src?: string | null; name: string; size?: number }) {
  if (src) return <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0 object-contain" style={{ width: size, height: size }} />;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-odds font-bold text-muted-foreground" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {name.slice(0, 1)}
    </span>
  );
}

export function kickoffLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return { day: "Today", time: format(d, "HH:mm") };
  if (isTomorrow(d)) return { day: "Tomorrow", time: format(d, "HH:mm") };
  return { day: format(d, "EEE d MMM"), time: format(d, "HH:mm") };
}

export function LiveBadge({ minute }: { minute: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-live/15 px-1.5 py-0.5 text-[11px] font-bold uppercase text-live">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
      {minute != null ? `${minute}'` : "Live"}
    </span>
  );
}

export function ProvenanceBadge({ provenance }: { provenance: Match["provenance"] }) {
  if (provenance === "provider") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="rounded border border-border px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {provenance === "sample" ? "Sample" : "Manual"}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {provenance === "sample"
          ? "Demonstration fixture — not a real match. Replace with provider data before launch."
          : "Entered manually by a trader (no live data feed)."}
      </TooltipContent>
    </Tooltip>
  );
}

export function MatchCard({ match, marketKey }: { match: Match; marketKey: string }) {
  const live = match.status === "live";
  const ko = kickoffLabel(match.kickoff_at);
  const primary = match.markets.find((m) => m.key === marketKey) ?? match.markets[0];
  const others = match.markets.filter((m) => m.id !== primary?.id);

  return (
    <div className="border-b border-border px-3 py-3 last:border-b-0 hover:bg-surface/60 sm:px-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Link
          to="/match/$id"
          params={{ id: match.id }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <div className="w-16 shrink-0 text-xs">
            {live ? (
              <LiveBadge minute={match.minute} />
            ) : (
              <>
                <div className="font-semibold text-foreground">{ko.time}</div>
                <div className="text-muted-foreground">{ko.day}</div>
              </>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2"><TeamCrest src={match.home_crest} name={match.home_team} /><span className="truncate text-sm font-semibold">{match.home_team}</span></span>
              {live && <span className="font-mono text-sm font-bold text-primary tabular">{match.home_score}</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2"><TeamCrest src={match.away_crest} name={match.away_team} /><span className="truncate text-sm font-semibold">{match.away_team}</span></span>
              {live && <span className="font-mono text-sm font-bold text-primary tabular">{match.away_score}</span>}
            </div>
          </div>
        </Link>

        {/* Desktop: the selected market tab */}
        <div className="hidden items-center gap-1.5 md:flex md:w-[300px]">
          {primary ? (
            primary.selections.map((s) => (
              <OddsButton key={s.id} match={match} market={primary} selection={s} />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No markets</span>
          )}
        </div>

        {/* Mobile: horizontally scrollable markets */}
        <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 scrollbar-none md:hidden">
          {[primary, ...others].filter(Boolean).map((mk) => (
            <div key={mk!.id} className="w-[85%] shrink-0 snap-start">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{mk!.name}</p>
              <div className="flex gap-1.5">
                {mk!.selections.map((s) => (
                  <OddsButton key={s.id} match={match} market={mk!} selection={s} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <Link
          to="/match/$id"
          params={{ id: match.id }}
          className={cn(
            "hidden h-11 w-14 shrink-0 items-center justify-center gap-0.5 rounded-md text-xs font-semibold text-muted-foreground hover:bg-odds hover:text-foreground md:flex",
          )}
          aria-label={`All markets for ${match.home_team} v ${match.away_team}`}
        >
          +{others.length}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-1 flex items-center gap-2 pl-[76px] md:hidden">
        <ProvenanceBadge provenance={match.provenance} />
        <Link to="/match/$id" params={{ id: match.id }} className="text-[11px] font-semibold text-primary">
          All markets
        </Link>
      </div>
    </div>
  );
}
