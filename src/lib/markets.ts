/**
 * Every automatically priced market. Used by the odds engine (pricing) and by
 * automatic settlement, so a market is always settled by the same rule it was priced with.
 * Inputs are final half scores: h1/a1 = first half, h2/a2 = second half goals.
 * outcome returns the winning selection index, or -1 when the market is void (stake returned).
 */
export type MarketCategory = "winner" | "total" | "handicap" | "halves";

export type MarketDef = {
  key: string;
  name: string;
  labels: string[];
  category: MarketCategory;
  popular?: boolean;
  /** "ht" markets close at half-time. */
  period: "ft" | "ht" | "h2";
  outcome: (h1: number, a1: number, h2: number, a2: number) => number;
};

const res = (h: number, a: number) => (h > a ? 0 : h === a ? 1 : 2);
const ou = (line: number, goals: number) => (goals > line ? 0 : 1);

function totals(prefix: string, name: string, lines: number[], period: MarketDef["period"], goals: (h1: number, a1: number, h2: number, a2: number) => number, category: MarketCategory, popularLine?: number): MarketDef[] {
  return lines.map((l) => ({
    key: `${prefix}${String(l).replace(".", "")}`,
    name: `${name} ${l}`,
    labels: [`Over ${l}`, `Under ${l}`],
    category,
    period,
    popular: l === popularLine,
    outcome: (h1, a1, h2, a2) => ou(l, goals(h1, a1, h2, a2)),
  }));
}

const HTFT = ["1/1", "1/X", "1/2", "X/1", "X/X", "X/2", "2/1", "2/X", "2/2"];

export const MARKETS: MarketDef[] = [
  { key: "1x2", name: "Match Result", labels: ["1", "X", "2"], category: "winner", period: "ft", popular: true, outcome: (h1, a1, h2, a2) => res(h1 + h2, a1 + a2) },
  {
    key: "dc", name: "Double Chance", labels: ["1X", "12", "X2"], category: "winner", period: "ft", popular: true,
    // Double chance has two winning labels; settlement uses winners(), pricing handles it specially.
    outcome: (h1, a1, h2, a2) => res(h1 + h2, a1 + a2),
  },
  { key: "dnb", name: "Draw No Bet", labels: ["1", "2"], category: "winner", period: "ft", popular: true, outcome: (h1, a1, h2, a2) => { const r = res(h1 + h2, a1 + a2); return r === 1 ? -1 : r === 0 ? 0 : 1; } },
  { key: "ht1x2", name: "1st Half Winner", labels: ["1", "X", "2"], category: "halves", period: "ht", outcome: (h1, a1) => res(h1, a1) },
  { key: "h21x2", name: "2nd Half Winner", labels: ["1", "X", "2"], category: "halves", period: "h2", outcome: (_h1, _a1, h2, a2) => res(h2, a2) },
  { key: "btts", name: "Both Teams To Score", labels: ["Yes", "No"], category: "total", period: "ft", popular: true, outcome: (h1, a1, h2, a2) => (h1 + h2 > 0 && a1 + a2 > 0 ? 0 : 1) },
  ...totals("ou", "Total Goals", [0.5, 1.5, 2.5, 3.5, 4.5, 5.5], "ft", (h1, a1, h2, a2) => h1 + a1 + h2 + a2, "total", 2.5),
  ...totals("htou", "1st Half Total", [0.5, 1.5, 2.5], "ht", (h1, a1) => h1 + a1, "halves"),
  ...totals("h2ou", "2nd Half Total", [0.5, 1.5, 2.5], "h2", (_h1, _a1, h2, a2) => h2 + a2, "halves"),
  ...totals("hou", "Home Team Total", [0.5, 1.5, 2.5], "ft", (h1, _a1, h2) => h1 + h2, "total"),
  ...totals("aou", "Away Team Total", [0.5, 1.5, 2.5], "ft", (_h1, a1, _h2, a2) => a1 + a2, "total"),
  ...[-1.5, -0.5, 0.5, 1.5].map<MarketDef>((line) => {
    const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    return {
      key: `ah${line < 0 ? "m" : "p"}${String(Math.abs(line)).replace(".", "")}`,
      name: `Asian Handicap ${fmt(line)}`,
      labels: [`Home ${fmt(line)}`, `Away ${fmt(-line)}`],
      category: "handicap",
      period: "ft",
      popular: line === -0.5,
      outcome: (h1, a1, h2, a2) => (h1 + h2 + line > a1 + a2 ? 0 : 1),
    };
  }),
  { key: "htft", name: "Half Time / Full Time", labels: HTFT, category: "halves", period: "ft", outcome: (h1, a1, h2, a2) => res(h1, a1) * 3 + res(h1 + h2, a1 + a2) },
];

export const MARKET_BY_KEY = new Map(MARKETS.map((m) => [m.key, m]));

/** Winning labels for settlement; ["__void"] means return all stakes. */
export function winners(def: MarketDef, h1: number, a1: number, h2: number, a2: number): string[] {
  if (def.key === "dc") {
    const r = res(h1 + h2, a1 + a2);
    return [r !== 2 && "1X", r !== 1 && "12", r !== 0 && "X2"].filter(Boolean) as string[];
  }
  const i = def.outcome(h1, a1, h2, a2);
  return i < 0 ? ["__void"] : [def.labels[i]];
}

export const CATEGORY_TABS: { id: "popular" | "all" | MarketCategory; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "all", label: "All markets" },
  { id: "winner", label: "Winner" },
  { id: "total", label: "Total" },
  { id: "handicap", label: "Handicap" },
  { id: "halves", label: "Halves" },
];
