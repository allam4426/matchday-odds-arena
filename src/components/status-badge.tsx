import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  success: "bg-success/15 text-success border-success/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  info: "bg-secondary text-secondary-foreground border-border",
  primary: "bg-primary/15 text-primary border-primary/30",
  muted: "bg-muted text-muted-foreground border-border",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  approved: "success",
  paid: "success",
  won: "success",
  active: "success",
  open: "primary",
  live: "danger",
  pending: "warning",
  under_review: "warning",
  requested: "warning",
  pending_review: "warning",
  processing: "info",
  scheduled: "info",
  suspended: "warning",
  rejected: "danger",
  failed: "danger",
  lost: "danger",
  closed: "danger",
  self_excluded: "warning",
  cancelled: "muted",
  void: "muted",
  settled: "muted",
  finished: "muted",
  postponed: "warning",
  abandoned: "muted",
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
