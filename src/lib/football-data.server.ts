import { MARKETS, winners } from "@/lib/markets";
import { estimateMinute, priceMatch, type TeamRates } from "@/lib/pricing";

const MARKET_DEFS = MARKETS.map((d) => ({ key: d.key, name: d.name, labels: d.labels }));

const BASE = "https://api.football-data.org/v4";
/** In-play data older than this (minutes after kickoff) is treated as stale and all markets are suspended. */
const STALE_AFTER_MIN = 150;
/** Live markets close this late in the match. */
const LIVE_CUTOFF_MIN = 85;

const COMP_ORDER: Record<string, { sort: number; featured: boolean }> = {
  CL: { sort: 1, featured: true }, PL: { sort: 2, featured: true }, PD: { sort: 3, featured: true },
  SA: { sort: 4, featured: true }, BL1: { sort: 5, featured: true }, FL1: { sort: 6, featured: true },
  EC: { sort: 7, featured: true }, WC: { sort: 8, featured: true }, DED: { sort: 10, featured: false },
  PPL: { sort: 11, featured: false }, ELC: { sort: 12, featured: false }, BSA: { sort: 13, featured: false },
  CLI: { sort: 14, featured: false },
};

type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  area: { name: string };
  competition: { id: number; code: string; name: string };
  homeTeam: { id: number; name: string | null; shortName: string | null; crest?: string | null };
  awayTeam: { id: number; name: string | null; shortName: string | null; crest?: string | null };
  score: {
    duration: string;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null };
  };
};

