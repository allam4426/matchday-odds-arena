import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Trophy, Zap } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBetSlip, type SlipItem } from "@/components/betslip/bet-slip-context";
import { formatMoney } from "@/lib/money";
import { Money } from "@/components/Money";
import { isBettable, matchesQuery, matchLabel, type Match } from "@/lib/sportsbook";

type FeedBet = {
  id: string;
  user: string;
  at: number;
  stakeMinor: number;
  legs: SlipItem[];
  odds: number;
};

const HANDLES = ["🎩 Hidden", "🎩 Hidden", "🎩 Hidden", "A***m", "S***d", "F***x", "M***a", "I***h", "R***n", "Z***k", "H***y", "N***l"];
const HIGH_ROLLER_MINOR = 100000; // 1,000 MVR

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeBet(pool: SlipItem[][], at = Date.now()): FeedBet | null {
  if (!pool.length) return null;
  const legCount = Math.random() < 0.65 ? 1 : 2 + Math.floor(Math.random() * 3);
  const legs: SlipItem[] = [];
  const used = new Set<string>();
  for (let i = 0; i < legCount * 3 && legs.length < legCount; i++) {
    const matchSel = pick(pool);
    if (used.has(matchSel[0].matchId)) continue;
    used.add(matchSel[0].matchId);
    legs.push(pick(matchSel));
  }
  if (!legs.length) return null;
  const odds = Math.round(legs.reduce((a, l) => a * l.odds, 1) * 100) / 100;
  const r = Math.random();
  const stakeMvr = r < 0.6 ? 20 + Math.floor(Math.random() * 280) : r < 0.9 ? 300 + Math.floor(Math.random() * 700) : 1000 + Math.floor(Math.random() * 9000);
  return { id: Math.random().toString(36).slice(2, 10).toUpperCase(), user: pick(HANDLES), at, stakeMinor: stakeMvr * 100, legs, odds };
}

function timeAgo(ts: number, now: number) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

