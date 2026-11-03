import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowUp, Lock, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useBetSlip, type SlipItem } from "@/components/betslip/bet-slip-context";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { combinedOdds, formatOdds, parseRpcError, potentialReturnMinor } from "@/lib/betting";
import { formatMoney, parseMoneyToMinor } from "@/lib/money";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type LiveState = { odds: number; open: boolean };

function useLiveSelections(ids: string[]) {
  return useQuery({
    queryKey: ["odds", "slip", [...ids].sort()],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("selections")
        .select("id, odds, result, market:markets(status, match:matches(status, kickoff_at, is_hidden))")
        .in("id", ids);
      if (error) throw error;
      const map: Record<string, LiveState> = {};
      for (const row of data ?? []) {
        const market = row.market as unknown as {
          status: string;
          match: { status: string; kickoff_at: string; is_hidden: boolean };
        } | null;
        const match = market?.match;
        const matchOpen =
          !!match &&
          !match.is_hidden &&
          (match.status === "live" || (match.status === "scheduled" && new Date(match.kickoff_at).getTime() > Date.now()));
        map[row.id] = { odds: Number(row.odds), open: row.result === "pending" && market?.status === "open" && matchOpen };
      }
      return map;
    },
    refetchInterval: 20_000,
  });
}

const QUICK_STAKES = [500, 1000, 2500, 5000];