async function fd<T>(path: string): Promise<T> {
  const key = process.env["FOOTBALL_DATA_API_KEY"];
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not configured");
  const res = await fetch(`${BASE}${path}`, { headers: { "X-Auth-Token": key } });
  if (!res.ok) throw new Error(`football-data.org ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

function mapStatus(s: string) {
  switch (s) {
    case "IN_PLAY": case "PAUSED": case "SUSPENDED": return "live";
    case "FINISHED": case "AWARDED": return "finished";
    case "POSTPONED": return "postponed";
    case "CANCELLED": return "cancelled";
    default: return "scheduled";
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Pulls fixtures/scores (yesterday → +7 days), prices odds, and writes everything in one database call. */
export async function syncLiveMatches() {
  const now = new Date();
  const from = new Date(now.getTime() - 86400000);
  const to = new Date(now.getTime() + 7 * 86400000);
  const data = await fd<{ matches: FdMatch[] }>(`/matches?dateFrom=${day(from)}&dateTo=${day(to)}`);
  const matches = data.matches.filter((m) => m.homeTeam.name && m.awayTeam.name);

  const db = await admin();
  const teamRefs = [...new Set(matches.flatMap((m) => [String(m.homeTeam.id), String(m.awayTeam.id)]))];
  const { data: stats } = await db.from("provider_team_stats").select("*").in("team_ref", teamRefs.length ? teamRefs : ["-"]);
  const byTeam = new Map((stats ?? []).map((s) => [s.team_ref, s]));
  const { data: allStats } = await db.from("provider_team_stats").select("competition_ref, played, goals_for");
  const leagueAvg = new Map<string, number>();
  const agg = new Map<string, { g: number; p: number }>();
  for (const s of allStats ?? []) {
    const a = agg.get(s.competition_ref) ?? { g: 0, p: 0 };
    a.g += s.goals_for; a.p += s.played;
    agg.set(s.competition_ref, a);
  }
  for (const [k, v] of agg) if (v.p > 0) leagueAvg.set(k, v.g / v.p);

  const rates = (ref: number): TeamRates | null => {
    const s = byTeam.get(String(ref));
    return s ? { played: s.played, goalsFor: s.goals_for, goalsAgainst: s.goals_against } : null;
  };

  const payload = matches.map((m) => {
    const status = mapStatus(m.status);
    const hs = m.score.fullTime.home ?? 0;
    const as = m.score.fullTime.away ?? 0;
    const elapsed = (now.getTime() - new Date(m.utcDate).getTime()) / 60000;
    const minute = status === "live" ? estimateMinute(m.utcDate, m.status, now.getTime()) : null;
    const comp = COMP_ORDER[m.competition.code] ?? { sort: 50, featured: false };
    const row: Record<string, unknown> = {
      comp_ref: String(m.competition.id),
      comp_name: m.competition.name,
      comp_country: m.area.name,
      comp_sort: comp.sort,
      comp_featured: comp.featured,
      ref: `fd:${m.id}`,
      home: m.homeTeam.shortName || m.homeTeam.name,
      away: m.awayTeam.shortName || m.awayTeam.name,
      kickoff: m.utcDate,
      status,
      minute,
      hs: status === "scheduled" ? 0 : hs,
      as: status === "scheduled" ? 0 : as,
      hth: m.score.halfTime.home,
      hta: m.score.halfTime.away,
    };
    if (status === "scheduled" || status === "live") {
      const priced = priceMatch({
        home: rates(m.homeTeam.id), away: rates(m.awayTeam.id),
        leagueAvg: leagueAvg.get(String(m.competition.id)),
        minute, homeScore: status === "live" ? hs : 0, awayScore: status === "live" ? as : 0,
        htHome: status === "live" ? m.score.halfTime.home : null, htAway: status === "live" ? m.score.halfTime.away : null,
      });
      row.odds = priced.odds;
      row.defs = MARKET_DEFS;
      const suspendAll = status === "live" && (m.status === "SUSPENDED" || elapsed > STALE_AFTER_MIN || (minute ?? 0) >= LIVE_CUTOFF_MIN);
      row.suspend = suspendAll ? MARKETS.map((d) => d.key) : priced.suspend;
    }
    if (status === "finished") {
      // Settle on the 90-minute result; extra time and penalties don't count.
      const reg = m.score.duration !== "REGULAR" && m.score.regularTime ? m.score.regularTime : m.score.fullTime;
      if (reg.home != null && reg.away != null) {
        row.settle_h = reg.home; row.settle_a = reg.away;
        const h1 = m.score.halfTime.home, a1 = m.score.halfTime.away;
        const win: Record<string, string[]> = {};
        for (const d of MARKETS) {
          // Half markets need the half-time score; without it they're left for a trader.
          if (h1 == null || a1 == null) { if (d.period !== "ft" || d.key === "htft") continue; }
          const fh = h1 ?? 0, fa = a1 ?? 0;
          win[d.key] = h1 == null ? winners(d, reg.home, reg.away, 0, 0) : winners(d, fh, fa, reg.home - fh, reg.away - fa);
        }
        row.settle_win = win;
      }
    }
    return row;
  });

  const { data: result, error } = await db.rpc("provider_sync", { _matches: payload as never });
  if (error) throw new Error(error.message);
  const crests = matches.map((m) => ({ ref: `fd:${m.id}`, hc: m.homeTeam.crest ?? null, ac: m.awayTeam.crest ?? null }));
  await db.rpc("provider_set_crests", { _items: crests as never });
  return { fetched: matches.length, ...(result as Record<string, number>) };
}

/** Refreshes league tables used by the odds engine; rotates through competitions to respect the API rate limit. */
export async function syncStandings(maxCompetitions = 6) {
  const db = await admin();
  const { data: comps } = await db
    .from("competitions")
    .select("id, provider_ref, standings_synced_at")
    .not("provider_ref", "is", null)
    .order("standings_synced_at", { ascending: true, nullsFirst: true })
    .limit(maxCompetitions);
  let teams = 0;
  for (const c of comps ?? []) {
    try {
      const data = await fd<{ standings: { type: string; table: { position: number; team: { id: number; name: string }; playedGames: number; points: number; goalsFor: number; goalsAgainst: number }[] }[] }>(
        `/competitions/${c.provider_ref}/standings`,
      );
      const rows = data.standings
        .filter((s) => s.type === "TOTAL")
        .flatMap((s) => s.table)
        .map((t) => ({
          team_ref: String(t.team.id), competition_ref: c.provider_ref!, team_name: t.team.name, position: t.position,
          played: t.playedGames, points: t.points, goals_for: t.goalsFor, goals_against: t.goalsAgainst, updated_at: new Date().toISOString(),
        }));
      if (rows.length) await db.from("provider_team_stats").upsert(rows, { onConflict: "team_ref" });
      teams += rows.length;
    } catch (e) {
      console.error("standings sync failed", c.provider_ref, e);
    }
    await db.from("competitions").update({ standings_synced_at: new Date().toISOString() }).eq("id", c.id);
  }
  return { competitions: comps?.length ?? 0, teams };
}
