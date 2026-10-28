import { describe, expect, it } from "vitest";

import { priceMatch } from "@/lib/pricing";

const all = (r: ReturnType<typeof priceMatch>) => Object.values(r.odds).flat();

describe("odds limits", () => {
  it("never offers more than 10.00 in the first half", () => {
    const r = priceMatch({ minute: 9, homeScore: 0, awayScore: 2 });
    expect(Math.max(...all(r))).toBeLessThanOrEqual(10);
  });

  it("never offers more than 25.00 after the first half", () => {
    const r = priceMatch({ minute: 70, homeScore: 0, awayScore: 2 });
    expect(Math.max(...all(r))).toBeLessThanOrEqual(25);
  });
});
