import { cn } from "@/lib/utils";

/** Muted monochrome football used for Draw / neutral outcomes (never a colourful emoji). */
export function SoccerBallIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0 text-muted-foreground", className)}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7.2l3.6 2.6-1.4 4.2H9.8L8.4 9.8z" fill="currentColor" />
      <path
        d="M12 7.2V2.4M15.6 9.8l4.4-1.6M14.2 14l2.8 3.8M9.8 14L7 17.8M8.4 9.8L4 8.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
