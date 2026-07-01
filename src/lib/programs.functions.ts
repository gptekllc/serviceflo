import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const JoinProgramInputSchema = z.object({
  code: z.string().trim().min(1).max(32),
});

export const joinProgramByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => JoinProgramInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ programId: string; code: string }> => {
    const normalizedCode = data.code.trim().toUpperCase();
    const { data: programId, error } = await context.supabase.rpc("join_program_by_code", {
      _code: normalizedCode,
    });
    if (error) throw new Error(error.message);
    return { programId: programId as string, code: normalizedCode };
  });
