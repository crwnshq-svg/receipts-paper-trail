import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { createLovableAiGatewayProvider, CHAT_MODEL } from "./ai-gateway.server";
import { FREE_AI_QUESTIONS, DISCLAIMER } from "./constants";

const CaseIdInput = z.object({ caseId: z.string().uuid() });

export const loadCaseContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CaseIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [caseRes, incRes, docRes, profRes] = await Promise.all([
      supabase.from("cases").select("*").eq("id", data.caseId).eq("user_id", userId).maybeSingle(),
      supabase.from("incidents").select("*").eq("case_id", data.caseId).order("occurred_at", { ascending: true }),
      supabase.from("documents").select("file_name,mime_type,created_at").eq("case_id", data.caseId),
      supabase.from("profiles").select("subscription_tier,ai_questions_used,first_name").eq("id", userId).maybeSingle(),
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

const DocGenInput = z.object({
  caseId: z.string().uuid(),
  documentType: z.string().min(1),
  recipientType: z.string().min(1),
  recipientName: z.string().optional(),
});

export const generateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DocGenInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("subscription_tier").eq("id", userId).maybeSingle();
    const isPaid = profile?.subscription_tier === "monthly" || profile?.subscription_tier === "annual";
    if (!isPaid) throw new Error("PAID_ONLY");

    const [caseRes, incRes, docRes] = await Promise.all([
      supabase.from("cases").select("*").eq("id", data.caseId).eq("user_id", userId).maybeSingle(),
      supabase.from("incidents").select("*").eq("case_id", data.caseId).order("occurred_at", { ascending: true }),
      supabase.from("documents").select("file_name").eq("case_id", data.caseId),
    ]);
    if (!caseRes.data) throw new Error("Case not found");

    const contextStr = buildContextString(caseRes.data, incRes.data ?? [], docRes.data ?? []);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const prompt = `You are a paralegal assistant helping a non-lawyer draft a ${data.documentType} addressed to ${data.recipientType}${data.recipientName ? ` (${data.recipientName})` : ""}.

Use the case context below. Write a clear, firm, professional document. Include:
- Proper formatting (date, addressee, salutation, body, closing)
- Specific facts and dates from the incidents
- A clear statement of what is being requested or demanded
- A reasonable deadline for response where appropriate
- Reference to documents/evidence available

DO NOT include any preamble. Output ONLY the document text, ready to send.

CASE CONTEXT:
${contextStr}`;

    const { text } = await generateText({
      model: gateway(CHAT_MODEL),
      prompt,
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

function buildContextString(caseRow: any, incidents: any[], documents: any[]) {
  const lines: string[] = [];
  lines.push(`Title: ${caseRow.title}`);
  lines.push(`Dispute type: ${caseRow.dispute_type}`);
  if (caseRow.opposing_party) lines.push(`Opposing party: ${caseRow.opposing_party}`);
  if (caseRow.description) lines.push(`Description: ${caseRow.description}`);
  lines.push(`Started: ${new Date(caseRow.created_at).toLocaleDateString()}`);
  lines.push("");
  lines.push(`INCIDENTS (${incidents.length}):`);
  incidents.forEach((i, idx) => {
    lines.push(`${idx + 1}. [${new Date(i.occurred_at).toLocaleString()}] ${i.title}`);
    if (i.who_involved) lines.push(`   Who: ${i.who_involved}`);
    lines.push(`   What: ${i.what_happened}`);
    if (i.location) lines.push(`   Where: ${i.location}`);
    if (i.notes) lines.push(`   Notes: ${i.notes}`);
  });
  lines.push("");
  lines.push(`DOCUMENTS ON FILE (${documents.length}):`);
  documents.forEach((d) => lines.push(`- ${d.file_name}`));
  return lines.join("\n");
}

export function buildSystemPrompt(ctx: {
  case: any; incidents: any[]; documents: any[]; firstName?: string | null;
}) {
  const contextStr = buildContextString(ctx.case, ctx.incidents, ctx.documents);
  const name = ctx.firstName ? ctx.firstName : "the user";
  return `You are Receipts AI, a calm, knowledgeable paralegal-style assistant helping ${name} navigate a personal legal dispute. You help them understand their situation, organize evidence, and prepare to advocate for themselves.

CRITICAL RULES:
- You are NOT a lawyer. Do not provide legal advice or predict legal outcomes with certainty.
- Be specific to THIS case. Reference incidents and documents by name/date when relevant.
- Be supportive and clear. The user is likely stressed.
- Suggest concrete next steps (gather X, document Y, send a demand letter).
- When asked about laws, explain general concepts and recommend consulting a licensed attorney for advice specific to their jurisdiction.
- Keep responses focused and scannable. Use short paragraphs and bullets where helpful.

CASE CONTEXT:
${contextStr}`;
}
