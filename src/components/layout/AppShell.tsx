import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,

  Home,
  Menu,
  Radio,
  ReceiptText,
  Shield,
  Ticket,
  User,
  Wallet,
} from "lucide-react";

import { BetSlip } from "@/components/betslip/BetSlip";
import { useBetSlip } from "@/components/betslip/bet-slip-context";
import { SportsNav } from "@/components/layout/SportsNav";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney } from "@/lib/money";
import { Money } from "@/components/Money";
import { useSettings } from "@/lib/settings";
import { useWalletSummary } from "@/lib/wallet";
import { cn } from "@/lib/utils";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-1.5" aria-label="Pitchside home">
      <span className="grid h-7 w-7 place-items-center rounded bg-primary font-display text-base font-black text-primary-foreground">
        P
      </span>
      <span className="font-display text-xl font-black uppercase tracking-wider">
        Pitch<span className="text-primary">side</span>
      </span>
    </Link>
  );
}

const NAV = [
  { to: "/", label: "Home" },
  { to: "/live", label: "In-Play" },
  { to: "/upcoming", label: "Upcoming" },
  { to: "/my-bets", label: "My Bets" },
  { to: "/wallet", label: "Wallet" },
  { to: "/help", label: "Help" },
] as const;

function NotificationsBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const unread = (data ?? []).filter((n) => !n.read_at).length;

  async function markAll() {
    const ids = (data ?? []).filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <Popover onOpenChange={(o) => !o && markAll()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-live px-1 text-[10px] font-bold text-live-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-sm font-semibold">Notifications</div>
        <div className="max-h-96 overflow-y-auto">
          {(data ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>}
          {(data ?? []).map((n) => (
            <div key={n.id} className={cn("border-b border-border px-3 py-2 last:border-0", !n.read_at && "bg-primary/5")}>
              <p className="text-sm font-semibold">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountArea() {
  const { user, profile, isStaff, signOut, loading } = useAuth();
  const settings = useSettings();
  const { data: wallet } = useWalletSummary();

  if (loading) return <div className="h-9 w-32" />;
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/auth">Log in</Link>
        </Button>
        <Button asChild size="sm" className="font-bold">
          <Link to="/auth" search={{ mode: "signup" }}>
            Register
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Link
        to="/wallet"
        search={{ tab: "deposit" }}
        aria-label="Wallet and deposit"
        className="flex items-center gap-2 rounded-md border border-primary/60 py-1 pl-2.5 pr-1 hover:bg-secondary"
      >
        <span className="font-mono text-sm font-bold text-foreground tabular">
          <Money minor={wallet?.available_minor ?? 0} currency={settings.currency} />
        </span>
        <span className="grid h-7 w-8 place-items-center rounded bg-primary text-primary-foreground">
          <Wallet className="h-4 w-4" />
        </span>
      </Link>
      <NotificationsBell />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Account menu">
            <User className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="text-sm">{profile?.username ?? "Account"}</div>
            <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/wallet">Wallet · <Money minor={wallet?.available_minor ?? 0} currency={settings.currency} /></Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/wallet" search={{ tab: "history" }}>
              Transactions
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/my-bets">My bets</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/account">Account & limits</Link>
          </DropdownMenuItem>
          {isStaff && (
            <DropdownMenuItem asChild>
              <Link to="/admin">
                <Shield className="mr-2 h-4 w-4" /> Admin portal
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()}>Log out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MobileBottomNav() {
  const slip = useBetSlip();
  const { user } = useAuth();
  const item = "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
  const active = { className: "text-primary" };
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-header pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary"
    >
      <Link to="/" className={item} activeProps={active} activeOptions={{ exact: true, includeSearch: false }}>
        <Home className="h-5 w-5" /> Home
      </Link>
      <Link to="/live" className={item} activeProps={active}>
        <Radio className="h-5 w-5" /> Live
      </Link>
      <button type="button" className={cn(item, "relative")} onClick={() => slip.setMobileOpen(true)}>
        <span className="relative">
          <Ticket className="h-5 w-5" />
          {slip.items.length > 0 && (
            <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {slip.items.length}
            </span>
          )}
        </span>
        Bet Slip
      </button>
      <Link to="/my-bets" className={item} activeProps={active}>
        <ReceiptText className="h-5 w-5" /> My Bets
      </Link>
      <Link to={user ? "/wallet" : "/auth"} className={item} activeProps={active}>
        <Wallet className="h-5 w-5" /> {user ? "Wallet" : "Log in"}
      </Link>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-8 border-t border-border px-4 py-6 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-destructive font-bold text-foreground">
          18+
        </span>
        <Link to="/responsible-gambling" className="hover:text-foreground">
          Responsible gambling
        </Link>
        <Link to="/help" className="hover:text-foreground">
          Help & rules
        </Link>
        <Link to="/help" hash="terms" className="hover:text-foreground">
          Terms & privacy
        </Link>
      </div>
      <p className="mt-3 max-w-3xl leading-relaxed">
        Gambling can be addictive. Only bet what you can afford to lose. Betting is restricted to adults of legal age in
        permitted jurisdictions. If gambling is affecting you or someone you know, seek free confidential support from
        a local gambling help service.
      </p>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const slip = useBetSlip();
  const settings = useSettings();
  const isAdmin = location.pathname.startsWith("/admin");
  const isAuthPage = location.pathname === "/auth" || location.pathname === "/reset-password";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-header/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
          {!isAdmin && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" aria-label="Open sports menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[290px] overflow-y-auto bg-sidebar p-0">
                <SheetHeader className="border-b border-border p-4">
                  <SheetTitle asChild>
                    <div>
                      <Logo />
                    </div>
                  </SheetTitle>
                </SheetHeader>
                <SportsNav />
              </SheetContent>
            </Sheet>
          )}
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-primary" }}
                activeOptions={{ exact: n.to === "/", includeSearch: false }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <AccountArea />
          </div>
        </div>
      </header>

      {isAdmin || isAuthPage ? (
        <main className="pb-20 lg:pb-0">{children}</main>
      ) : (
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_340px]">
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-border bg-sidebar lg:block">
            <SportsNav />
          </aside>
          <main className="min-w-0 px-3 pb-24 pt-4 sm:px-4 lg:pb-6">
            {children}
            <Footer />
          </main>
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] border-l border-border bg-card xl:block">
            <BetSlip />
          </aside>
        </div>
      )}

      {/* Bet slip drawer for mobile & tablet */}
      <Sheet open={slip.mobileOpen} onOpenChange={slip.setMobileOpen}>
        <SheetContent side="bottom" className="h-[88vh] rounded-t-xl bg-card p-0 [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Bet slip</SheetTitle>
          </SheetHeader>
          <BetSlip onClose={() => slip.setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Tablet-desktop floating slip button (no right sidebar below xl) */}
      {!isAdmin && slip.items.length > 0 && (
        <button
          type="button"
          onClick={() => slip.setMobileOpen(true)}
          className="fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground shadow-lg lg:flex xl:hidden"
        >
          <Ticket className="h-4 w-4" /> Bet slip ({slip.items.length})
        </button>
      )}

      {!isAdmin && <MobileBottomNav />}
    </div>
  );
}

