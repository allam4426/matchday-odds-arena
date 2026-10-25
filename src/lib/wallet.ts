import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type WalletSummary = {
  available_minor: number;
  reserved_minor: number;
  pending_deposits_minor: number;
  pending_withdrawals_minor: number;
  total_deposits_minor: number;
  total_withdrawals_minor: number;
  open_stakes_minor: number;
  net_winnings_minor: number;
};

export function useWalletSummary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wallet", "summary", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("wallet_summary");
      if (error) throw error;
      return data as unknown as WalletSummary;
    },
  });
}

export const DEPOSIT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending verification",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const WITHDRAWAL_STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  pending_review: "Pending review",
  approved: "Approved",
  processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
  failed: "Failed",
};

export const LEDGER_TYPE_LABEL: Record<string, string> = {
  deposit: "Deposit",
  bet_stake: "Bet stake",
  bet_payout: "Bet returns",
  bet_refund: "Stake refund",
  withdrawal_reserve: "Withdrawal reserved",
  withdrawal_release: "Withdrawal released",
  withdrawal_paid: "Withdrawal paid",
};
