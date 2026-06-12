import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { createLovableAiGatewayProvider, CHAT_MODEL } from "./ai-gateway.server";
import { FREE_AI_QUESTIONS, DISCLAIMER } from "./constants";
import { buildDocumentSystemPrompt, type AiTone } from "./insight-prompts";

const CaseIdInput = z.object({ caseId: z.string().uuid() });

export const loadCaseContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CaseIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [caseRes, incRes, docRes, profRes] = await Promise.all([
      supabase.from("cases").select("*").eq("id", data.caseId).eq("user_id", userId).maybeSingle(),
      supabase.from("incidents").select("*").eq("case_id", data.caseId).order("occurred_at", { ascending: true }),
      supabase.from("documents").select("id,file_name,mime_type,created_at,ai_summary").eq("case_id", data.caseId),
      supabase.from("profiles").select("subscription_tier,ai_questions_used,first_name,ai_tone,state").eq("id", userId).maybeSingle(),
    ]);
    if (!caseRes.data) throw new Error("Case not found");
    return {
      case: caseRes.data,
      incidents: incRes.data ?? [],
      documents: docRes.data ?? [],
      profile: profRes.data,
    };
  });

export const consumeAiQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile, error } = await supabase
      .from("profiles").select("subscription_tier,ai_questions_used").eq("id", userId).maybeSingle();
    if (error || !profile) throw new Error("Profile not found");
    const isPaid = profile.subscription_tier === "monthly" || profile.subscription_tier === "annual";
    if (isPaid) return { used: profile.ai_questions_used, remaining: Infinity, isPaid };
    if (profile.ai_questions_used >= FREE_AI_QUESTIONS) {
      throw new Error("FREE_LIMIT_REACHED");
    }
    const newUsed = profile.ai_questions_used + 1;
    await supabase.from("profiles").update({ ai_questions_used: newUsed }).eq("id", userId);
    return { used: newUsed, remaining: FREE_AI_QUESTIONS - newUsed, isPaid };
  });

const ToneInput = z.object({ tone: z.enum(["straightforward", "personable"]) });
export const updateAiTone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ToneInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles").update({ ai_tone: data.tone }).eq("id", context.userId);
    if (error) throw error;
    return { ok: true, tone: data.tone };
  });

const DocGenInput = z.object({
  caseId: z.string().uuid(),
  documentType: z.string().min(1),
  recipientType: z.string().min(1),
  recipientName: z.string().optional(),
  incidentIds: z.array(z.string().uuid()).default([]),
  documentIds: z.array(z.string().uuid()).default([]),
  keyFacts: z.string().max(4000).optional(),
});

export const generateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DocGenInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("subscription_tier,ai_tone").eq("id", userId).maybeSingle();
    const isPaid = profile?.subscription_tier === "monthly" || profile?.subscription_tier === "annual";
    if (!isPaid) throw new Error("PAID_ONLY");
    if (data.incidentIds.length === 0 && data.documentIds.length === 0) {
      throw new Error("NO_SELECTION");
    }

    const [caseRes, incRes, docRes] = await Promise.all([
      supabase.from("cases").select("*").eq("id", data.caseId).eq("user_id", userId).maybeSingle(),
      data.incidentIds.length > 0
        ? supabase.from("incidents").select("*").in("id", data.incidentIds).eq("case_id", data.caseId)
        : Promise.resolve({ data: [] as any[] }),
      data.documentIds.length > 0
        ? supabase.from("documents").select("file_name,ai_summary,mime_type").in("id", data.documentIds).eq("case_id", data.caseId)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    if (!caseRes.data) throw new Error("Case not found");

    const contextStr = buildSelectionContext(
      caseRes.data,
      incRes.data ?? [],
      docRes.data ?? [],
      data.keyFacts ?? "",
    );
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const tone: AiTone = (profile?.ai_tone as AiTone) ?? "straightforward";
    const gateway = createLovableAiGatewayProvider(apiKey);
    const system = buildDocumentSystemPrompt({
      tone,
      documentType: data.documentType,
      recipientType: data.recipientType,
      recipientName: data.recipientName ?? null,
    });

    const { text } = await generateText({
      model: gateway(CHAT_MODEL),
      system,
      prompt: `SELECTED CONTEXT — work only from this:\n\n${contextStr}`,
    });

    const finalText = `${text}\n\n---\n${DISCLAIMER}`;

    const { data: saved, error: saveErr } = await supabase.from("generated_documents").insert({
      case_id: data.caseId,
      user_id: userId,
      document_type: data.documentType,
      recipient_type: data.recipientType,
      recipient_address: data.recipientName ?? null,
      content: finalText,
    }).select().single();
    if (saveErr) throw saveErr;

    return { id: saved.id, content: finalText };
  });

function buildSelectionContext(caseRow: any, incidents: any[], documents: any[], keyFacts: string) {
  const lines: string[] = [];
  lines.push(`CASE: ${caseRow.title} (${caseRow.dispute_type})`);
  if (caseRow.opposing_party) lines.push(`Opposing party: ${caseRow.opposing_party}`);
  lines.push("");
  lines.push(`SELECTED INCIDENTS (${incidents.length}):`);
  if (incidents.length === 0) lines.push("(none selected)");
  incidents.forEach((i, idx) => {
    lines.push(`${idx + 1}. [${new Date(i.occurred_at).toLocaleString()}] ${i.title}`);
    if (i.who_involved) lines.push(`   Who: ${i.who_involved}`);
    lines.push(`   What: ${i.what_happened}`);
    if (i.location) lines.push(`   Where: ${i.location}`);
    if (i.notes) lines.push(`   Notes: ${i.notes}`);
  });
  lines.push("");
  lines.push(`SELECTED DOCUMENTS (${documents.length}):`);
  if (documents.length === 0) lines.push("(none selected)");
  documents.forEach((d) => {
    lines.push(`- ${d.file_name}${d.mime_type ? ` (${d.mime_type})` : ""}`);
    if (d.ai_summary) lines.push(`  Summary: ${d.ai_summary}`);
  });
  lines.push("");
  lines.push(`KEY FACTS PROVIDED BY USER:`);
  lines.push(keyFacts.trim() || "(none)");
  return lines.join("\n");
}
