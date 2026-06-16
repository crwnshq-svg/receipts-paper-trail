import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { createLovableAiGatewayProvider, SUMMARY_MODEL } from "./ai-gateway.server";

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

    const { data: row, error: caseErr } = await supabase
      .from("cases")
      .select("id, user_id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseErr) throw caseErr;
    if (!row) throw new Error("File not found");
    if (row.user_id !== userId) throw new Error("Forbidden");

    const { data: docs } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("case_id", caseId);
    const paths = (docs ?? []).map((d: any) => d.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from("case-documents").remove(paths);
    }

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
        console.warn(`[deleteCase] ${t}:`, error.message);
      }
    }

    const { error: delErr } = await supabase.from("cases").delete().eq("id", caseId);
    if (delErr) throw delErr;

    return { ok: true };
  });

// ============================================================================
// Conversational File creation — infer module + party from a free-text answer
// ============================================================================

const InferCaseDraftInput = z.object({ text: z.string().min(1).max(2000) });

const VALID_MODULES = ["landlord_tenant", "employer_employee", "neighbor", "other"] as const;
type ModuleType = typeof VALID_MODULES[number];

export const inferCaseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InferCaseDraftInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { module_type: "other" as ModuleType, opposing_party: null, friendly: "" };
    }
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway(SUMMARY_MODEL);

    const system = `You read a user's plain-English description of a dispute and infer two things to confirm with them. Output ONLY a JSON object — no prose, no markdown:
{
  "module_type": "landlord_tenant" | "employer_employee" | "neighbor" | "other",
  "opposing_party": "best guess at the other party name from the text (a person, company, landlord, employer, or building name). null if not clearly inferable.",
  "friendly": "ONE short confirmation sentence to show the user, e.g. 'Sounds like a landlord situation with Willow Grove Apartments.' Never include 'right?' — the UI adds that. If the party is null, omit the 'with X' phrase."
}
Rules: choose landlord_tenant for any rental/housing/landlord/lease/eviction/repair issue. employer_employee for any job/boss/HR/workplace/wage/firing issue. neighbor for inter-resident disputes. other otherwise. opposing_party should be just the name, not a sentence.`;

    try {
      const { text } = await generateText({ model, system, prompt: data.text });
      let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const s = t.indexOf("{");
      const e = t.lastIndexOf("}");
      if (s === -1 || e === -1) throw new Error("no json");
      const obj = JSON.parse(t.slice(s, e + 1));
      const mod = (VALID_MODULES as readonly string[]).includes(obj.module_type) ? obj.module_type : "other";
      const party = typeof obj.opposing_party === "string" && obj.opposing_party.trim().length > 0
        ? obj.opposing_party.trim() : null;
      const friendly = typeof obj.friendly === "string" ? obj.friendly.trim() : "";
      return { module_type: mod as ModuleType, opposing_party: party, friendly };
    } catch (err) {
      console.warn("inferCaseDraft failed", err);
      return { module_type: "other" as ModuleType, opposing_party: null, friendly: "" };
    }
  });
