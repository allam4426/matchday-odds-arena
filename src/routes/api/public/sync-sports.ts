import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { syncLiveMatches, syncStandings } from "@/lib/football-data.server";

export const Route = createFileRoute("/api/public/sync-sports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const body = (await request.json().catch(() => ({}))) as { job?: string };
        try {
          const result = body.job === "standings" ? await syncStandings() : await syncLiveMatches();
          return Response.json({ ok: true, result });
        } catch (e) {
          console.error("sports sync failed", e);
          return Response.json({ ok: false, error: "Sync failed" }, { status: 502 });
        }
      },
    },
  },
});
