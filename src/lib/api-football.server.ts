/**
 * API-Football (api-sports.io) live-score overlay.
 * The free plan only allows `/fixtures?live=all` for the current season (100 requests/day),
 * so it is used only to speed up scores/minutes of games we already list from football-data.org.
 */
const BASE = "https://v3.football.api-sports.io";
/** Leave headroom under the 100/day free quota. */
const DAILY_BUDGET = 92;
/** Minimum minutes between calls while games are live. */
const MIN_GAP_MIN = 3;

export type AfLive = {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  teams: { home: { name: string; logo?: string }; away: { name: string; logo?: string } };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null } };
};

type Usage = { date: string; count: number; last: string | null };
type Db = Awaited<ReturnType<typeof import("@/integrations/supabase/client.server")["supabaseAdmin"]["from"]>> extends never ? never : any;

const STRIP = /\b(fc|cf|afc|sc|ac|as|cd|ud|sd|rc|rcd|ssc|ss|us|fk|sk|bk|if|club|de|del|la|the|calcio|futbol|football)\b/g;

export function normTeam(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(STRIP, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Two team names refer to the same club if one normalized name contains the other or they share a long word. */
export function sameTeam(a: string, b: string): boolean {
  const x = normTeam(a), y = normTeam(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const wx = x.split(" ").filter((w) => w.length >= 4);
  const wy = new Set(y.split(" ").filter((w) => w.length >= 4));
  return wx.some((w) => wy.has(w));
}

/** Fetch live games if the daily budget and gap allow; returns null when skipped. */
export async function fetchLiveIfAllowed(db: Db, haveLive: boolean): Promise<AfLive[] | null> {
  const key = process.env["API_FOOTBALL_KEY"];
  if (!key || !haveLive) return null;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const { data: row } = await db.from("system_settings").select("value").eq("key", "api_football_usage").maybeSingle();
  let usage = (row?.value as Usage | undefined) ?? { date: today, count: 0, last: null };
  if (usage.date !== today) usage = { date: today, count: 0, last: null };
  if (usage.count >= DAILY_BUDGET) return null;
  if (usage.last && now.getTime() - new Date(usage.last).getTime() < MIN_GAP_MIN * 60000 - 5000) return null;

  usage = { date: today, count: usage.count + 1, last: now.toISOString() };
  await db.from("system_settings").upsert({ key: "api_football_usage", value: usage, updated_at: now.toISOString() });

  const res = await fetch(`${BASE}/fixtures?live=all`, { headers: { "x-apisports-key": key } });
  if (!res.ok) throw new Error(`api-football ${res.status}`);
  const body = (await res.json()) as { errors?: unknown; response?: AfLive[] };
  const errs = body.errors && typeof body.errors === "object" ? Object.values(body.errors as object) : [];
  if (errs.length) throw new Error(`api-football: ${String(errs[0])}`);
  return body.response ?? [];
}

/** Find the live API-Football game for a listed match (same teams, kickoff within 20 minutes). */
export function findLive(list: AfLive[], home: string, away: string, kickoffIso: string): AfLive | undefined {
  const k = new Date(kickoffIso).getTime();
  return list.find(
    (f) =>
      Math.abs(new Date(f.fixture.date).getTime() - k) <= 20 * 60000 &&
      sameTeam(f.teams.home.name, home) &&
      sameTeam(f.teams.away.name, away),
  );
}

/** Map API-Football short status to a football-data style status. */
export function afStatus(short: string): string | null {
  switch (short) {
    case "1H": case "2H": case "ET": case "LIVE": return "IN_PLAY";
    case "HT": case "BT": return "PAUSED";
    case "P": return "PENALTY_SHOOTOUT";
    case "SUSP": case "INT": return "SUSPENDED";
    default: return null; // finished/other: leave to football-data.org (it drives settlement)
  }
}
