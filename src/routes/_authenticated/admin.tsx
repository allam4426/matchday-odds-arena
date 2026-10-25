import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseRpcError } from "@/lib/betting";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Portal | Pitchside" },
      { name: "description", content: "Operator back office for matches, odds, payments and users." },
      { property: "og:title", content: "Admin Portal | Pitchside" },
      { property: "og:description", content: "Operator back office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/matches", label: "Matches & Odds" },
  { to: "/admin/deposits", label: "Deposits" },
  { to: "/admin/withdrawals", label: "Withdrawals" },
] as const;

function AdminLayout() {
  const { isStaff, roles, user } = useAuth();
  const queryClient = useQueryClient();
  const rolesLoaded = queryClient.getQueryState(["roles", user?.id])?.status === "success";

  const { data: adminExists } = useQuery({
    queryKey: ["admin-exists"],
    enabled: rolesLoaded && !isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_exists");
      if (error) throw error;
      return data;
    },
  });

  async function claim() {
    const { error } = await supabase.rpc("claim_first_admin");
    if (error) return toast.error(parseRpcError(error).message);
    toast.success("You are now the super admin");
    queryClient.invalidateQueries({ queryKey: ["roles"] });
  }

  if (!rolesLoaded) return <div className="p-8 text-sm text-muted-foreground">Checking permissions…</div>;

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-warning" />
        <h1 className="mt-3 font-display text-2xl font-black uppercase">No admin access</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your account doesn't have a staff role.</p>
        {adminExists === false && (
          <div className="mt-6 rounded-lg border border-border bg-card p-4 text-left text-sm">
            <p className="font-semibold">Initial setup</p>
            <p className="mt-1 text-muted-foreground">
              No administrator exists yet. The first signed-in user can claim the super admin role once; afterwards
              roles can only be granted by a super admin.
            </p>
            <Button className="mt-3 w-full" onClick={claim}>
              Claim super admin
            </Button>
          </div>
        )}
        <Link to="/" className="mt-6 inline-block text-sm text-primary">
          Back to sportsbook
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-border bg-surface">
        <div className="flex items-center gap-3 overflow-x-auto px-4 scrollbar-none">
          <span className="shrink-0 py-3 text-xs font-bold uppercase tracking-widest text-primary">Back office</span>
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: "exact" in n }}
              className="shrink-0 border-b-2 border-transparent px-2 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
              activeProps={{ className: "border-primary text-foreground" }}
            >
              {n.label}
            </Link>
          ))}
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{roles.join(", ").replace(/_/g, " ")}</span>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </div>
    </div>
  );
}
