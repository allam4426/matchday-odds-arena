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

export type AppSettings = {
  currency: string;
  real_money_enabled: boolean;
  min_deposit_minor: number;
  max_deposit_minor: number;
  min_withdrawal_minor: number;
  max_withdrawal_minor: number;
  min_stake_minor: number;
  max_stake_minor: number;
  max_payout_minor: number;
  max_combo_selections: number;
  restricted_countries: string[];
  bank_details: BankDetails;
  bank_accounts: BankAccount[];
  sports_data_provider: ProviderInfo;
};

export const DEFAULT_SETTINGS: AppSettings = {
  currency: "MVR",
  real_money_enabled: false,
  min_deposit_minor: 1000,
  max_deposit_minor: 1_000_000,
  min_withdrawal_minor: 2000,
  max_withdrawal_minor: 500_000,
  min_stake_minor: 100,
  max_stake_minor: 100_000,
  max_payout_minor: 5_000_000,
  max_combo_selections: 12,
  restricted_countries: [],
  bank_details: { bank_name: "", account_name: "", account_number: "", instructions: "" },
  bank_accounts: [],
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
