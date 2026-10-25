/** All money is stored and moved in integer minor units (e.g. cents). */

export function formatMoney(minor: number | null | undefined, currency = "USD"): string {
  const value = (minor ?? 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Parse a user-typed amount like "12.5" or "1,000.00" into minor units. Returns null when invalid. */
export function parseMoneyToMinor(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function minorToInput(minor: number | null | undefined): string {
  if (minor == null) return "";
  return (minor / 100).toFixed(2);
}

/** Mask a bank account number for ordinary display: ••••1234 */
export function maskAccount(num: string | null | undefined): string {
  if (!num) return "";
  const tail = num.slice(-4);
  return `•••• ${tail}`;
}
