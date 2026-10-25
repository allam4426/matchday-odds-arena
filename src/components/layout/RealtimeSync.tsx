import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/** Subscribes to odds/match changes (and the user's wallet/notifications) and refreshes cached data. */
export function RealtimeSync() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flush = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        queryClient.invalidateQueries({ queryKey: ["matches"] });
        queryClient.invalidateQueries({ queryKey: ["match"] });
        queryClient.invalidateQueries({ queryKey: ["odds"] });
      }, 400);
    };
    const channel = supabase
      .channel(`sportsbook-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "selections" }, flush)
      .on("postgres_changes", { event: "*", schema: "public", table: "markets" }, flush)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, flush)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_accounts", filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["wallet"] });
        queryClient.invalidateQueries({ queryKey: ["bets"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return null;
}
