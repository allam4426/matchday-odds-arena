import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setBusy(false);
      return toast.error(error?.message ?? "Login failed");
    }
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    setBusy(false);
    if (!roles?.length) toast.message("Signed in", { description: "This account has no staff role yet." });
    navigate({ to: "/admin", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4 py-10">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-2 font-display text-2xl font-black uppercase">Staff login</h1>
          <p className="text-sm text-muted-foreground">Back office for operators, finance and traders.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-email">Email</Label>
          <Input id="a-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-pass">Password</Label>
          <Input id="a-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full font-bold uppercase" disabled={busy}>
          {busy ? "Signing in…" : "Enter back office"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          First time? Create an account, then sign in here and claim the super admin role.{" "}
          <Link to="/auth" search={{ mode: "signup" }} className="text-primary">Register</Link>
        </p>
      </form>
    </div>
  );
}
