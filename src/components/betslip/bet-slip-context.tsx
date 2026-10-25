import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SlipItem = {
  selectionId: string;
  marketId: string;
  matchId: string;
  matchLabel: string;
  marketName: string;
  label: string;
  odds: number;
};

type SlipMode = "single" | "combo";

type BetSlipContextValue = {
  items: SlipItem[];
  mode: SlipMode;
  setMode: (m: SlipMode) => void;
  singleStakes: Record<string, string>;
  setSingleStake: (selectionId: string, v: string) => void;
  comboStake: string;
  setComboStake: (v: string) => void;
  acceptAnyOdds: boolean;
  setAcceptAnyOdds: (v: boolean) => void;
  toggle: (item: SlipItem) => void;
  remove: (selectionId: string) => void;
  removeMany: (selectionIds: string[]) => void;
  clear: () => void;
  updateOdds: (updates: Record<string, number>) => void;
  isSelected: (selectionId: string) => boolean;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
};

const BetSlipContext = createContext<BetSlipContextValue | null>(null);
const STORAGE_KEY = "pitchside.betslip.v1";

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SlipItem[]>([]);
  const [mode, setModeState] = useState<SlipMode>("single");
  const [singleStakes, setSingleStakes] = useState<Record<string, string>>({});
  const [comboStake, setComboStake] = useState("");
  const [acceptAnyOdds, setAcceptAnyOdds] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: SlipItem[]; mode?: SlipMode };
        if (Array.isArray(parsed.items)) setItems(parsed.items);
        if (parsed.mode) setModeState(parsed.mode);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, mode }));
  }, [items, mode, hydrated]);

  const toggle = useCallback((item: SlipItem) => {
    setItems((prev) => {
      if (prev.some((p) => p.selectionId === item.selectionId)) {
        return prev.filter((p) => p.selectionId !== item.selectionId);
      }
      // Only one selection per market.
      const next = prev.filter((p) => p.marketId !== item.marketId);
      return [...next, item];
    });
  }, []);

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((p) => p.selectionId !== id)), []);
  const removeMany = useCallback(
    (ids: string[]) => setItems((prev) => prev.filter((p) => !ids.includes(p.selectionId))),
    [],
  );
  const clear = useCallback(() => {
    setItems([]);
    setSingleStakes({});
    setComboStake("");
  }, []);
  const updateOdds = useCallback((updates: Record<string, number>) => {
    setItems((prev) => prev.map((p) => (updates[p.selectionId] != null ? { ...p, odds: updates[p.selectionId] } : p)));
  }, []);

  const value = useMemo<BetSlipContextValue>(
    () => ({
      items,
      mode,
      setMode: setModeState,
      singleStakes,
      setSingleStake: (id, v) => setSingleStakes((s) => ({ ...s, [id]: v })),
      comboStake,
      setComboStake,
      acceptAnyOdds,
      setAcceptAnyOdds,
      toggle,
      remove,
      removeMany,
      clear,
      updateOdds,
      isSelected: (id) => items.some((i) => i.selectionId === id),
      mobileOpen,
      setMobileOpen,
    }),
    [items, mode, singleStakes, comboStake, acceptAnyOdds, toggle, remove, removeMany, clear, updateOdds, mobileOpen],
  );

  return <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>;
}

export function useBetSlip() {
  const ctx = useContext(BetSlipContext);
  if (!ctx) throw new Error("useBetSlip must be used within BetSlipProvider");
  return ctx;
}
