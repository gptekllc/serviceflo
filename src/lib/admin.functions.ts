import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppRole } from "@/lib/auth.functions";

type AuthContext = {
  supabase: {
    rpc: typeof import("@/integrations/supabase/client").supabase.rpc;
  };
  userId: string;
};

export type AdminManagedUser = {
  id: string;
  email: string;
  role: AppRole | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  isDeactivated: boolean;
};

const CreateUserInputSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["coordinator", "attendee"]).default("attendee"),
  emailConfirmed: z.boolean().default(true),
});

const UpdateUserRoleInputSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["coordinator", "attendee"]),
});

const SetUserDeactivatedInputSchema = z.object({
  userId: z.string().uuid(),
  deactivated: z.boolean(),
});

const ResetUserPasswordInputSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8).max(128),
});

async function ensureCoordinator(context: AuthContext) {
  const { data: isCoordinator, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "coordinator",
  });
  if (error) throw new Error(error.message);
  if (!isCoordinator) throw new Error("Forbidden: coordinator access required.");
}

export const createUserByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => CreateUserInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<{ userId: string; role: AppRole }> => {
    await ensureCoordinator(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: data.emailConfirmed,
    });

    if (createError) throw new Error(createError.message);

    const userId = created.user?.id;
    if (!userId) throw new Error("User creation failed: missing user id.");

    const { error: roleInsertError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });

    if (roleInsertError) throw new Error(roleInsertError.message);

    return {
      userId,
      role: data.role,
    };
  });

export const listManagedUsersByAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminManagedUser[] }> => {
    await ensureCoordinator(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const allUsers: Array<{
      id: string;
      email?: string;
      created_at?: string;
      last_sign_in_at?: string;
      banned_until?: string;
    }> = [];

    let page = 1;
    const perPage = 200;
    // Pull every page so larger teams are fully visible in admin settings.
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      const pageUsers = data.users ?? [];
      allUsers.push(...pageUsers);
      if (pageUsers.length < perPage) break;
      page += 1;
    }

    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (roleError) throw new Error(roleError.message);

    const roleByUserId = new Map<string, AppRole>();
    for (const row of (roleRows ?? []) as Array<{ user_id: string; role: AppRole }>) {
      const current = roleByUserId.get(row.user_id);
      if (current === "coordinator") continue;
      roleByUserId.set(row.user_id, row.role);
    }

    const now = Date.now();
    const users: AdminManagedUser[] = allUsers
      .map((user) => {
        const bannedUntil = user.banned_until ? new Date(user.banned_until).getTime() : 0;
        return {
          id: user.id,
          email: user.email ?? "(no email)",
          role: roleByUserId.get(user.id) ?? null,
          createdAt: user.created_at ?? null,
          lastSignInAt: user.last_sign_in_at ?? null,
          isDeactivated: bannedUntil > now,
        };
      })
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    return { users };
  });

export const updateUserRoleByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => UpdateUserRoleInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<{ userId: string; role: AppRole }> => {
    await ensureCoordinator(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: deleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (deleteError) throw new Error(deleteError.message);

    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (insertError) throw new Error(insertError.message);

    return { userId: data.userId, role: data.role };
  });

export const setUserDeactivatedByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => SetUserDeactivatedInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<{ userId: string; deactivated: boolean }> => {
    await ensureCoordinator(context);
    if (data.userId === context.userId && data.deactivated) {
      throw new Error("You cannot deactivate your own account.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.deactivated ? "876000h" : "none",
    });
    if (error) throw new Error(error.message);

    return { userId: data.userId, deactivated: data.deactivated };
  });

export const resetUserPasswordByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => ResetUserPasswordInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<{ userId: string }> => {
    await ensureCoordinator(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);

    return { userId: data.userId };
  });