export function LiveBetsFeed() {
  const { data: matches = [] } = useQuery(matchesQuery("all"));
  const [tab, setTab] = useState<"all" | "high" | "race">("all");
  const [bets, setBets] = useState<FeedBet[]>([]);
  const [open, setOpen] = useState<FeedBet | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Only open, unfinished markets can be copied.
  const pool = useMemo(() => {
    return (matches as Match[])
      .filter((m) => m.status === "live" || m.status === "scheduled")
      .map((m) =>
        m.markets
          .filter((mk) => isBettable(m, mk))
          .flatMap((mk) =>
            mk.selections.map<SlipItem>((s) => ({
              selectionId: s.id,
              marketId: mk.id,
              matchId: m.id,
              matchLabel: matchLabel(m),
              marketName: mk.name,
              label: s.label,
              odds: Number(s.odds),
            })),
          )
          .filter((s) => s.odds > 1 && s.odds <= 25),
      )
      .filter((arr) => arr.length > 0);
  }, [matches]);

  useEffect(() => {
    if (!pool.length) return;
    setBets((prev) => {
      if (prev.length) return prev;
      const seed: FeedBet[] = [];
      for (let i = 0; i < 14; i++) {
        const b = makeBet(pool, Date.now() - i * (8000 + Math.random() * 20000));
        if (b) seed.push(b);
      }
      return seed;
    });
    const id = setInterval(() => {
      const b = makeBet(pool);
      if (b) setBets((prev) => [b, ...prev].slice(0, 40));
      setNow(Date.now());
    }, 3500);
    return () => clearInterval(id);
  }, [pool]);

  const rows = tab === "high" ? bets.filter((b) => b.stakeMinor >= HIGH_ROLLER_MINOR) : bets;

  const leaderboard = useMemo(() => {
    const totals = new Map<string, number>();
    for (const b of bets) if (!b.user.includes("Hidden")) totals.set(b.user, (totals.get(b.user) ?? 0) + b.stakeMinor);
    const prizes = [500000, 250000, 100000, 50000, 25000];
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([user, total], i) => ({ user, total, prize: prizes[i] ?? 10000 }));
  }, [bets]);

  return (
    <section className="space-y-3 overflow-hidden rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase">
          <span className="h-2 w-2 animate-pulse rounded-full bg-live" /> Live Bets
        </h2>
        <div className="flex gap-1 rounded-full bg-secondary p-1 text-xs font-semibold">
          {([
            ["all", "All Bets", Zap],
            ["high", "High Rollers", Crown],
            ["race", "Race Leaderboard", Trophy],
          ] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-3.5 w-3.5" /> <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "race" ? (
        <div className="divide-y divide-border">
          {leaderboard.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Race starting soon.</p>}
          {leaderboard.map((r, i) => (
            <div key={r.user} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="flex items-center gap-3">
                <span className="w-6 text-center font-bold">{["🥇", "🥈", "🥉"][i] ?? i + 1}</span>
                <span className="font-semibold">{r.user}</span>
              </span>
              <span className="flex gap-4 tabular-nums">
                <span className="text-muted-foreground"><Money minor={r.total} /></span>
                <span className="font-bold text-primary"><Money minor={r.prize} /></span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[1fr_1.6fr_auto_auto]">
            <span>Player</span>
            <span className="hidden sm:block">Event</span>
            <span className="text-right">Odds</span>
            <span className="text-right">Stake</span>
          </div>
          {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No bets yet.</p>}
          {rows.map((b) => (
            <button
              key={b.id}
              onClick={() => setOpen(b)}
              className="grid w-full animate-in fade-in grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-border/50 py-2 text-left text-sm hover:bg-secondary/50 sm:grid-cols-[1fr_1.6fr_auto_auto]"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {b.stakeMinor >= HIGH_ROLLER_MINOR && <Crown className="mr-1 inline h-3.5 w-3.5 text-primary" />}
                  {b.user}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground sm:hidden">
                  {b.legs.length > 1 ? `Combo · ${b.legs.length} legs` : b.legs[0].matchLabel}
                </span>
              </span>
              <span className="hidden min-w-0 truncate text-muted-foreground sm:block">
                {b.legs.length > 1 ? `Combo · ${b.legs.length} legs` : `${b.legs[0].matchLabel} · ${b.legs[0].label}`}
              </span>
              <span className="rounded bg-primary/15 px-2 py-0.5 text-right font-bold tabular-nums text-primary">{b.odds.toFixed(2)}</span>
              <span className="text-right tabular-nums">
                <Money minor={b.stakeMinor} />
                <span className="block text-[10px] text-muted-foreground">{timeAgo(b.at, now)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <BetInspector bet={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function BetInspector({ bet, onClose }: { bet: FeedBet | null; onClose: () => void }) {
  const { toggle, isSelected, setMobileOpen, setMode } = useBetSlip();
  if (!bet) return null;
  const copy = () => {
    for (const l of bet.legs) if (!isSelected(l.selectionId)) toggle(l);
    setMode(bet.legs.length > 1 ? "combo" : "single");
    setMobileOpen(true);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span>{bet.user}</span>
            <span className="text-xs font-normal text-muted-foreground">ID {bet.id}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {bet.legs.map((l) => (
            <div key={l.selectionId} className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              <p className="font-semibold">{l.matchLabel}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">
                  {l.marketName} · <span className="text-foreground">{l.label}</span>
                </span>
                <span className="font-bold text-primary">{l.odds.toFixed(2)}</span>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
            <div className="rounded-md bg-secondary p-2">
              <p className="text-muted-foreground">{bet.legs.length > 1 ? "Combo" : "Single"}</p>
              <p className="font-bold">{bet.odds.toFixed(2)}</p>
            </div>
            <div className="rounded-md bg-secondary p-2">
              <p className="text-muted-foreground">Stake</p>
              <p className="font-bold"><Money minor={bet.stakeMinor} /></p>
            </div>
            <div className="rounded-md bg-secondary p-2">
              <p className="text-muted-foreground">Payout</p>
              <p className="font-bold text-primary"><Money minor={Math.round(bet.stakeMinor * bet.odds)} /></p>
            </div>
          </div>
          <button onClick={copy} className="mt-2 w-full rounded-md bg-primary py-2.5 text-sm font-bold uppercase tracking-wide text-primary-foreground">
            Add to Bet Slip
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
