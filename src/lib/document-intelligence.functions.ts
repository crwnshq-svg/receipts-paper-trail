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
  HEDGED_CLOSING,
  HEDGED_LANGUAGE_RULES,
} from "./insight-prompts";

const DocIdInput = z.object({ documentId: z.string().uuid() });

const IMAGE_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
const PDF_MIME = "application/pdf";

// Extracts text from a PDF buffer using pdfjs-dist (Mozilla's PDF.js).
// Unlike pdf-parse, this works reliably in serverless/edge build environments
// since it has no filesystem access on import. Returns empty string if
// extraction fails or the PDF has no embedded text layer (e.g. a scanned
// image PDF) — callers should fall back to vision analysis in that case.
async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    const pdfDoc = await loadingTask.promise;
    const pageTexts: string[] = [];
    const maxPages = Math.min(pdfDoc.numPages, 30);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str ?? "").join(" ");
      pageTexts.push(pageText);
    }
    return pageTexts.join("\n\n").trim();
  } catch (err) {
    console.error("pdfjs extraction failed", err);
    return "";
  }
}

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
    const isPdf = (doc.mime_type ?? "") === PDF_MIME;
    let summary = "";

    // For PDFs with no extracted_data yet, attempt extraction now and persist it.
    if (isPdf && !stringifyExtractedForPrompt(doc.extracted_data)) {
      try {
        const { data: fileBlob, error: dlErr } = await supabase.storage
          .from("case-documents").download(doc.storage_path);
        if (!dlErr && fileBlob) {
          const buffer = await fileBlob.arrayBuffer();
          const extractedText = await extractPdfText(buffer);
          if (extractedText) {
            await supabase.from("documents")
              .update({ extracted_data: { text: extractedText } })
              .eq("id", doc.id);
            doc.extracted_data = { text: extractedText };
          }
        }
      } catch (err) {
        console.error("pdf download/extract step failed", err);
      }
    }

    // A PDF with still no extractable text is treated as scanned/image-only —
    // fall back to vision analysis the same way images are handled.
    const pdfNeedsVisionFallback = isPdf && !stringifyExtractedForPrompt(doc.extracted_data);

    try {
      if (isImage || pdfNeedsVisionFallback) {
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
                text: pdfNeedsVisionFallback
                  ? `This PDF was uploaded to a "${caseRow.dispute_type}" case titled "${caseRow.title}". It contains no extractable text layer (likely a scanned document), so review it visually. Describe what it shows and how it might be relevant as evidence. 4 sentences.`
                  : `This image was uploaded to a "${caseRow.dispute_type}" case titled "${caseRow.title}". Describe what the image shows and how it might be relevant as evidence. 4 sentences.`,
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
      // Summary intentionally excludes the legal disclaimer (PART 2).
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

// ============================================================================
// PART 3: Incident analysis — passive AI flags + clarifying questions
// ============================================================================

const AnalyzeIncidentInput = z.object({ incidentId: z.string().uuid() });

export const analyzeIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AnalyzeIncidentInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const { data: incident } = await supabase
      .from("incidents").select("*").eq("id", data.incidentId).eq("user_id", userId).maybeSingle();
    if (!incident) throw new Error("Event not found");

    const { data: caseRow } = await supabase
      .from("cases").select("*").eq("id", incident.case_id).maybeSingle();
    if (!caseRow) throw new Error("File not found");

    const { data: profile } = await supabase
      .from("profiles").select("state").eq("id", userId).maybeSingle();

    const [{ data: otherIncidents }, { data: docs }] = await Promise.all([
      supabase.from("incidents")
        .select("title,what_happened,occurred_at,who_involved,location")
        .eq("case_id", incident.case_id).neq("id", incident.id)
        .order("occurred_at", { ascending: false }).limit(20),
      supabase.from("documents")
        .select("file_name,ai_summary").eq("case_id", incident.case_id).limit(20),
    ]);

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway(CHAT_MODEL); // haiku — passive analysis

    const systemPrompt = `You are RECEIPTS AI analyzing a newly logged event in the context of a user's file.

FILE: "${caseRow.title}" (${caseRow.dispute_type})
${profile?.state ? `JURISDICTION: ${profile.state}` : ""}

Return ONLY a JSON object (no prose, no markdown fences) with exactly these two fields:
{
  "insights": [
    {
      "insight_type": "pattern" | "rights" | "deadline" | "law_change",
      "insight_title": "3-7 words",
      "brief_description": "2-3 sentences, hedged language",
      "full_guidance": "3-4 sentences with suggested next steps, hedged language, ending with: ${HEDGED_CLOSING}"
    }
  ],
  "clarifying_questions": [
    "A single specific question that would strengthen this event record if answered"
  ]
}

Rules:
- insights: 0 to 2 items. Only include when there is genuine signal (a pattern across events, a right the user may not know, a deadline implied). Empty array if nothing meaningful.
- clarifying_questions: 1 to 2 items. Targeted and specific to what is ACTUALLY missing from this event — never generic. Examples: "Was anyone else present who saw what happened?", "Do you remember the exact time the manager said this?", "Is there a written copy of the notice they handed you?". Avoid: "Can you add more detail?", "What else happened?".
${HEDGED_LANGUAGE_RULES}`;

    const userPrompt = `NEW EVENT JUST LOGGED:
Title: ${incident.title}
When: ${new Date(incident.occurred_at).toLocaleString()}
Who: ${incident.who_involved ?? "(not specified)"}
Location: ${incident.location ?? "(not specified)"}
What happened: ${incident.what_happened}
Notes: ${incident.notes ?? "(none)"}

OTHER EVENTS IN THIS FILE:
${(otherIncidents ?? []).map((i) => `- [${new Date(i.occurred_at).toLocaleDateString()}] ${i.title}: ${i.what_happened.slice(0, 200)}`).join("\n") || "(none)"}

EVIDENCE ON FILE:
${(docs ?? []).map((d) => `- ${d.file_name}${d.ai_summary ? `: ${d.ai_summary.slice(0, 160)}` : ""}`).join("\n") || "(none)"}

Return the JSON object now.`;

    let parsed: { insights: Array<any>; clarifying_questions: string[] } = { insights: [], clarifying_questions: [] };
    try {
      const { text } = await generateText({ model, system: systemPrompt, prompt: userPrompt });
      let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const start = t.indexOf("{");
      const end = t.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const obj = JSON.parse(t.slice(start, end + 1));
        if (Array.isArray(obj.insights)) parsed.insights = obj.insights.slice(0, 2);
        if (Array.isArray(obj.clarifying_questions)) {
          parsed.clarifying_questions = obj.clarifying_questions
            .filter((q: any) => typeof q === "string" && q.trim().length > 0)
            .slice(0, 2);
        }
      }
    } catch (err) {
      console.error("analyzeIncident generation failed", err);
    }

    // Persist insights as passive_ai_flags
    if (parsed.insights.length > 0) {
      const flagRows = parsed.insights
        .filter((p) => p && typeof p.insight_title === "string" && typeof p.brief_description === "string")
        .map((p) => ({
          case_id: incident.case_id,
          user_id: userId,
          entity_type: "incident",
          entity_id: incident.id,
          flag_type: typeof p.insight_type === "string" ? p.insight_type : "pattern",
          flag_message: p.insight_title,
          full_explanation: ensureDisclaimer(p.full_guidance ?? p.brief_description ?? ""),
          suggested_action: p.brief_description ?? null,
        }));

      if (flagRows.length > 0) {
        const { data: insertedFlags } = await supabase.from("passive_ai_flags").insert(flagRows).select();

        const first = flagRows[0];
        await supabase.from("incidents").update({
          passive_ai_flagged: true,
          flag_type: first.flag_type,
          flag_message: first.flag_message,
        }).eq("id", incident.id);

        if (insertedFlags && insertedFlags.length > 0) {
          await supabase.from("notifications").insert(insertedFlags.map((f) => ({
            user_id: userId,
            type: "insight" as const,
            title: `New insight: ${f.flag_message}`,
            body: f.suggested_action ?? "",
            related_case_id: f.case_id,
          })));
        }
      }
    }

    // Persist clarifying questions on the incident row
    await supabase.from("incidents")
      .update({ clarifying_questions: parsed.clarifying_questions as never })
      .eq("id", incident.id);

    return { ok: true, insights: parsed.insights.length, questions: parsed.clarifying_questions.length };
  });
