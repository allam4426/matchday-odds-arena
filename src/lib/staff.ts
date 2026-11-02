import { Banknote, Crown, Eye, Headset, Trophy, type LucideIcon } from "lucide-react";

import type { AppRole } from "@/hooks/use-auth";

export type StaffCategory = {
  role: AppRole;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Where this category lands after staff login. */
  home: "/admin" | "/admin/deposits" | "/admin/matches" | "/admin/users";
};

export const STAFF_CATEGORIES: StaffCategory[] = [
  { role: "super_admin", label: "Super Admin", description: "Full control, staff and settings", icon: Crown, home: "/admin" },
  { role: "finance_admin", label: "Finance", description: "Deposits, withdrawals, bank slips", icon: Banknote, home: "/admin/deposits" },
  { role: "sports_trader", label: "Sports Trader", description: "Matches, odds and settlement", icon: Trophy, home: "/admin/matches" },
  { role: "support_agent", label: "Support", description: "Registrations and customer accounts", icon: Headset, home: "/admin/users" },
  { role: "auditor", label: "Auditor", description: "Read-only review of payments", icon: Eye, home: "/admin" },
];

export const ROLE_LABEL: Record<AppRole, string> = Object.fromEntries(
  STAFF_CATEGORIES.map((c) => [c.role, c.label]),
) as Record<AppRole, string>;

export type AdminNavItem = {
  to: "/admin" | "/admin/matches" | "/admin/deposits" | "/admin/withdrawals" | "/admin/users" | "/admin/settings" | "/admin/staff";
  label: string;
  exact?: boolean;
  roles: AppRole[] | "all";
};

/** Back-office sections each staff category can open. The backend re-checks every action. */
export const ADMIN_NAV: AdminNavItem[] = [
  { to: "/admin", label: "Overview", exact: true, roles: "all" },
  { to: "/admin/matches", label: "Matches & Odds", roles: ["super_admin", "sports_trader"] },
  { to: "/admin/deposits", label: "Deposits", roles: ["super_admin", "finance_admin", "auditor"] },
  { to: "/admin/withdrawals", label: "Withdrawals", roles: ["super_admin", "finance_admin", "auditor"] },
  { to: "/admin/users", label: "Registrations", roles: ["super_admin", "support_agent"] },
  { to: "/admin/settings", label: "Bank settings", roles: ["super_admin", "finance_admin"] },
  { to: "/admin/staff", label: "Staff", roles: ["super_admin"] },
];

export function navFor(roles: AppRole[]) {
  return ADMIN_NAV.filter((n) => n.roles === "all" || n.roles.some((r) => roles.includes(r)));
}

/** A staff member may sign in under a category if they hold that role, or are a super admin. */
export function canUseCategory(roles: AppRole[], category: AppRole) {
  return roles.includes(category) || roles.includes("super_admin");
}