export function BetSlip({ onClose }: { onClose?: () => void }) {
  const slip = useBetSlip();
  const { user } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const [placing, setPlacing] = useState(false);
  const ids = slip.items.map((i) => i.selectionId);
  const live = useLiveSelections(ids);

  const state = (item: SlipItem): "ok" | "changed" | "closed" => {
    const l = live.data?.[item.selectionId];
    if (!l) return live.isLoading ? "ok" : "closed";
    if (!l.open) return "closed";
    return l.odds !== item.odds ? "changed" : "ok";
  };

  const changedItems = slip.items.filter((i) => state(i) === "changed");
  const closedItems = slip.items.filter((i) => state(i) === "closed");
  const duplicateMatch = useMemo(() => {
    const seen = new Set<string>();
    return slip.items.some((i) => (seen.has(i.matchId) ? true : (seen.add(i.matchId), false)));
  }, [slip.items]);

  const mode = slip.items.length < 2 ? "single" : slip.mode;
  const rawComboOdds = combinedOdds(slip.items.map((i) => i.odds));
  const comboOdds = combinedOdds(slip.items.map((i) => i.odds), Number(settings.max_combo_odds) || 100);
  const comboCapped = rawComboOdds > comboOdds;
  const comboStakeMinor = parseMoneyToMinor(slip.comboStake) ?? 0;

  const singleTotals = slip.items.reduce(
    (acc, i) => {
      const s = parseMoneyToMinor(slip.singleStakes[i.selectionId] ?? "") ?? 0;
      return {
        stake: acc.stake + s,
        ret: acc.ret + potentialReturnMinor(s, i.odds, settings.max_payout_minor),
      };
    },
    { stake: 0, ret: 0 },
  );

  const totalStake = mode === "combo" ? comboStakeMinor : singleTotals.stake;
  const potential =
    mode === "combo" ? potentialReturnMinor(comboStakeMinor, comboOdds, settings.max_payout_minor) : singleTotals.ret;

  const blockers: string[] = [];
  if (closedItems.length) blockers.push("Remove suspended selections to continue.");
  if (changedItems.length && !slip.acceptAnyOdds) blockers.push("Odds have changed. Accept the new odds to continue.");
  if (mode === "combo" && duplicateMatch) blockers.push("Combo selections must be from different matches.");
  if (mode === "combo" && slip.items.length > settings.max_combo_selections)
    blockers.push(`A combo can have at most ${settings.max_combo_selections} selections.`);
  if (totalStake <= 0) blockers.push("Enter a stake.");

  async function placeBets() {
    if (!user) return;
    setPlacing(true);
    const placedIds: string[] = [];
    try {
      if (mode === "combo") {
        const { data, error } = await supabase.rpc("place_bet", {
          _bet_type: "combo",
          _items: slip.items.map((i) => ({ selection_id: i.selectionId, odds: i.odds })),
          _stake_minor: comboStakeMinor,
          _accept_odds_changes: slip.acceptAnyOdds,
        });
        if (error) throw error;
        const res = data as { reference: string };
        toast.success(`Combo bet accepted`, { description: `Reference ${res.reference}` });
        placedIds.push(...ids);
      } else {
        for (const item of slip.items) {
          const stake = parseMoneyToMinor(slip.singleStakes[item.selectionId] ?? "") ?? 0;
          if (stake <= 0) continue;
          const { data, error } = await supabase.rpc("place_bet", {
            _bet_type: "single",
            _items: [{ selection_id: item.selectionId, odds: item.odds }],
            _stake_minor: stake,
            _accept_odds_changes: slip.acceptAnyOdds,
          });
          if (error) throw Object.assign(error, { item });
          const res = data as { reference: string };
          toast.success(`Bet accepted: ${item.label}`, { description: `Reference ${res.reference}` });
          placedIds.push(item.selectionId);
        }
      }
    } catch (e) {
      const err = parseRpcError(e);
      if (err.code === "ODDS_CHANGED") {
        toast.warning("Odds have changed", { description: "Review the new prices and accept them to place your bet." });
      } else {
        toast.error("Bet not accepted", { description: err.message });
      }
      queryClient.invalidateQueries({ queryKey: ["odds"] });
    } finally {
      if (placedIds.length) {
        slip.removeMany(placedIds);
        if (mode === "combo") slip.setComboStake("");
        queryClient.invalidateQueries({ queryKey: ["wallet"] });
        queryClient.invalidateQueries({ queryKey: ["bets"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
      setPlacing(false);
    }
  }

  function acceptChanges() {
    const updates: Record<string, number> = {};
    for (const i of changedItems) updates[i.selectionId] = live.data![i.selectionId].odds;
    slip.updateOdds(updates);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">Bet Slip</h2>
          <span className="rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground tabular">
            {slip.items.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {slip.items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={slip.clear} className="h-8 text-muted-foreground">
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" aria-label="Close bet slip">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {slip.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <div className="rounded-full border border-dashed border-border p-4">
            <span className="font-mono text-lg text-muted-foreground">1.00</span>
          </div>
          <p className="text-sm font-medium">Your bet slip is empty</p>
          <p className="text-xs text-muted-foreground">Tap any odds to add a selection.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1 border-b border-border p-2">
            {(["single", "combo"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={m === "combo" && slip.items.length < 2}
                onClick={() => slip.setMode(m)}
                className={cn(
                  "rounded-md py-1.5 text-sm font-semibold uppercase tracking-wide transition-colors disabled:opacity-40",
                  mode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "single" ? `Singles (${slip.items.length})` : "Combo"}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {slip.items.map((item) => {
              const st = state(item);
              const liveOdds = live.data?.[item.selectionId]?.odds;
              const stakeStr = slip.singleStakes[item.selectionId] ?? "";
              const stakeMinor = parseMoneyToMinor(stakeStr) ?? 0;
              return (
                <div
                  key={item.selectionId}
                  className={cn(
                    "rounded-md border bg-surface p-3",
                    st === "closed" ? "border-destructive/50" : st === "changed" ? "border-warning/60" : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.marketName}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.matchLabel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {st === "closed" ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-destructive">
                          <Lock className="h-3 w-3" /> Suspended
                        </span>
                      ) : (
                        <div className="text-right">
                          {st === "changed" && liveOdds != null && (
                            <p className="font-mono text-[11px] text-muted-foreground line-through">
                              {formatOdds(item.odds)}
                            </p>
                          )}
                          <p className="flex items-center gap-0.5 font-mono text-base font-bold text-primary">
                            {st === "changed" &&
                              liveOdds != null &&
                              (liveOdds > item.odds ? (
                                <ArrowUp className="h-3 w-3 text-success" />
                              ) : (
                                <ArrowDown className="h-3 w-3 text-destructive" />
                              ))}
                            {formatOdds(st === "changed" && liveOdds != null ? liveOdds : item.odds)}
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => slip.remove(item.selectionId)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${item.label}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {mode === "single" && st !== "closed" && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        inputMode="decimal"
                        placeholder="Stake"
                        value={stakeStr}
                        onChange={(e) => slip.setSingleStake(item.selectionId, e.target.value)}
                        className="h-9 bg-background font-mono"
                        aria-label={`Stake for ${item.label}`}
                      />
                      <div className="w-28 text-right text-xs text-muted-foreground">
                        Returns
                        <div className="font-mono text-sm font-semibold text-foreground">
                          {formatMoney(potentialReturnMinor(stakeMinor, item.odds, settings.max_payout_minor), settings.currency)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-3 border-t border-border p-3">
            {mode === "combo" && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{slip.items.length}-fold combo odds</span>
                  <span className="font-mono text-base font-bold text-primary">{formatOdds(comboOdds)}</span>
                </div>
                {comboCapped && (
                  <p className="text-[11px] text-warning">
                    Combo odds are capped at {formatOdds(comboOdds)} (full odds {formatOdds(rawComboOdds)}).
                  </p>
                )}
                <Input
                  inputMode="decimal"
                  placeholder="Combo stake"
                  value={slip.comboStake}
                  onChange={(e) => slip.setComboStake(e.target.value)}
                  className="h-10 bg-background font-mono"
                  aria-label="Combo stake"
                />
                <div className="grid grid-cols-4 gap-1">
                  {QUICK_STAKES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => slip.setComboStake(((comboStakeMinor + q) / 100).toFixed(2))}
                      className="rounded bg-secondary py-1 text-xs font-semibold text-secondary-foreground hover:bg-accent"
                    >
                      +{q / 100}
                    </button>
                  ))}
                </div>
              </>
            )}

            {changedItems.length > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                <span className="flex items-center gap-1 text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" /> Odds changed on {changedItems.length} selection
                  {changedItems.length > 1 ? "s" : ""}
                </span>
                <Button size="sm" variant="outline" className="h-7" onClick={acceptChanges}>
                  Accept
                </Button>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={slip.acceptAnyOdds} onCheckedChange={(v) => slip.setAcceptAnyOdds(v === true)} />
              Automatically accept any odds changes
            </label>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total stake</span>
                <span className="font-mono font-semibold">{formatMoney(totalStake, settings.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Potential returns</span>
                <span className="font-mono text-base font-bold text-primary">
                  {formatMoney(potential, settings.currency)}
                </span>
              </div>
            </div>

            {user ? (
              <Button
                className="h-11 w-full text-base font-bold uppercase tracking-wide"
                disabled={placing || blockers.length > 0}
                onClick={placeBets}
              >
                {placing ? "Placing…" : `Place bet${mode === "single" && slip.items.length > 1 ? "s" : ""}`}
              </Button>
            ) : (
              <Button asChild className="h-11 w-full text-base font-bold uppercase tracking-wide">
                <Link to="/auth" onClick={onClose}>
                  Sign in to bet
                </Link>
              </Button>
            )}
            {user && blockers.length > 0 && totalStake > 0 && (
              <p className="text-center text-xs text-warning">{blockers[0]}</p>
            )}
            <p className="text-center text-[11px] leading-snug text-muted-foreground">
              Odds are confirmed by the server when you place a bet. 18+ only. Please gamble responsibly.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
