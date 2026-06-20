import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider, CHAT_MODEL } from "./ai-gateway.server";

const QaTurn = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string(),
});

const NextQuestionInput = z.object({
  caseId: z.string().uuid(),
  documentType: z.string().min(1),
  recipientType: z.string().optional().nullable(),
  recipientName: z.string().optional().nullable(),
  turns: z.array(QaTurn).default([]),
});

/**
 * Conversational question-collection for the document flow.
 * Returns either the next clarifying question, or a signal that
 * enough has been gathered along with a one-paragraph summary
 * that will be passed to the document generator as keyFacts.
 *
 * Limit: hard-cap at 5 assistant questions.
 */
export const nextDocumentQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => NextQuestionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: caseRow } = await supabase
      .from("cases")
      .select("title,opposing_party,dispute_type,description")
      .eq("id", data.caseId).eq("user_id", userId).maybeSingle();
    if (!caseRow) throw new Error("Case not found");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("AI not configured");
    const gateway = createLovableAiGatewayProvider(apiKey);

    const assistantQuestionCount = data.turns.filter((t) => t.role === "assistant").length;
    const HARD_CAP = 5;
    const mustWrap = assistantQuestionCount >= HARD_CAP;

    const system = `You are RECEIPTS AI gathering the minimum information needed to draft a ${data.documentType}${data.recipientType ? ` addressed to ${data.recipientType}` : ""}${data.recipientName ? ` (${data.recipientName})` : ""} for a non-lawyer user.

CASE CONTEXT (do not repeat back to the user):
- Title: ${caseRow.title}
- Dispute: ${caseRow.dispute_type}
${caseRow.opposing_party ? `- Opposing party: ${caseRow.opposing_party}\n` : ""}${caseRow.description ? `- Description: ${caseRow.description}\n` : ""}

YOUR JOB:
- Ask focused, plain-English questions, ONE at a time, only the things you genuinely need to draft this document well (e.g. "Who specifically is this for?", "What's the most important thing for them to know?", "Is there a deadline or specific response you want?").
- Do NOT offer navigation, actions, buttons, or suggestions. Just ask the next question conversationally.
- Keep each question to 1–2 short sentences. No preamble.
- Stop early once you have enough. Hard cap: ${HARD_CAP} questions total.${mustWrap ? "\n- You have hit the cap. You MUST set done=true now and produce the summary." : ""}

OUTPUT FORMAT — return ONLY a single JSON object, no prose, no fences:
{ "done": boolean, "question": string | null, "summary": string | null }
- If done=false: "question" is the next question to ask, "summary" is null.
- If done=true: "question" is null, "summary" is a 2–4 sentence plain-English brief capturing every key fact, name, date, request, and tone preference the user provided across the whole conversation. The downstream drafter will treat the summary as authoritative KEY FACTS.`;

    const convoLines: string[] = [];
    if (data.turns.length === 0) {
      convoLines.push("(No exchange yet — ask your first question.)");
    } else {
      for (const t of data.turns) {
        convoLines.push(`${t.role === "assistant" ? "YOU" : "USER"}: ${t.content}`);
      }
    }

    const { text } = await generateText({
      model: gateway(CHAT_MODEL),
      system,
      prompt: `Conversation so far:\n\n${convoLines.join("\n")}\n\nReturn the JSON object now.`,
    });

    const parsed = safeParseJson(text);
    if (!parsed) {
      return { done: false, question: text.trim().slice(0, 400), summary: null as string | null };
    }
    return {
      done: !!parsed.done,
      question: typeof parsed.question === "string" ? parsed.question : null,
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
    };
  });

function safeParseJson(raw: string): any | null {
  if (!raw) return null;
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < 0) return null;
  try { return JSON.parse(text.slice(first, last + 1)); } catch { return null; }
}

/**
 * Mark a generated document as sent. Sets status='sent', sent_at=now,
 * and logs a new event on the case noting that the document was sent
 * and a response is awaited.
 */
export const markDocumentSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error: docErr } = await supabase
      .from("generated_documents")
      .select("id,case_id,document_type,recipient_type,recipient_address,content")
      .eq("id", data.documentId).eq("user_id", userId).maybeSingle();
    if (docErr) throw docErr;
    if (!doc) throw new Error("Document not found");

    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("generated_documents")
      .update({ status: "sent", sent_at: now })
      .eq("id", doc.id).eq("user_id", userId);
    if (upErr) throw upErr;

    const recipient = doc.recipient_address || doc.recipient_type || "the recipient";
    const title = `${doc.document_type} sent to ${recipient} — awaiting response`;
    const what = `User sent the ${doc.document_type} to ${recipient}. Awaiting a response.\n\n[Generated document id: ${doc.id}]`;

    const { error: incErr } = await supabase
      .from("incidents")
      .insert({
        case_id: doc.case_id,
        user_id: userId,
        occurred_at: now,
        title,
        what_happened: what,
        category: "document_sent",
      });
    if (incErr) throw incErr;

    return { ok: true };
  });
