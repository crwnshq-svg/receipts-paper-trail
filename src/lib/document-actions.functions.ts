import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider, CHAT_MODEL } from "./ai-gateway.server";
import { DISCLAIMER } from "./constants";

const DISCLAIMER_FOOTER = `---\n${DISCLAIMER}`;

function ensureFooter(text: string) {
  if (text.includes("Pull Up Receipts is a document preparation tool")) return text;
  return `${text.trimEnd()}\n\n${DISCLAIMER_FOOTER}`;
}

export const getGeneratedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("generated_documents")
      .select("*").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (error) throw error;
    if (!doc) throw new Error("Document not found");
    return doc;
  });

export const getLatestGeneratedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase
      .from("generated_documents")
      .select("*")
      .eq("case_id", data.caseId).eq("user_id", context.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return doc ?? null;
  });

export const updateGeneratedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), content: z.string().min(1).max(80_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const content = ensureFooter(data.content);
    const { error } = await context.supabase
      .from("generated_documents")
      .update({ content }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true, content };
  });

export const aiEditGeneratedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      instruction: z.string().min(2).max(2000),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("generated_documents")
      .select("*").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (error) throw error;
    if (!doc) throw new Error("Document not found");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("AI not configured");
    const gateway = createLovableAiGatewayProvider(apiKey);

    const system = `You are revising an existing legal-style document for a non-lawyer.
- Output ONLY the full revised document text. No preface, no explanation, no markdown fences.
- Apply the user's instruction to the relevant section(s) only; leave everything else unchanged.
- Preserve the document's voice, formatting, and structure.
- Never make definitive legal conclusions; keep hedged language ("may", "appears to", "could").
- Keep the closing disclaimer footer ("Pull Up Receipts is a document preparation tool…") at the end.`;

    const prompt = `CURRENT DOCUMENT:\n\n${doc.content}\n\n---\n\nINSTRUCTION FROM USER:\n${data.instruction}\n\nReturn the full revised document.`;

    const { text } = await generateText({ model: gateway(CHAT_MODEL), system, prompt });
    const content = ensureFooter(text.trim());

    const { error: upErr } = await context.supabase
      .from("generated_documents")
      .update({ content }).eq("id", doc.id).eq("user_id", context.userId);
    if (upErr) throw upErr;
    return { ok: true, content };
  });
