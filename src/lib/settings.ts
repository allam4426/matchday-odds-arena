import { queryOptions, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type BankDetails = {
  bank_name: string;
  account_name: string;
  account_number: string;
  instructions: string;
};

export type BankAccount = BankDetails & { id: string; visible: boolean };

export const BANK_PRESETS = ["Maldives Islamic Bank", "Bank of Maldives"];

/** Bank accounts customers can see; falls back to the legacy single account. */
export function visibleBanks(s: AppSettings): BankAccount[] {
  const list = s.bank_accounts ?? [];
  if (list.length) return list.filter((b) => b.visible && b.account_number.trim());
  const b = s.bank_details;
  return b.account_number && b.account_number !== "Not configured" ? [{ ...b, id: "legacy", visible: true }] : [];
}

export type ProviderInfo = { name: string | null; status: string; last_sync_at: string | null };

export type CryptoWallet = {
  id: string;
  name: string;
  symbol: string;
  network: string;
  address: string;
  min_amount: number;
  /** MVR credited per 1 coin */
  mvr_rate: number;
  visible: boolean;
};

export const DEFAULT_MVR_RATE = 21;

/** Crypto wallets customers can deposit to / withdraw with. */
export function visibleCryptoWallets(s: AppSettings): CryptoWallet[] {
  return (s.crypto_wallets ?? []).filter((w) => w.visible && w.address.trim() && Number(w.mvr_rate) > 0);
}

/** Convert MVR minor units to a coin amount at the wallet's rate (6 decimals). */
export function minorToCrypto(minor: number, rate: number): number {
  if (!rate || rate <= 0) return 0;
  return Math.round((minor / 100 / rate) * 1e6) / 1e6;
}

/** Convert a coin amount to MVR minor units at the wallet's rate (rounded like the server). */
export function cryptoToMinor(amount: number, rate: number): number {
  return Math.round(amount * rate * 100);
}

export type AppSettings = {
  currency: string;
  real_money_enabled: boolean;
  min_deposit_minor: number;
  max_deposit_minor: number;
  min_withdrawal_minor: number;
  max_withdrawal_minor: number;
  max_withdrawals_per_day: number;
  min_stake_minor: number;
  max_stake_minor: number;
  max_payout_minor: number;
  max_combo_selections: number;
  max_combo_odds: number;
  restricted_countries: string[];
  bank_details: BankDetails;
  bank_accounts: BankAccount[];
  crypto_wallets: CryptoWallet[];
  sports_data_provider: ProviderInfo;
};

export const DEFAULT_SETTINGS: AppSettings = {
  currency: "MVR",
  real_money_enabled: false,
  min_deposit_minor: 1000,
  max_deposit_minor: 1_000_000,
  min_withdrawal_minor: 2000,
  max_withdrawal_minor: 500_000,
  max_withdrawals_per_day: 2,
  min_stake_minor: 100,
  max_stake_minor: 100_000,
  max_payout_minor: 5_000_000,
  max_combo_selections: 12,
  max_combo_odds: 100,
  restricted_countries: [],
  bank_details: { bank_name: "", account_name: "", account_number: "", instructions: "" },
  bank_accounts: [],
  crypto_wallets: [],
  sports_data_provider: { name: null, status: "not_configured", last_sync_at: null },
};

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async (): Promise<AppSettings> => {
    const { data, error } = await supabase.from("system_settings").select("key, value");
    if (error) throw error;
    const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    return { ...DEFAULT_SETTINGS, ...map } as AppSettings;
  },
  staleTime: 60_000,
});

export function useSettings(): AppSettings {
  const { data } = useQuery(settingsQuery);
  return data ?? DEFAULT_SETTINGS;
}
