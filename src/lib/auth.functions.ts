import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRole = "coordinator" | "attendee";

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ role: AppRole | null }> => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return { role: null };
    if (data.some((r) => r.role === "coordinator")) return { role: "coordinator" };
    return { role: "attendee" };
  });

export const claimCoordinatorIfFirst = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ claimed: boolean }> => {
    const { data, error } = await context.supabase.rpc(
      "claim_coordinator_if_first",
    );
    if (error) throw new Error(error.message);
    return { claimed: Boolean(data) };
  });
