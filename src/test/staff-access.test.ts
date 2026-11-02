import { describe, expect, it } from "vitest";

import { canUseCategory, navFor } from "@/lib/staff";

const labels = (roles: Parameters<typeof navFor>[0]) => navFor(roles).map((n) => n.label);

describe("staff categories", () => {
  it("finance staff see only payment sections", () => {
    expect(labels(["finance_admin"])).toEqual(["Overview", "Deposits", "Withdrawals", "Bank settings"]);
  });

  it("sports traders see matches but not payments or staff", () => {
    expect(labels(["sports_trader"])).toEqual(["Overview", "Matches & Odds"]);
  });

  it("support agents see registrations", () => {
    expect(labels(["support_agent"])).toEqual(["Overview", "Registrations"]);
  });

  it("only super admins see the Staff page", () => {
    expect(labels(["super_admin"])).toContain("Staff");
    expect(labels(["finance_admin", "sports_trader", "support_agent", "auditor"])).not.toContain("Staff");
  });

  it("staff can only log in under a category they hold, super admins under any", () => {
    expect(canUseCategory(["finance_admin"], "sports_trader")).toBe(false);
    expect(canUseCategory(["finance_admin"], "finance_admin")).toBe(true);
    expect(canUseCategory(["super_admin"], "support_agent")).toBe(true);
    expect(canUseCategory([], "super_admin")).toBe(false);
  });
});
