import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lets a trader trigger an immediate fixtures/scores/odds refresh from the back office. */
export const syncSportsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: canTrade } = await context.supabase.rpc("can_trade", { _user_id: context.userId });
    if (!canTrade) throw new Error("FORBIDDEN|Trading permission required");
    const { syncLiveMatches, syncStandings } = await import("@/lib/football-data.server");
    const standings = await syncStandings(3);
    const matches = await syncLiveMatches();
    return { standings, matches };
  });
