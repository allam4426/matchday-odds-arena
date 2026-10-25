import { createFileRoute } from "@tanstack/react-router";

import { MatchList } from "@/components/sports/MatchList";
import { useCompetitions } from "@/lib/sportsbook";

export const Route = createFileRoute("/competition/$id")({
  head: () => ({
    meta: [
      { title: "Competition Odds | Pitchside" },
      { name: "description", content: "Fixtures, live scores and odds for this competition." },
      { property: "og:title", content: "Competition Odds | Pitchside" },
      { property: "og:description", content: "Fixtures, live scores and odds for this competition." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompetitionPage,
});

function CompetitionPage() {
  const { id } = Route.useParams();
  const { data: comps } = useCompetitions();
  const comp = comps?.find((c) => c.id === id);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {comp ? `${comp.sport} · ${comp.country}` : "Competition"}
        </p>
        <h1 className="font-display text-3xl font-black uppercase">{comp?.name ?? "Loading…"}</h1>
      </div>
      <MatchList filter="all" competitionId={id} emptyText="No open events in this competition." />
    </div>
  );
}
