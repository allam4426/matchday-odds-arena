import { queryOptions, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type SelectionResult = "pending" | "won" | "lost" | "void";
export type MarketStatus = "open" | "suspended" | "settled" | "void";
export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "abandoned";

export type Selection = {
  id: string;
  label: string;
  odds: number;
  result: SelectionResult;
  sort_order: number;
  updated_at: string;
};

export type Market = {
  id: string;
  key: string;
  name: string;
  status: MarketStatus;
  sort_order: number;
  selections: Selection[];
};

export type Competition = {
  id: string;
  name: string;
  country: string;
  sport: "football" | "futsal";
  sort_order: number;
  is_featured: boolean;
};

export type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: MatchStatus;
  minute: number | null;
  home_score: number;
  away_score: number;
  ht_home_score: number | null;
  ht_away_score: number | null;
  provenance: "manual" | "sample" | "provider";
  is_hidden: boolean;
  updated_at: string;
  competition: Competition;
  markets: Market[];
};

const MATCH_SELECT = `
  id, home_team, away_team, kickoff_at, status, minute, home_score, away_score, ht_home_score, ht_away_score,
  provenance, is_hidden, updated_at,
  competition:competitions(id, name, country, sport, sort_order, is_featured),
  markets(id, key, name, status, sort_order, selections(id, label, odds, result, sort_order, updated_at))
`;

function normalize(raw: unknown): Match {
  const m = raw as Match;
  return {
    ...m,
    markets: [...(m.markets ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((mk) => ({
        ...mk,
        selections: [...(mk.selections ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({ ...s, odds: Number(s.odds) })),
      })),
  };
}

export type MatchFilter = "all" | "live" | "upcoming";

export function matchesQuery(filter: MatchFilter, competitionId?: string) {
  return queryOptions({
    queryKey: ["matches", filter, competitionId ?? null],
    queryFn: async () => {
      // Hide stale prematch events (kick-off passed but never set live) from default listings.
      const staleCutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      let q = supabase.from("matches").select(MATCH_SELECT).eq("is_hidden", false);
      if (filter === "live") q = q.eq("status", "live");
      else if (filter === "upcoming") q = q.eq("status", "scheduled").gt("kickoff_at", new Date().toISOString());
      else q = q.in("status", ["scheduled", "live"]).gt("kickoff_at", staleCutoff);
      if (competitionId) q = q.eq("competition_id", competitionId);
      const { data, error } = await q.order("kickoff_at", { ascending: true }).limit(200);
      if (error) throw error;
      return (data ?? []).map(normalize);
    },
    staleTime: 15_000,
  });
}

export function matchQuery(id: string) {
  return queryOptions({
    queryKey: ["match", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("matches").select(MATCH_SELECT).eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? normalize(data) : null;
    },
    staleTime: 10_000,
  });
}

export const competitionsQuery = queryOptions({
  queryKey: ["competitions"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("competitions")
      .select("id, name, country, sport, sort_order, is_featured")
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as Competition[];
  },
  staleTime: 5 * 60_000,
});

export function useCompetitions() {
  return useQuery(competitionsQuery);
}

/** Live match count for navigation badges. */
export function useLiveCount() {
  return useQuery({
    queryKey: ["matches", "live-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("status", "live")
        .eq("is_hidden", false);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
  });
}

export function matchLabel(m: Pick<Match, "home_team" | "away_team">) {
  return `${m.home_team} v ${m.away_team}`;
}

/** Bets are accepted only on open markets of visible scheduled (pre-kickoff) or live matches. */
export function isBettable(m: Pick<Match, "status" | "kickoff_at" | "is_hidden">, market: Pick<Market, "status">) {
  if (m.is_hidden || market.status !== "open") return false;
  if (m.status === "live") return true;
  return m.status === "scheduled" && new Date(m.kickoff_at).getTime() > Date.now();
}

export const MARKET_TABS = [
  { key: "1x2", label: "Match Result" },
  { key: "dc", label: "Double Chance" },
  { key: "ou25", label: "Goals O/U 2.5" },
  { key: "btts", label: "Both Score" },
] as const;
