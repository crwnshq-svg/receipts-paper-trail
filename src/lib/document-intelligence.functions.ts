import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { createLovableAiGatewayProvider, SUMMARY_MODEL as CHAT_MODEL } from "./ai-gateway.server";
import {
  buildInsightSystemPrompt,
  buildSummarySystemPrompt,
  buildFilenameSuggestionPrompt,
  isGenericFilename,
  ensureDisclaimer,
} from "./insight-prompts";

const DocIdInput = z.object({ documentId: z.string().uuid() });

const IMAGE_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

export const analyzeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DocIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.documentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!doc) throw new Error("Document not found");

    const { data: caseRow } = await supabase
      .from("cases").select("*").eq("id", doc.case_id).maybeSingle();
    if (!caseRow) throw new Error("Case not found");

    const { data: profile } = await supabase
      .from("profiles").select("state").eq("id", userId).maybeSingle();

    const [{ data: otherDocs }, { data: incidents }] = await Promise.all([
      supabase.from("documents").select("file_name,ai_summary").eq("case_id", doc.case_id).neq("id", doc.id),
      supabase.from("incidents").select("title,what_happened,occurred_at").eq("case_id", doc.case_id),
    ]);

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway(CHAT_MODEL);

    // Clear previous insights so re-analysis produces a clean set (no duplicates).
    await supabase
      .from("document_insights")
      .update({ is_dismissed: true })
      .eq("document_id", doc.id)
      .eq("is_dismissed", false);

    // --- 1) summary ---
    const isImage = IMAGE_MIMES.includes(doc.mime_type ?? "");
    let summary = "";
    try {
      if (isImage) {
        const { data: signed } = await supabase.storage
          .from("case-documents").createSignedUrl(doc.storage_path, 300);
        const url = signed?.signedUrl;
        const { text } = await generateText({
          model,
          system: buildSummarySystemPrompt({ caseTitle: caseRow.title, disputeType: caseRow.dispute_type }),
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: `This image was uploaded to a "${caseRow.dispute_type}" case titled "${caseRow.title}". Describe what the image shows and how it might be relevant as evidence. 4 sentences.`,
              },
              ...(url ? [{ type: "image" as const, image: url }] : []),
            ],
          }],
        });
        summary = text;
      } else {
        const { text } = await generateText({
          model,
          system: buildSummarySystemPrompt({ caseTitle: caseRow.title, disputeType: caseRow.dispute_type }),
          prompt: `Document file name: "${doc.file_name}" (mime type: ${doc.mime_type ?? "unknown"}).
Case: "${caseRow.title}" (${caseRow.dispute_type}).

Available extracted content (use this as the ACTUAL document content; do not hedge identification based on the filename if the content makes the type clear):
${stringifyExtractedForPrompt(doc.extracted_data) || "(no extracted text — work from filename + case context, but follow the absolute rules)"}

Produce the 4-sentence summary now.`,
        });
        summary = text;
      }
      summary = ensureDisclaimer(summary);
    } catch (err) {
      console.error("summary generation failed", err);
      summary = "Summary unavailable. Open the document to review its contents.";
    }

    await supabase.from("documents").update({ ai_summary: summary }).eq("id", doc.id);

    // --- 1b) suggested filename (only if the original filename looks generic) ---
    if (isGenericFilename(doc.file_name) && summary && !summary.startsWith("Summary unavailable")) {
      try {
        const { text: nameText } = await generateText({
          model,
          prompt: buildFilenameSuggestionPrompt({
            originalName: doc.file_name,
            summary,
            disputeType: caseRow.dispute_type,
          }),
        });
        const cleaned = cleanSuggestedName(nameText);
        if (cleaned) {
          await supabase.from("documents")
            .update({ suggested_name: cleaned })
            .eq("id", doc.id);
        }
      } catch (err) {
        console.error("filename suggestion failed", err);
      }
    }

    // --- 2) insights ---
    try {
      const { text: insightsText } = await generateText({
        model,
        system: buildInsightSystemPrompt({
          moduleType: caseRow.dispute_type,
          caseTitle: caseRow.title,
          state: profile?.state ?? null,
        }),
        prompt: `NEW DOCUMENT:
Name: ${doc.file_name}
Summary: ${summary}

OTHER DOCUMENTS ON FILE:
${(otherDocs ?? []).map((d) => `- ${d.file_name}${d.ai_summary ? `: ${d.ai_summary.slice(0, 200)}` : ""}`).join("\n") || "(none)"}

INCIDENTS LOGGED:
${(incidents ?? []).slice(0, 10).map((i) => `- [${new Date(i.occurred_at).toLocaleDateString()}] ${i.title}: ${i.what_happened.slice(0, 200)}`).join("\n") || "(none)"}

Return the JSON array now.`,
      });

      const parsed = parseInsightsJson(insightsText);
      if (parsed.length > 0) {
        const rows = parsed.slice(0, 3).map((p) => ({
          document_id: doc.id,
          case_id: doc.case_id,
          user_id: userId,
          insight_type: p.insight_type,
          insight_title: p.insight_title,
          brief_description: p.brief_description,
          full_guidance: ensureDisclaimer(p.full_guidance),
        }));
        const { data: inserted } = await supabase
          .from("document_insights").insert(rows).select();

        // notifications
        if (inserted && inserted.length > 0) {
          await supabase.from("notifications").insert(inserted.map((i) => ({
            user_id: userId,
            type: "insight" as const,
            title: `New insight: ${i.insight_title}`,
            body: i.brief_description,
            related_case_id: i.case_id,
            related_document_id: i.document_id,
          })));
        }
      }
    } catch (err) {
      console.error("insights generation failed", err);
    }

    return { ok: true, summary };
  });

