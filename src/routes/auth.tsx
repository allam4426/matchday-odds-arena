import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { COUNTRIES } from "@/lib/countries";
import { useSettings } from "@/lib/settings";

type AuthSearch = { mode?: "signin" | "signup" | "forgot"; redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): AuthSearch => ({
    mode: s.mode === "signup" || s.mode === "forgot" ? s.mode : undefined,
    redirect: typeof s.redirect === "string" && s.redirect.startsWith("/") && !s.redirect.startsWith("//") ? s.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Log in or Join | Pitchside" },
      { name: "description", content: "Log in to your Pitchside account or register to start betting responsibly." },
      { property: "og:title", content: "Log in or Join | Pitchside" },
      { property: "og:description", content: "Log in or create your Pitchside account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function isAdult(dob: string) {
  if (!dob) return false;
  const d = new Date(dob);
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 18);
  return d <= limit;
}

function AuthPage() {
  const search = Route.useSearch();
  const mode = search.mode ?? "signin";
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate({ to: (search.redirect as "/") ?? "/", replace: true });
  }, [user, navigate, search.redirect]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        {mode === "signin" && <SignIn redirect={search.redirect} />}
        {mode === "signup" && <SignUp />}
        {mode === "forgot" && <Forgot />}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        18+ only. Please gamble responsibly.{" "}
        <Link to="/responsible-gambling" className="underline">
          Learn more
        </Link>
      </p>
    </div>
  );
}

function SignIn({ redirect }: { redirect?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message === "Email not confirmed" ? "Please confirm your email first." : error.message);
      return;
    }
    navigate({ to: (redirect as "/") ?? "/", replace: true });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Log in</h1>
        <p className="text-sm text-muted-foreground">Welcome back.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link to="/auth" search={{ mode: "forgot" }} className="text-xs text-primary">
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full font-bold uppercase" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link to="/auth" search={{ mode: "signup" }} className="font-semibold text-primary">
          Create an account
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        <Link to="/admin-login" className="underline">Staff login</Link>
      </p>
    </form>
  );
}

function SignUp() {
  const settings = useSettings();
  const [f, setF] = useState({
    username: "",
    full_name: "",
    email: "",
    phone: "",
    country: "",
    date_of_birth: "",
    password: "",
  });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(f.username)) return toast.error("Username: 3–20 letters, numbers or underscores.");
    if (f.full_name.trim().length < 3) return toast.error("Enter your full legal name.");
    if (!/^\+\d{6,15}$/.test(f.phone.replace(/[\s-]/g, ""))) return toast.error("Enter your mobile with country code, e.g. +60123456789.");
    if (!f.country) return toast.error("Select your country of residence.");
    if (settings.restricted_countries.includes(f.country)) return toast.error("Registration is not available in your country.");
    if (!isAdult(f.date_of_birth)) return toast.error("You must be at least 18 years old.");
    if (f.password.length < 8) return toast.error("Password must be at least 8 characters.");
    if (!agree) return toast.error("Please confirm you are 18+ and accept the terms.");

    setBusy(true);
    const { data: available } = await supabase.rpc("username_available", { _username: f.username });
    if (available === false) {
      setBusy(false);
      return toast.error("That username is taken.");
    }
    const { error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          username: f.username.trim(),
          full_name: f.full_name.trim(),
          phone: f.phone.replace(/[\s-]/g, ""),
          country: f.country,
          date_of_birth: f.date_of_birth,
        },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <MailCheck className="mx-auto h-10 w-10 text-primary" />
        <h1 className="font-display text-2xl font-black uppercase">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-semibold text-foreground">{f.email}</span>. Confirm your
          email to activate your account, then log in.
        </p>
        <Link to="/auth" className="text-sm font-semibold text-primary">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Create account</h1>
        <p className="text-sm text-muted-foreground">Use your real details — they're required for verification and withdrawals.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input id="username" required value={f.username} onChange={set("username")} autoComplete="username" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" type="date" required value={f.date_of_birth} onChange={set("date_of_birth")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="full_name">Full legal name</Label>
        <Input id="full_name" required value={f.full_name} onChange={set("full_name")} autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-email">Email</Label>
        <Input id="su-email" type="email" required value={f.email} onChange={set("email")} autoComplete="email" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Mobile (with +code)</Label>
          <Input id="phone" type="tel" placeholder="+60123456789" required value={f.phone} onChange={set("phone")} autoComplete="tel" />
        </div>
        <div className="space-y-1.5">
          <Label>Country</Label>
          <Select value={f.country} onValueChange={(v) => setF({ ...f, country: v })}>
            <SelectTrigger aria-label="Country of residence">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-password">Password</Label>
        <Input id="su-password" type="password" required minLength={8} value={f.password} onChange={set("password")} autoComplete="new-password" />
      </div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
        <span>
          I confirm I am 18 or older, live in a jurisdiction where betting is permitted, and accept the{" "}
          <Link to="/help" hash="terms" className="underline">
            terms and privacy policy
          </Link>
          .
        </span>
      </label>
      <Button type="submit" className="w-full font-bold uppercase" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link to="/auth" className="font-semibold text-primary">
          Log in
        </Link>
      </p>
    </form>
  );
}

function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
  }

  return sent ? (
    <div className="space-y-3 text-center">
      <MailCheck className="mx-auto h-10 w-10 text-primary" />
      <p className="text-sm">If an account exists for {email}, a reset link is on its way.</p>
      <Link to="/auth" className="text-sm font-semibold text-primary">
        Back to log in
      </Link>
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="font-display text-2xl font-black uppercase">Reset password</h1>
      <div className="space-y-1.5">
        <Label htmlFor="fp-email">Email</Label>
        <Input id="fp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button type="submit" className="w-full font-bold uppercase" disabled={busy}>
        Send reset link
      </Button>
      <Link to="/auth" className="block text-center text-sm text-primary">
        Back to log in
      </Link>
    </form>
  );
}
