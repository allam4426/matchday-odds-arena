import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppRole } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { canUseCategory, STAFF_CATEGORIES } from "@/lib/staff";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin-login")({
  head: () => ({
    meta: [
      { title: "Staff Login | Pitchside" },
      { name: "description", content: "Secure login for Pitchside operators and staff." },
      { property: "og:title", content: "Staff Login | Pitchside" },
      { property: "og:description", content: "Secure login for Pitchside operators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<AppRole | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const cat = STAFF_CATEGORIES.find((c) => c.role === category);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cat) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setBusy(false);
      return toast.error(error?.message ?? "Login failed");
    }
    const { data: rows } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const roles = (rows ?? []).map((r) => r.role);

    if (roles.length === 0 && cat.role === "super_admin") {
      // First-time setup: the staff portal offers "Claim super admin" when none exists yet.
      const { data: exists } = await supabase.rpc("admin_exists");
      if (exists === false) {
        setBusy(false);
        return navigate({ to: "/admin", replace: true });
      }
    }

    if (!canUseCategory(roles, cat.role)) {
      await supabase.auth.signOut();
      setBusy(false);
      return toast.error(`This account is not ${cat.label} staff`, {
        description: roles.length ? "Choose the category you were given." : "Ask a super admin to add you as staff.",
      });
    }
    setBusy(false);
    toast.success(`Signed in as ${cat.label}`);
    navigate({ to: cat.home, replace: true });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg flex-col justify-center px-4 py-10">
      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-2 font-display text-2xl font-black uppercase">Staff login</h1>
          <p className="text-sm text-muted-foreground">
            {cat ? `${cat.label} — ${cat.description}` : "Choose your staff category"}
          </p>
        </div>

        {!cat ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {STAFF_CATEGORIES.map((c) => (
              <button
                key={c.role}
                type="button"
                onClick={() => setCategory(c.role)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-primary",
                  c.role === "super_admin" && "sm:col-span-2",
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <c.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.description}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Change category
            </button>
            <div className="space-y-1.5">
              <Label htmlFor="a-email">Email</Label>
              <Input id="a-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-pass">Password</Label>
              <Input id="a-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full font-bold uppercase" disabled={busy}>
              {busy ? "Signing in…" : `Enter as ${cat.label}`}
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          New staff: register a normal account first, then a super admin adds you under Staff.{" "}
          <Link to="/auth" search={{ mode: "signup" }} className="text-primary">Register</Link>
        </p>
      </div>
    </div>
  );
}
