/**
 * Client-side bet maths. These mirror the server rules in place_bet / _settle_bet
 * for display only — the server recalculates everything with exact numerics.
 */

function round2(n: number): number {
  return Math.round(Number((n * 100).toFixed(8))) / 100;
}

/** Plain product of the leg odds, rounded to 2 decimals. */
export function rawComboOdds(odds: number[]): number {
  if (odds.length === 0) return 0;
  return round2(odds.reduce((acc, o) => acc * o, 1));
}

/**
 * Combo odds paid by the house (mirrors combo_total_odds in the database).
 * Up to `reduceFrom` the full product is paid; above it only the square root of
 * the extra growth counts, so big accumulators grow smoothly but much slower.
 */
export function combinedOdds(odds: number[], reduceFrom = 10): number {
  const raw = rawComboOdds(odds);
  if (!(reduceFrom > 1) || raw <= reduceFrom) return raw;
  return round2(reduceFrom * Math.sqrt(raw / reduceFrom));
}

/** Potential return (stake included) in minor units, floored and capped at the max payout. */
export function potentialReturnMinor(stakeMinor: number, odds: number, maxPayoutMinor?: number): number {
  if (!stakeMinor || stakeMinor <= 0 || !odds) return 0;
  const raw = Math.floor(Number((stakeMinor * odds).toFixed(6)));
  return maxPayoutMinor != null ? Math.min(raw, maxPayoutMinor) : raw;
}

export function formatOdds(odds: number | string | null | undefined): string {
  const n = Number(odds);
  return Number.isFinite(n) ? n.toFixed(2) : "-";
}

export type RpcErrorInfo = { code: string; message: string };

/** Server functions raise "CODE|Human message"; split it for the UI. */
export function parseRpcError(e: unknown): RpcErrorInfo {
  const raw =
    (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e)) ||
    "Something went wrong";
  const idx = raw.indexOf("|");
  if (idx > 0 && /^[A-Z_]+$/.test(raw.slice(0, idx))) {
    return { code: raw.slice(0, idx), message: raw.slice(idx + 1) };
  }
  return { code: "UNKNOWN", message: raw };
}
