import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarClock, Home, Radio, Search, ShieldCheck, Trophy } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { useCompetitions, useLiveCount } from "@/lib/sportsbook";
import { cn } from "@/lib/utils";

const linkCls =
  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const activeCls = "bg-sidebar-accent text-primary";

export function SportsNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: comps } = useCompetitions();
  const { data: liveCount } = useLiveCount();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const bySport = (sport: "football" | "futsal") => (comps ?? []).filter((c) => c.sport === sport);

  return (
    <nav className="space-y-5 p-3" aria-label="Sports">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ to: "/", search: { q: q || undefined } });
          onNavigate?.();
        }}
        className="relative"
      >
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search teams or leagues"
          className="h-9 bg-background pl-8 text-sm"
          aria-label="Search teams or leagues"
        />
      </form>

      <div className="space-y-0.5">
        <Link to="/" className={linkCls} activeProps={{ className: activeCls }} activeOptions={{ exact: true, includeSearch: false }} onClick={onNavigate}>
          <Home className="h-4 w-4" /> Home
        </Link>
        <Link to="/live" className={linkCls} activeProps={{ className: activeCls }} onClick={onNavigate}>
          <Radio className="h-4 w-4 text-live" /> In-Play
          {!!liveCount && (
            <span className="ml-auto rounded bg-live px-1.5 text-[11px] font-bold text-live-foreground tabular">
              {liveCount}
            </span>
          )}
        </Link>
        <Link to="/upcoming" className={linkCls} activeProps={{ className: activeCls }} onClick={onNavigate}>
          <CalendarClock className="h-4 w-4" /> Upcoming
        </Link>
      </div>

      {(["football", "futsal"] as const).map((sport) => (
        <div key={sport}>
          <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {sport === "football" ? "Football" : "Futsal"}
          </p>
          <div className="space-y-0.5">
            {bySport(sport).map((c) => (
              <Link
                key={c.id}
                to="/competition/$id"
                params={{ id: c.id }}
                className={cn(linkCls, "py-1.5")}
                activeProps={{ className: activeCls }}
                onClick={onNavigate}
              >
                <Trophy className={cn("h-3.5 w-3.5", c.is_featured ? "text-primary" : "text-muted-foreground")} />
                <span className="truncate">{c.name}</span>
                <span className="ml-auto text-[10px] uppercase text-muted-foreground">{c.country.slice(0, 3)}</span>
              </Link>
            ))}
            {bySport(sport).length === 0 && <p className="px-3 text-xs text-muted-foreground">No competitions</p>}
          </div>
        </div>
      ))}

      <Link
        to="/responsible-gambling"
        className="flex items-start gap-2 rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground hover:text-foreground"
        onClick={onNavigate}
      >
        <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
        <span>
          <span className="block font-semibold text-foreground">Play responsibly</span>
          Set limits, take a break or self-exclude at any time.
        </span>
      </Link>
    </nav>
  );
}
