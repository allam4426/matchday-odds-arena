import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseRpcError } from "@/lib/betting";
import { countryName } from "@/lib/countries";
import { minorToInput, parseMoneyToMinor } from "@/lib/money";
import { useSettings } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account & Responsible Gambling Limits | Pitchside" },
      { name: "description", content: "Manage your profile, deposit and stake limits, breaks and self-exclusion." },
      { property: "og:title", content: "Account | Pitchside" },
      { property: "og:description", content: "Profile, limits, breaks and self-exclusion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-3xl font-black uppercase">Account</h1>
      <ProfileCard />
      <LimitsCard />
      <BreakCard />
    </div>
  );
}

function ProfileCard() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile]);

  async function save() {
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim(), phone: phone.trim() }).eq("id", user!.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  if (!profile) return null;
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Profile</h2>
        <StatusBadge status={profile.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Username</dt>
          <dd className="font-semibold">{profile.username}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="truncate font-semibold">{profile.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Country</dt>
          <dd className="font-semibold">{countryName(profile.country)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Date of birth</dt>
          <dd className="font-semibold">{format(new Date(profile.date_of_birth), "d MMM yyyy")}</dd>
        </div>
      </dl>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-name">Full legal name</Label>
          <Input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-phone">Mobile</Label>
          <Input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <Button size="sm" onClick={save}>
        Save profile
      </Button>
      {profile.self_excluded_until && new Date(profile.self_excluded_until) > new Date() && (
        <p className="rounded-md bg-warning/10 p-2 text-sm text-warning">
          Self-excluded until {format(new Date(profile.self_excluded_until), "d MMM yyyy")}.
        </p>
      )}
      {profile.cooling_off_until && new Date(profile.cooling_off_until) > new Date() && (
        <p className="rounded-md bg-warning/10 p-2 text-sm text-warning">
          On a break until {format(new Date(profile.cooling_off_until), "d MMM yyyy, HH:mm")}.
        </p>
      )}
    </section>
  );
}

function LimitsCard() {
  const { user } = useAuth();
  const { currency } = useSettings();
  const queryClient = useQueryClient();
  const { data: limits } = useQuery({
    queryKey: ["rg-limits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("rg_limits").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [f, setF] = useState({ dd: "", wd: "", ds: "", rem: "60" });
  useEffect(() => {
    if (!limits) return;
    setF({
      dd: minorToInput(limits.daily_deposit_limit_minor),
      wd: minorToInput(limits.weekly_deposit_limit_minor),
      ds: minorToInput(limits.daily_stake_limit_minor),
      rem: String(limits.session_reminder_minutes),
    });
  }, [limits]);

  async function save() {
    const toMinor = (s: string) => (s.trim() ? parseMoneyToMinor(s) : null);
    const vals = [toMinor(f.dd), toMinor(f.wd), toMinor(f.ds)];
    if ([f.dd, f.wd, f.ds].some((s, i) => s.trim() && !vals[i])) return toast.error("Enter valid amounts or leave blank for no limit.");
    const { error } = await supabase.rpc("set_rg_limits", {
      _daily_deposit: vals[0] as number,
      _weekly_deposit: vals[1] as number,
      _daily_stake: vals[2] as number,
      _reminder_minutes: Number(f.rem),
    });
    if (error) return toast.error(parseRpcError(error).message);
    toast.success("Limits saved");
    queryClient.invalidateQueries({ queryKey: ["rg-limits"] });
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="text-lg font-bold">Limits & reminders</h2>
        <p className="text-xs text-muted-foreground">Leave blank for no limit. Lowering is instant; raising or removing waits 24 hours.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {(
          [
            ["dd", "Daily deposit"],
            ["wd", "Weekly deposit"],
            ["ds", "Daily stake"],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={`lim-${k}`}>
              {label} ({currency})
            </Label>
            <Input id={`lim-${k}`} inputMode="decimal" className="font-mono" placeholder="No limit" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <div className="space-y-1.5">
          <Label>Reality check</Label>
          <Select value={f.rem} onValueChange={(v) => setF({ ...f, rem: v })}>
            <SelectTrigger aria-label="Reality check interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Off</SelectItem>
              <SelectItem value="15">Every 15 min</SelectItem>
              <SelectItem value="30">Every 30 min</SelectItem>
              <SelectItem value="60">Every 60 min</SelectItem>
              <SelectItem value="120">Every 2 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button size="sm" onClick={save}>
        Save limits
      </Button>
    </section>
  );
}

function BreakCard() {
  const queryClient = useQueryClient();
  const [hours, setHours] = useState("24");
  const [days, setDays] = useState("180");

  async function takeBreak() {
    const { error } = await supabase.rpc("take_break", { _hours: Number(hours) });
    if (error) return toast.error(parseRpcError(error).message);
    toast.success("Break started");
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }
  async function exclude() {
    const { error } = await supabase.rpc("self_exclude", { _days: Number(days) });
    if (error) return toast.error(parseRpcError(error).message);
    toast.success("Self-exclusion active");
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
      <div className="space-y-2">
        <h2 className="text-lg font-bold">Take a break</h2>
        <p className="text-xs text-muted-foreground">Blocks betting and deposits for the chosen period. Cannot be undone early.</p>
        <Select value={hours} onValueChange={setHours}>
          <SelectTrigger aria-label="Break length">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24">24 hours</SelectItem>
            <SelectItem value="72">3 days</SelectItem>
            <SelectItem value="168">7 days</SelectItem>
            <SelectItem value="720">30 days</SelectItem>
          </SelectContent>
        </Select>
        <ConfirmButton label="Start break" title="Start a break?" description="You won't be able to bet or deposit until the break ends." onConfirm={takeBreak} />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-bold">Self-exclude</h2>
        <p className="text-xs text-muted-foreground">Blocks betting and deposits long-term. You can still withdraw your balance.</p>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger aria-label="Self-exclusion length">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="180">6 months</SelectItem>
            <SelectItem value="365">1 year</SelectItem>
            <SelectItem value="1825">5 years</SelectItem>
          </SelectContent>
        </Select>
        <ConfirmButton
          label="Self-exclude"
          destructive
          title="Self-exclude?"
          description="This cannot be reversed before the period ends. Betting and deposits will be blocked."
          onConfirm={exclude}
        />
      </div>
    </section>
  );
}

function ConfirmButton({
  label,
  title,
  description,
  onConfirm,
  destructive,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={destructive ? "destructive" : "secondary"}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
