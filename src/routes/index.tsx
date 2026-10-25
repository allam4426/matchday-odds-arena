import { createFileRoute, Link } from "@tanstack/react-router";
import { Radio, X } from "lucide-react";

import { MatchList } from "@/components/sports/MatchList";

type HomeSearch = { q?: string };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): HomeSearch => ({
    q: typeof s.q === "string" && s.q.trim() ? s.q.slice(0, 60) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Pitchside — Football & Futsal Betting, Live Odds" },
      {
        name: "description",
        content: "Bet on football and futsal with in-play scores, live odds, singles and combos, and a secure wallet.",
      },
      { property: "og:title", content: "Pitchside — Football & Futsal Betting" },
      { property: "og:description", content: "In-play scores, live odds, singles and combo bets with a secure wallet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { q } = Route.useSearch();
  return (
    <div className="space-y-6">
      {q ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm">
            Results for <span className="font-semibold text-primary">“{q}”</span>
          </p>
          <Link to="/" search={{}} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </Link>
        </div>
      ) : (
        <section className="relative overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-7">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(ellipse_at_right,var(--color-primary)_0%,transparent_65%)] opacity-15" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Matchday</p>
          <h1 className="mt-1 max-w-lg font-display text-3xl font-black uppercase leading-none sm:text-5xl">
            Every kick. Every price. In play.
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Build singles or combos on the biggest football and futsal fixtures. Odds are verified the moment you place
            your bet.
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              to="/live"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-bold uppercase tracking-wide text-primary-foreground"
            >
              <Radio className="h-4 w-4" /> In-Play now
            </Link>
            <Link
              to="/upcoming"
              className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
            >
              Upcoming
            </Link>
          </div>
        </section>
      )}

      {!q && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase">
            <span className="h-2 w-2 animate-pulse rounded-full bg-live" /> Live now
          </h2>
          <MatchList filter="live" emptyText="No matches are in play right now." />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold uppercase">{q ? "Matches" : "Upcoming"}</h2>
        <MatchList filter={q ? "all" : "upcoming"} search={q} emptyText={q ? "No matches match your search." : undefined} />
      </section>
    </div>
  );
}