function parseInsightsJson(raw: string): Array<{
  insight_type: string; insight_title: string;
  brief_description: string; full_guidance: string;
}> {
  if (!raw) return [];
  let text = raw.trim();
  // strip markdown fences if any
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) =>
      x && typeof x.insight_type === "string"
      && typeof x.insight_title === "string"
      && typeof x.brief_description === "string"
      && typeof x.full_guidance === "string"
    );
  } catch { return []; }
}

const SummaryEditInput = z.object({
  documentId: z.string().uuid(),
  summary: z.string().min(1).max(2000),
});
export const updateDocumentSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SummaryEditInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("documents")
      .update({ ai_summary: data.summary })
      .eq("id", data.documentId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

const DismissInput = z.object({ insightId: z.string().uuid() });
export const dismissInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DismissInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("document_insights")
      .update({ is_dismissed: true })
      .eq("id", data.insightId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

function stringifyExtractedForPrompt(extracted: any): string {
  if (!extracted) return "";
  if (typeof extracted === "string") return extracted.slice(0, 8000);
  if (typeof extracted.text === "string") return extracted.text.slice(0, 8000);
  if (typeof extracted.content === "string") return extracted.content.slice(0, 8000);
  if (typeof extracted.ocr === "string") return extracted.ocr.slice(0, 8000);
  if (Array.isArray(extracted.pages)) {
    return extracted.pages.map((p: any) => p?.text ?? p?.content ?? "").filter(Boolean).join("\n\n").slice(0, 8000);
  }
  try { return JSON.stringify(extracted).slice(0, 4000); } catch { return ""; }
}

function cleanSuggestedName(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim().split("\n")[0].trim();
  s = s.replace(/^["'`]+|["'`]+$/g, "");
  s = s.replace(/\.[a-z0-9]{1,5}$/i, ""); // strip accidental extension
  s = s.replace(/[^A-Za-z0-9 \-_.()&,]/g, " ").replace(/\s+/g, " ").trim();
  if (s.length < 3) return null;
  if (s.length > 70) s = s.slice(0, 70).trim();
  return s;
}

const RenameInput = z.object({
  documentId: z.string().uuid(),
  displayName: z.string().min(1).max(120).nullable(),
});
export const renameDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RenameInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("documents")
      .update({ display_name: data.displayName, suggested_name: null })
      .eq("id", data.documentId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

const DismissSuggestionInput = z.object({ documentId: z.string().uuid() });
export const dismissNameSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DismissSuggestionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("documents")
      .update({ suggested_name: null })
      .eq("id", data.documentId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
