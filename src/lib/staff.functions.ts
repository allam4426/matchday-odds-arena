import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["super_admin", "finance_admin", "sports_trader", "support_agent", "auditor"] as const;

async function assertSuperAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
  if (error || !data) throw new Error("FORBIDDEN|Super admin only");
}

/** Super admin creates a ready-to-use staff login (email + password) in one step. */
export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      email: z.string().trim().email().max(255),
      password: z.string().min(8, "Password must be at least 8 characters").max(72),
      fullName: z.string().trim().min(2).max(80),
      role: z.enum(ROLES),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const base = data.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16) || "staff";
    const username = `${base}_${Math.random().toString(36).slice(2, 6)}`;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        username,
        country: "MV",
        // Staff accounts skip the customer age form; profiles require a date.
        date_of_birth: "1970-01-01",
        staff_account: true,
      },
    });
    if (error || !created.user) {
      const msg = error?.message ?? "Could not create account";
      if (/already/i.test(msg)) throw new Error("CONFLICT|An account with this email already exists. Use \"Existing account\" instead.");
      throw new Error(`INVALID|${msg}`);
    }

    // Grant the role as the signed-in super admin so it is audited.
    const { error: roleErr } = await context.supabase.rpc("admin_set_role", {
      _user: created.user.id,
      _role: data.role,
      _grant: true,
    });
    if (roleErr) throw new Error(roleErr.message);
    // Accounts created by a super admin are pre-approved.
    await supabaseAdmin.from("profiles").update({ approved: true }).eq("id", created.user.id);
    return { userId: created.user.id };
  });

/** Super admin sets a new password for an existing staff member. */
export const setStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      userId: z.string().uuid(),
      password: z.string().min(8, "Password must be at least 8 characters").max(72),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.userId);
    if (!count) throw new Error("FORBIDDEN|Passwords can only be set for staff accounts");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(`INVALID|${error.message}`);
    return { ok: true };
  });
