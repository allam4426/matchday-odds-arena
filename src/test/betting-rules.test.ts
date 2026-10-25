import { describe, expect, it } from "vitest";

import { combinedOdds, parseRpcError, potentialReturnMinor } from "@/lib/betting";
import { maskAccount, parseMoneyToMinor } from "@/lib/money";

describe("bet maths", () => {
  it("multiplies accumulator odds and rounds to 2 decimals", () => {
    expect(combinedOdds([1.55, 2.45, 1.85])).toBe(7.03);
  });

  it("floors the potential return in minor units", () => {
    // 1.15 * 100 is 114.99999999999999 in floating point; must still be 115
    expect(potentialReturnMinor(100, 1.15)).toBe(115);
    expect(potentialReturnMinor(1000, 2.45)).toBe(2450);
  });

  it("caps the potential return at the max payout", () => {
    expect(potentialReturnMinor(100_000, 500, 5_000_000)).toBe(5_000_000);
  });

  it("returns zero for an empty stake", () => {
    expect(potentialReturnMinor(0, 3.2)).toBe(0);
  });
});

describe("money", () => {
  it("parses typed amounts into minor units", () => {
    expect(parseMoneyToMinor("12.5")).toBe(1250);
    expect(parseMoneyToMinor("1,000.05")).toBe(100005);
  });

  it("rejects amounts with more than 2 decimals or junk", () => {
    expect(parseMoneyToMinor("1.234")).toBeNull();
    expect(parseMoneyToMinor("-5")).toBeNull();
    expect(parseMoneyToMinor("abc")).toBeNull();
  });

  it("masks bank account numbers to the last 4 digits", () => {
    expect(maskAccount("1234567890")).toBe("•••• 7890");
  });
});

describe("server error parsing", () => {
  it("splits CODE|message errors", () => {
    expect(parseRpcError({ message: "ODDS_CHANGED|[...]" })).toEqual({ code: "ODDS_CHANGED", message: "[...]" });
  });
  it("falls back to UNKNOWN", () => {
    expect(parseRpcError(new Error("boom")).code).toBe("UNKNOWN");
  });
});
