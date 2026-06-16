import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { caseId: string; cascadeAll?: boolean }) => {
    if (!input?.caseId || typeof input.caseId !== "string") {
      throw new Error("caseId is required");
    }
    return { caseId: input.caseId, cascadeAll: input.cascadeAll !== false };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { caseId } = data;

    // Verify ownership
    const { data: row, error: caseErr } = await supabase
      .from("cases")
      .select("id, user_id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseErr) throw caseErr;
    if (!row) throw new Error("File not found");
    if (row.user_id !== userId) throw new Error("Forbidden");

    // Best-effort: remove stored files in the case-documents bucket
    const { data: docs } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("case_id", caseId);
    const paths = (docs ?? []).map((d: any) => d.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from("case-documents").remove(paths);
    }

    // Explicit cascading delete (RLS scoped to user)
    const tables = [
      "document_insights",
      "passive_ai_flags",
      "documents",
      "incidents",
      "notes",
      "generated_documents",
      "ai_conversations",
      "case_packages",
    ] as const;

    for (const t of tables) {
      const { error } = await supabase.from(t).delete().eq("case_id", caseId);
      if (error && !/does not exist|column.*case_id/i.test(error.message)) {
        // Don't fail the whole delete if a table doesn't track case_id;
        // log and continue.
        console.warn(`[deleteCase] ${t}:`, error.message);
      }
    }

    const { error: delErr } = await supabase.from("cases").delete().eq("id", caseId);
    if (delErr) throw delErr;

    return { ok: true };
  });
