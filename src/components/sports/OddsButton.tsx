import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Lock } from "lucide-react";

import { useBetSlip } from "@/components/betslip/bet-slip-context";
import { formatOdds } from "@/lib/betting";
import { isBettable, matchLabel, type Market, type Match, type Selection } from "@/lib/sportsbook";
import { cn } from "@/lib/utils";

export function OddsButton({
  match,
  market,
  selection,
  showLabel = true,
  className,
}: {
  match: Match;
  market: Market;
  selection: Selection;
  showLabel?: boolean;
  className?: string;
}) {
  const slip = useBetSlip();
  const selected = slip.isSelected(selection.id);
  const open = isBettable(match, market) && selection.result === "pending";
  const prev = useRef(selection.odds);
  const [move, setMove] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (prev.current !== selection.odds) {
      setMove(selection.odds > prev.current ? "up" : "down");
      prev.current = selection.odds;
      const t = setTimeout(() => setMove(null), 4000);
      return () => clearTimeout(t);
    }
  }, [selection.odds]);

  return (
    <button
      type="button"
      disabled={!open}
      aria-pressed={selected}
      aria-label={`${selection.label} at ${formatOdds(selection.odds)}, ${market.name}, ${matchLabel(match)}`}
      onClick={() =>
        slip.toggle({
          selectionId: selection.id,
          marketId: market.id,
          matchId: match.id,
          matchLabel: matchLabel(match),
          marketName: market.name,
          label: selection.label,
          odds: selection.odds,
        })
      }
      className={cn(
        "relative flex h-11 min-w-[64px] flex-1 items-center justify-between gap-1 rounded-md px-2.5 text-left transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "bg-primary text-primary-foreground"
          : "bg-odds text-foreground hover:bg-odds-hover",
        move && "animate-odds-flash",
        className,
      )}
    >
      {showLabel && (
        <span className={cn("truncate text-xs font-medium", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {selection.label}
        </span>
      )}
      {open ? (
        <span className={cn("flex items-center gap-0.5 font-mono text-sm font-bold tabular", !showLabel && "mx-auto")}>
          {move === "up" && <ArrowUp className="h-3 w-3 text-success" />}
          {move === "down" && <ArrowDown className="h-3 w-3 text-destructive" />}
          {formatOdds(selection.odds)}
        </span>
      ) : (
        <Lock className={cn("h-3.5 w-3.5 text-muted-foreground", !showLabel && "mx-auto")} />
      )}
    </button>
  );
}
