import { MvrSymbol } from "@/components/MvrSymbol";
import { formatMoney } from "@/lib/money";

/** Renders an amount in minor units; MVR amounts use the official Rufiyaa sign. */
export function Money({ minor, currency = "MVR", className }: { minor: number | null | undefined; currency?: string; className?: string }) {
  if (currency !== "MVR") return <span className={className}>{formatMoney(minor, currency)}</span>;
  const value = ((minor ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span className={className ? `${className} whitespace-nowrap` : "whitespace-nowrap"}>
      <MvrSymbol className="mr-[0.2em]" />
      {value}
    </span>
  );
}
