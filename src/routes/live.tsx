import { createFileRoute } from "@tanstack/react-router";

import { MatchList } from "@/components/sports/MatchList";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "In-Play Betting — Live Scores & Odds | Pitchside" },
      { name: "description", content: "Bet in play on live football and futsal with match minute, scores and changing odds." },
      { property: "og:title", content: "In-Play Betting | Pitchside" },
      { property: "og:description", content: "Live scores, match clocks and in-play odds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LivePage,
});

function LivePage() {
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 font-display text-3xl font-black uppercase">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-live" /> In-Play
      </h1>
      <MatchList filter="live" emptyText="No matches are in play right now." />
    </div>
  );
}
