import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { parseRpcError } from "@/lib/betting";
import { ROLE_LABEL, STAFF_CATEGORIES } from "@/lib/staff";
import { createStaffAccount, setStaffPassword } from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  head: () => ({
    meta: [
      { title: "Staff | Pitchside Back Office" },
      { name: "description", content: "Add and remove back-office staff by category." },
      { property: "og:title", content: "Staff | Pitchside Back Office" },
      { property: "og:description", content: "Manage staff categories." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StaffPage,
});

function CategorySelect({ value, onChange }: { value: AppRole; onChange: (r: AppRole) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AppRole)}>
      <SelectTrigger aria-label="Category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAFF_CATEGORIES.map((c) => (
          <SelectItem key={c.role} value={c.role}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StaffPage() {
  const { can, roles, user } = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("finance_admin");
  const [pwFor, setPwFor] = useState<{ id: string; email: string | null } | null>(null);
  const [newPw, setNewPw] = useState("");
  const isSuper = roles.includes("super_admin");

  const staff = useQuery({
    queryKey: ["admin", "staff"],
    enabled: isSuper,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_staff");
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "staff"] });

  const add = useMutation({
    mutationFn: async () => {
      if (mode === "new") {
        await createStaffAccount({ data: { email, password, fullName, role } });
      } else {
        const { error } = await supabase.rpc("admin_add_staff_by_email", { _email: email, _role: role });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(
        mode === "new" ? `Staff login created. They can sign in now as ${ROLE_LABEL[role]}.` : `Added as ${ROLE_LABEL[role]}`,
      );
      setEmail("");
      setFullName("");
      setPassword("");
      refresh();
    },
    onError: (e) => toast.error(parseRpcError(e).message),
  });

  const changePw = useMutation({
    mutationFn: async () => {
      await setStaffPassword({ data: { userId: pwFor!.id, password: newPw } });
    },
    onSuccess: () => {
      toast.success("Password updated");
      setPwFor(null);
      setNewPw("");
    },
    onError: (e) => toast.error(parseRpcError(e).message),
  });

  const revoke = useMutation({
    mutationFn: async ({ userId, r }: { userId: string; r: AppRole }) => {
      const { error } = await supabase.rpc("admin_set_role", { _user: userId, _role: r, _grant: false });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role removed");
      refresh();
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => toast.error(parseRpcError(e).message),
  });

  if (!isSuper || !can("settings")) {
    return <p className="text-sm text-muted-foreground">Only a super admin can manage staff.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Each category signs in on the staff login page with email and password, and only sees its own sections.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "new" && password.length < 8) return toast.error("Password must be at least 8 characters.");
          add.mutate();
        }}
        className="space-y-3 rounded-lg border border-border bg-card p-4"
      >
        <Tabs value={mode} onValueChange={(v) => setMode(v as "new" | "existing")}>
          <TabsList className="grid w-full grid-cols-2 sm:w-96">
            <TabsTrigger value="new">New staff login</TabsTrigger>
            <TabsTrigger value="existing">Existing account</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid gap-3 sm:grid-cols-2">
          {mode === "new" && (
            <div className="space-y-1.5">
              <Label htmlFor="staff-name">Full name</Label>
              <Input id="staff-name" required minLength={2} maxLength={80} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="staff-email">{mode === "new" ? "Email (used to sign in)" : "Registered email"}</Label>
            <Input id="staff-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          {mode === "new" && (
            <div className="space-y-1.5">
              <Label htmlFor="staff-password">Password</Label>
              <Input
                id="staff-password"
                type="text"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <CategorySelect value={role} onChange={setRole} />
          </div>
        </div>
        <Button type="submit" disabled={add.isPending} className="gap-1.5 font-bold">
          <UserPlus className="h-4 w-4" /> {mode === "new" ? "Create staff login" : "Add staff"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {staff.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : staff.isError ? (
          <p className="p-4 text-sm text-destructive">{parseRpcError(staff.error).message}</p>
        ) : (
          <ul className="divide-y divide-border">
            {staff.data!.map((s) => (
              <li key={s.user_id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {s.full_name || s.username || "Unnamed"} {s.user_id === user?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(s.roles ?? []).map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                      {ROLE_LABEL[r]}
                      <button
                        type="button"
                        aria-label={`Remove ${ROLE_LABEL[r]} from ${s.email}`}
                        disabled={revoke.isPending}
                        onClick={() => {
                          if (confirm(`Remove ${ROLE_LABEL[r]} from ${s.email}?`)) revoke.mutate({ userId: s.user_id, r });
                        }}
                        className="rounded-full hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setPwFor({ id: s.user_id, email: s.email })}>
                    <KeyRound className="h-3 w-3" /> Set password
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!pwFor} onOpenChange={(o) => !o && (setPwFor(null), setNewPw(""))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newPw.length < 8) return toast.error("Password must be at least 8 characters.");
              changePw.mutate();
            }}
            className="space-y-3"
          >
            <p className="text-sm text-muted-foreground">New password for {pwFor?.email}</p>
            <Input
              type="text"
              autoComplete="new-password"
              aria-label="New password"
              value={newPw}
              minLength={8}
              maxLength={72}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
            />
            <Button type="submit" className="w-full font-bold" disabled={changePw.isPending}>
              Save password
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
