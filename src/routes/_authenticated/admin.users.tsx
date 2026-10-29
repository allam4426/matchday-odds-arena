import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { parseRpcError } from "@/lib/betting";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Registrations | Pitchside Admin" },
      { name: "description", content: "Approve or reject new player registrations." },
      { property: "og:title", content: "Registrations | Pitchside Admin" },
      { property: "og:description", content: "Approve new player registrations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-pending-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, email, phone, country, date_of_birth, created_at")
        .eq("approved", false)
        .neq("status", "closed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function decide(id: string, approve: boolean) {
    const { error } = await supabase.rpc("admin_approve_user", { _user: id, _approve: approve });
    if (error) return toast.error(parseRpcError(error).message);
    toast.success(approve ? "Player approved" : "Registration rejected");
    qc.invalidateQueries({ queryKey: ["admin-pending-users"] });
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-black uppercase">Pending registrations</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No registrations waiting for approval.</p>
      ) : (
        <div className="grid gap-3">
          {data.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold">
                  {u.full_name} <span className="text-muted-foreground">@{u.username}</span>
                </p>
                <p className="text-muted-foreground">
                  {u.email} · {u.phone ?? "no phone"} · {u.country} · DOB {u.date_of_birth}
                </p>
                <p className="text-xs text-muted-foreground">Registered {new Date(u.created_at).toLocaleString()}</p>
              </div>
              <Button size="sm" onClick={() => decide(u.id, true)}>
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => decide(u.id, false)}>
                Reject
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
