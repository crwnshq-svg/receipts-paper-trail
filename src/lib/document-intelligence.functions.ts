import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { createLovableAiGatewayProvider, CHAT_MODEL } from "./ai-gateway.server";
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
    const apiKey = process.env.LOVABLE_API_KEY;
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
          system: buildSummarySystemPrompt(),
          prompt: `A user uploaded a document named "${doc.file_name}" (type: ${doc.mime_type ?? "unknown"}) to a "${caseRow.dispute_type}" case titled "${caseRow.title}".

Based on the filename and case context, write a 4-sentence plain-English summary of what this document likely is and why it might matter to the case. If the filename is ambiguous, say so and describe what such a document typically contains.`,
        });
        summary = text;
      }
      summary = ensureDisclaimer(summary);
    } catch (err) {
      console.error("summary generation failed", err);
      summary = "Summary unavailable. Open the document to review its contents.";
    }

    await supabase.from("documents").update({ ai_summary: summary }).eq("id", doc.id);

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
