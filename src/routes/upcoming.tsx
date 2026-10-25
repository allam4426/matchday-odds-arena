import { createFileRoute } from "@tanstack/react-router";

import { MatchList } from "@/components/sports/MatchList";

export const Route = createFileRoute("/upcoming")({
  head: () => ({
    meta: [
      { title: "Upcoming Matches & Prematch Odds | Pitchside" },
      { name: "description", content: "Prematch odds on upcoming football and futsal fixtures across top competitions." },
      { property: "og:title", content: "Upcoming Matches | Pitchside" },
      { property: "og:description", content: "Prematch odds on upcoming football and futsal fixtures." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UpcomingPage,
});

function UpcomingPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-black uppercase">Upcoming</h1>
      <MatchList filter="upcoming" />
    </div>
  );
}
