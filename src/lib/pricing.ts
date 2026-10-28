/**
 * Automatic odds engine (Poisson goal model).
 * Prices Match Result, Double Chance, Total Goals 2.5 and Both Teams To Score
 * from team scoring rates, and re-prices in-play from the current score and minute.
 */

export type TeamRates = { played: number; goalsFor: number; goalsAgainst: number };

export type PricingInput = {
  home?: TeamRates | null;
  away?: TeamRates | null;
  leagueAvg?: number; // average goals per team per match
  minute?: number | null; // null/0 = prematch
  homeScore?: number;
  awayScore?: number;
};

export type MarketOdds = {
  "1x2": [number, number, number];
  dc: [number, number, number];
  ou25: [number, number];
  btts: [number, number];
};

export type PricingResult = { odds: MarketOdds; suspend: (keyof MarketOdds)[]; lambdaHome: number; lambdaAway: number };

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

export function priceMatch(input: PricingInput): PricingResult {
  const xg = expectedGoals(input);
  const minute = Math.min(Math.max(input.minute ?? 0, 0), 90);
  const remaining = (90 - minute) / 90;
  const lh = xg.home * remaining;
  const la = xg.away * remaining;
  const hs = input.homeScore ?? 0;
  const as = input.awayScore ?? 0;

  let p1 = 0, pX = 0, p2 = 0, pOver = 0, pBtts = 0;
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const pi = poisson(lh, i);
    for (let j = 0; j <= N; j++) {
      const p = pi * poisson(la, j);
      const fh = hs + i;
      const fa = as + j;
      if (fh > fa) p1 += p;
      else if (fh === fa) pX += p;
      else p2 += p;
      if (fh + fa > 2) pOver += p;
      if (fh > 0 && fa > 0) pBtts += p;
    }
  }
  const total = p1 + pX + p2;
  p1 /= total; pX /= total; p2 /= total; pOver /= total; pBtts /= total;

  const cap = maxOddsFor(input.minute);
  const t3 = (p: number) => toOdds(p, MARGIN_3WAY, cap);
  const t2 = (p: number) => toOdds(p, MARGIN_2WAY, cap);
  const odds: MarketOdds = {
    "1x2": [t3(p1), t3(pX), t3(p2)],
    dc: [t2(p1 + pX), t2(p1 + p2), t2(pX + p2)],
    ou25: [t2(pOver), t2(1 - pOver)],
    btts: [t2(pBtts), t2(1 - pBtts)],
  };

  const suspend: (keyof MarketOdds)[] = [];
  if (Math.max(p1, pX, p2) > DECIDED_PROB) suspend.push("1x2");
  if (Math.max(p1 + pX, p1 + p2, pX + p2) > DECIDED_PROB) suspend.push("dc");
  if (Math.max(pOver, 1 - pOver) > DECIDED_PROB) suspend.push("ou25");
  if (Math.max(pBtts, 1 - pBtts) > DECIDED_PROB) suspend.push("btts");

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
