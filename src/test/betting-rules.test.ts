import { describe, expect, it } from "vitest";

import { combinedOdds, parseRpcError, potentialReturnMinor, rawComboOdds, selectionDisplay, selectionSide } from "@/lib/betting";
import { maskAccount, parseMoneyToMinor } from "@/lib/money";
import { DEFAULT_SETTINGS } from "@/lib/settings";

describe("bet maths", () => {
  it("multiplies accumulator odds and rounds to 2 decimals", () => {
    expect(rawComboOdds([1.55, 2.45, 1.85])).toBe(7.03);
  });

  it("pays full combo odds up to the reduction threshold", () => {
    expect(combinedOdds([1.55, 2.45, 1.85], 10)).toBe(7.03);
  });

  it("smoothly reduces big combos instead of capping them", () => {
    // The 5-fold from the client's ticket: 189.23 full odds
    const legs = [2.17, 2.15, 2.19, 4.19, 4.42];
    expect(rawComboOdds(legs)).toBe(189.23);
    expect(combinedOdds(legs, 10)).toBe(43.5);
    // Still grows with more/bigger legs — no hard limit
    expect(combinedOdds([...legs, 3], 10)).toBeGreaterThan(combinedOdds(legs, 10));
  });

  it("floors the potential return in minor units", () => {
    // 1.15 * 100 is 114.99999999999999 in floating point; must still be 115
    expect(potentialReturnMinor(100, 1.15)).toBe(115);
    expect(potentialReturnMinor(1000, 2.45)).toBe(2450);
  });

  it("caps the potential return at the max payout", () => {
    expect(potentialReturnMinor(100_000, 500, 2_500_000)).toBe(2_500_000);
  });

  it("returns zero for an empty stake", () => {
    expect(potentialReturnMinor(0, 3.2)).toBe(0);
  });
});

describe("house defaults", () => {
  it("minimum stake is 50 MVR", () => {
    expect(DEFAULT_SETTINGS.min_stake_minor).toBe(5000);
  });
  it("maximum payout per ticket is 25,000 MVR", () => {
    expect(DEFAULT_SETTINGS.max_payout_minor).toBe(2_500_000);
  });
});

describe("bet slip selection display", () => {
  it("maps outcomes to the backed team", () => {
    expect(selectionSide("1")).toBe("home");
    expect(selectionSide("2")).toBe("away");
    expect(selectionSide("X")).toBe("neutral");
    expect(selectionSide("Over 2.5", "Total Goals 2.5")).toBe("neutral");
    expect(selectionSide("Home -1.5", "Asian Handicap -1.5")).toBe("home");
  });
  it("shows team names and Draw instead of 1 / X / 2", () => {
    expect(selectionDisplay("1", "Arsenal", "Chelsea")).toBe("Arsenal");
    expect(selectionDisplay("2", "Arsenal", "Chelsea")).toBe("Chelsea");
    expect(selectionDisplay("X", "Arsenal", "Chelsea")).toBe("Draw");
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
