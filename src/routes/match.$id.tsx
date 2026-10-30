import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronLeft, Lock } from "lucide-react";

import { kickoffLabel, LiveBadge, ProvenanceBadge, TeamCrest } from "@/components/sports/MatchCard";
import { OddsButton } from "@/components/sports/OddsButton";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { isBettable, matchQuery } from "@/lib/sportsbook";

export const Route = createFileRoute("/match/$id")({
  head: () => ({
    meta: [
      { title: "Match Betting Markets | Pitchside" },
      { name: "description", content: "All betting markets, live score and odds for this match." },
      { property: "og:title", content: "Match Betting Markets | Pitchside" },
      { property: "og:description", content: "All betting markets, live score and odds for this match." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MatchPage,
});

function MatchPage() {
  const { id } = Route.useParams();
  const { data: match, isLoading, dataUpdatedAt } = useQuery(matchQuery(id));

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!match)
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center">
        <p className="font-display text-xl font-bold uppercase">Match not available</p>
        <Link to="/" className="mt-2 inline-block text-sm text-primary">
          Back to sportsbook
        </Link>
      </div>
    );

  const live = match.status === "live";
  const ko = kickoffLabel(match.kickoff_at);
  const lastOddsUpdate = match.markets
    .flatMap((m) => m.selections.map((s) => s.updated_at))
    .sort()
    .at(-1);

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Back
      </Link>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 text-xs">
          <span className="font-semibold">
            <span className="uppercase text-muted-foreground">{match.competition.country}</span> · {match.competition.name}
          </span>
          <div className="flex items-center gap-2">
            <ProvenanceBadge provenance={match.provenance} />
            {live ? <LiveBadge minute={match.minute} /> : <StatusBadge status={match.status} />}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-8">
          <div className="flex flex-col items-end gap-2"><TeamCrest src={match.home_crest} name={match.home_team} size={48} /><p className="text-right font-display text-xl font-bold uppercase sm:text-3xl">{match.home_team}</p></div>
          <div className="text-center">
            {live || match.status === "finished" ? (
              <p className="font-mono text-4xl font-bold text-primary tabular">
                {match.home_score}–{match.away_score}
              </p>
            ) : (
              <>
                <p className="font-mono text-2xl font-bold">{ko.time}</p>
                <p className="text-xs text-muted-foreground">{ko.day}</p>
              </>
            )}
            {match.ht_home_score != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                HT {match.ht_home_score}–{match.ht_away_score}
              </p>
            )}
          </div>
          <div className="flex flex-col items-start gap-2"><TeamCrest src={match.away_crest} name={match.away_team} size={48} /><p className="font-display text-xl font-bold uppercase sm:text-3xl">{match.away_team}</p></div>
        </div>
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Kick-off {format(new Date(match.kickoff_at), "EEE d MMM yyyy, HH:mm")}
          {lastOddsUpdate && ` · Odds last updated ${format(new Date(lastOddsUpdate), "HH:mm:ss")}`}
          {dataUpdatedAt ? ` · Checked ${format(dataUpdatedAt, "HH:mm:ss")}` : ""}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {match.markets.map((mk) => {
          const open = isBettable(match, mk);
          return (
            <section key={mk.id} className="rounded-lg border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border px-4 py-2">
                <h2 className="text-sm font-semibold">{mk.name}</h2>
                {!open && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase text-warning">
                    <Lock className="h-3 w-3" /> {mk.status === "open" ? "Closed" : mk.status}
                  </span>
                )}
              </header>
              <div className="flex gap-1.5 p-3">
                {mk.selections.map((s) => (
                  <OddsButton key={s.id} match={match} market={mk} selection={s} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
