import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CaseIdInput = z.object({ caseId: z.string().uuid() });

export const loadConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CaseIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("ai_conversations")
      .select("messages, intake_completed, created_at, updated_at")
      .eq("case_id", data.caseId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) {
      return {
        messages: [] as any[],
        intake_completed: false,
        started_at: null as string | null,
      };
    }
    const msgs = Array.isArray(row.messages) ? (row.messages as any[]) : [];
    return {
      messages: msgs,
      intake_completed: !!row.intake_completed,
      started_at: (row.created_at as string) ?? null,
    };
  });

const SaveInput = z.object({
  caseId: z.string().uuid(),
  messages: z.array(z.any()),
  intakeCompleted: z.boolean().optional(),
});

export const saveConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Upsert by (case_id, user_id) — one conversation per case per user.
    const { data: existing } = await supabase
      .from("ai_conversations")
      .select("id, intake_completed")
      .eq("case_id", data.caseId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("ai_conversations")
        .update({
          messages: data.messages as never,
          ...(typeof data.intakeCompleted === "boolean"
            ? { intake_completed: data.intakeCompleted }
            : {}),
        })
        .eq("id", existing.id);
      if (error) throw error;
      return { ok: true };
    }
    const { error } = await supabase.from("ai_conversations").insert({
      case_id: data.caseId,
      user_id: userId,
      messages: data.messages as never,
      intake_completed: data.intakeCompleted ?? false,
    });
    if (error) throw error;
    return { ok: true };
  });
