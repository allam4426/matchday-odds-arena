/**
 * Automatic odds engine (Poisson goal model, split by half).
 * Prices every market in src/lib/markets.ts from team scoring rates,
 * and re-prices in-play from the current score, half-time score and minute.
 */
import { MARKETS } from "@/lib/markets";

export type TeamRates = { played: number; goalsFor: number; goalsAgainst: number };

export type PricingInput = {
  home?: TeamRates | null;
  away?: TeamRates | null;
  leagueAvg?: number; // average goals per team per match
  minute?: number | null; // null/0 = prematch
  homeScore?: number;
  awayScore?: number;
  htHome?: number | null;
  htAway?: number | null;
};

export type MarketOdds = Record<string, number[]>;

export type PricingResult = { odds: MarketOdds; suspend: string[]; lambdaHome: number; lambdaAway: number };

const MARGIN_MULTI = 0.15;
const MARGIN_3WAY = 0.07;
const MARGIN_2WAY = 0.05;
const HOME_ADV = 1.12;
const AWAY_ADJ = 0.9;
const PRIOR_GAMES = 5; // shrink early-season rates toward league average
/** A market whose most likely outcome is above this probability is suspended (effectively decided). */
export const DECIDED_PROB = 0.97;

function poisson(lambda: number, k: number) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-lambda) * lambda ** k) / f;
}

function rate(value: number, played: number, avg: number) {
  const raw = played > 0 ? value / played / avg : 1;
  return (raw * played + PRIOR_GAMES) / (played + PRIOR_GAMES);
}

/** Highest odds ever offered. */
export const MAX_ODDS = 25;
/** Highest odds offered while a match is in its first half. */
export const MAX_ODDS_FIRST_HALF = 10;

export function maxOddsFor(minute: number | null | undefined) {
  return minute && minute > 0 && minute <= 45 ? MAX_ODDS_FIRST_HALF : MAX_ODDS;
}

export function toOdds(prob: number, margin: number, cap = MAX_ODDS) {
  const p = Math.min(Math.max(prob, 0.001), 0.999);
  const o = 1 / (p * (1 + margin));
  return Math.round(Math.min(Math.max(o, 1.01), cap) * 100) / 100;
}

export function expectedGoals(input: PricingInput) {
  const avg = input.leagueAvg && input.leagueAvg > 0 ? input.leagueAvg : 1.35;
  const h = input.home;
  const a = input.away;
  const hAtt = h ? rate(h.goalsFor, h.played, avg) : 1;
  const hDef = h ? rate(h.goalsAgainst, h.played, avg) : 1;
  const aAtt = a ? rate(a.goalsFor, a.played, avg) : 1;
  const aDef = a ? rate(a.goalsAgainst, a.played, avg) : 1;
  return { home: avg * hAtt * aDef * HOME_ADV, away: avg * aAtt * hDef * AWAY_ADJ };
}

const FIRST_HALF_SHARE = 0.9; // first halves see slightly fewer goals than second halves
const GRID = 6;

function pmf(lambda: number) {
  return Array.from({ length: GRID + 1 }, (_, k) => poisson(lambda, k));
}

export function priceMatch(input: PricingInput): PricingResult {
  const xg = expectedGoals(input);
  const m = Math.min(Math.max(input.minute ?? 0, 0), 90);
  const hs = input.homeScore ?? 0;
  const as = input.awayScore ?? 0;
  const htKnown = input.htHome != null && input.htAway != null;

  // Goals still to come in each half.
  const left1 = Math.max(0, 45 - m);
  const left2 = Math.min(45, 90 - Math.max(m, 45));
  const r1 = FIRST_HALF_SHARE / 90, r2 = (2 - FIRST_HALF_SHARE) / 90;
  const H1 = pmf(xg.home * r1 * left1), A1 = pmf(xg.away * r1 * left1);
  const H2 = pmf(xg.home * r2 * left2), A2 = pmf(xg.away * r2 * left2);

  // Goals already scored in each half.
  let c1h = hs, c1a = as, c2h = 0, c2a = 0;
  if (m > 45) {
    if (htKnown) { c1h = input.htHome!; c1a = input.htAway!; }
    c2h = hs - c1h; c2a = as - c1a;
  }

  const probs = new Map<string, number[]>(MARKETS.map((d) => [d.key, d.labels.map(() => 0)]));
  let mass = 0;
  for (let i1 = 0; i1 <= GRID; i1++) for (let j1 = 0; j1 <= GRID; j1++) {
    const p1 = H1[i1] * A1[j1];
    if (p1 < 1e-9) continue;
    for (let i2 = 0; i2 <= GRID; i2++) for (let j2 = 0; j2 <= GRID; j2++) {
      const p = p1 * H2[i2] * A2[j2];
      if (p < 1e-10) continue;
      mass += p;
      const h1 = c1h + i1, a1 = c1a + j1, h2 = c2h + i2, a2 = c2a + j2;
      for (const d of MARKETS) {
        const arr = probs.get(d.key)!;
        if (d.key === "dc") {
          const r = d.outcome(h1, a1, h2, a2);
          if (r !== 2) arr[0] += p;
          if (r !== 1) arr[1] += p;
          if (r !== 0) arr[2] += p;
        } else {
          const idx = d.outcome(h1, a1, h2, a2);
          if (idx >= 0) arr[idx] += p;
        }
      }
    }
  }

  const cap = maxOddsFor(input.minute);
  const odds: MarketOdds = {};
  const suspend: string[] = [];
  for (const d of MARKETS) {
    let arr = probs.get(d.key)!.map((p) => p / mass);
    if (d.key === "dnb") { const s = arr[0] + arr[1]; arr = s > 0 ? arr.map((p) => p / s) : [0.5, 0.5]; }
    const margin = d.labels.length >= 9 ? MARGIN_MULTI : d.labels.length === 3 ? MARGIN_3WAY : MARGIN_2WAY;
    odds[d.key] = arr.map((p) => toOdds(p, margin, cap));
    const decided = d.key === "dc" ? Math.min(...arr) > DECIDED_PROB || Math.max(...arr) > 0.995 : Math.max(...arr) > DECIDED_PROB;
    if (decided || (d.period === "ht" && m >= 45) || (d.period === "h2" && m > 45 && !htKnown)) suspend.push(d.key);
  }

  return { odds, suspend, lambdaHome: xg.home, lambdaAway: xg.away };
}

/** Estimates the match minute from kickoff time when the feed doesn't provide one. */
export function estimateMinute(kickoffIso: string, providerStatus: string, now = Date.now()) {
  if (providerStatus === "PAUSED") return 45;
  const elapsed = Math.floor((now - new Date(kickoffIso).getTime()) / 60000);
  if (elapsed <= 0) return 1;
  if (elapsed <= 45) return elapsed;
  if (elapsed <= 60) return 45;
  return Math.min(90, elapsed - 15);
}
