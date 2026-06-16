import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider, CHAT_MODEL } from "@/lib/ai-gateway.server";
import {
  buildChatSystemPrompt,
  buildUnscopedChatSystemPrompt,
  type AiTone,
  type PartnerLite,
} from "@/lib/insight-prompts";

type Body = { caseId?: string | null; messages?: UIMessage[] };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { caseId, messages } = (await request.json()) as Body;
        if (!Array.isArray(messages)) {
          return new Response("Bad request", { status: 400 });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice(7);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return new Response("AI not configured", { status: 500 });

        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const profRes = await supabase
          .from("profiles")
          .select("first_name,ai_tone,state,city,is_renting,lease_type,rental_duration,has_landlord_issues,is_employed,work_type,has_workplace_issues")
          .eq("id", userId)
          .maybeSingle();
        const tone: AiTone = (profRes.data?.ai_tone as AiTone) ?? "straightforward";
        const userState = profRes.data?.state ?? null;
        const firstName = profRes.data?.first_name ?? null;

        const gateway = createLovableAiGatewayProvider(apiKey);

        let system: string;

        if (!caseId) {
          // Unscoped chat — no file context. List user's active files for routing.
          const { data: activeCases } = await supabase
            .from("cases")
            .select("id,title,opposing_party,dispute_type,updated_at")
            .eq("user_id", userId)
            .eq("status", "active")
            .order("updated_at", { ascending: false })
            .limit(20);
          const cases = (activeCases ?? []).map((c) => ({
            id: c.id,
            label:
              c.opposing_party && c.opposing_party.trim().length > 0
                ? c.opposing_party
                : c.title,
            dispute_type: c.dispute_type,
          }));
          system = buildUnscopedChatSystemPrompt({
            tone,
            firstName,
            userState,
            profile: profRes.data ?? null,
            activeCases: cases,
          });
        } else {
          const [caseRes, incRes, docRes] = await Promise.all([
            supabase.from("cases").select("*").eq("id", caseId).eq("user_id", userId).maybeSingle(),
            supabase.from("incidents").select("title,occurred_at,what_happened,who_involved,location,notes")
              .eq("case_id", caseId).order("occurred_at", { ascending: true }),
            supabase.from("documents")
              .select("id,file_name,display_name,mime_type,detected_type,created_at,ai_summary,extracted_data,user_note,description")
              .eq("case_id", caseId),
          ]);
          if (!caseRes.data) return new Response("Case not found", { status: 404 });

          const caseRow = caseRes.data;

          let partnerQuery = supabase.from("partner_listings")
            .select("id,name,specialty,state,city,contact_email,contact_phone,contact_url")
            .eq("module_type", caseRow.dispute_type)
            .eq("is_active", true);
          if (userState) partnerQuery = partnerQuery.or(`state.is.null,state.eq.${userState}`);
          const { data: partnerRows } = await partnerQuery.limit(8);
          const partners: PartnerLite[] = partnerRows ?? [];

          const caseContext = buildCaseContext(caseRow, incRes.data ?? [], docRes.data ?? []);
          system = buildChatSystemPrompt({
            tone,
            caseContext,
            partners,
            userState,
            firstName,
            profile: profRes.data ?? null,
          });
        }

        const result = streamText({
          model: gateway(CHAT_MODEL),
          system,
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});

function buildCaseContext(caseRow: any, incidents: any[], documents: any[]) {
  const lines: string[] = [];
  const level = caseRow.status_level === "case" ? "Case" : "File";
  lines.push(`Status level: ${level} (use this term when referring to the user's container; a File is informal documentation, a Case is escalated formal action).`);
  lines.push(`File title (other party): ${caseRow.title}`);
  lines.push(`Dispute type: ${caseRow.dispute_type}`);
  if (caseRow.opposing_party) lines.push(`Opposing party: ${caseRow.opposing_party}`);
  if (caseRow.description) lines.push(`Description: ${caseRow.description}`);
  lines.push(`Started: ${new Date(caseRow.created_at).toLocaleDateString()}`);
  lines.push("");
  lines.push(`EVENTS (${incidents.length}):`);
  incidents.forEach((i, idx) => {
    lines.push(`${idx + 1}. [${new Date(i.occurred_at).toLocaleString()}] ${i.title}`);
    if (i.who_involved) lines.push(`   Who: ${i.who_involved}`);
    lines.push(`   What: ${i.what_happened}`);
    if (i.location) lines.push(`   Where: ${i.location}`);
    if (i.notes) lines.push(`   Notes: ${i.notes}`);
  });
  lines.push("");

  // Budget ~8000 tokens (~32000 chars) total across document full content.
  const TOTAL_BUDGET = 32000;
  const perDoc = documents.length > 0 ? Math.max(2000, Math.floor(TOTAL_BUDGET / documents.length)) : 0;

  lines.push(`EVIDENCE (${documents.length}) — full content included for investigation:`);
  documents.forEach((d, idx) => {
    lines.push("");
    lines.push(`--- EVIDENCE ${idx + 1} ---`);
    lines.push(`id: ${d.id}`);
    lines.push(`file_name: ${d.display_name || d.file_name}${d.display_name ? ` (original: ${d.file_name})` : ""}`);
    if (d.detected_type) lines.push(`detected_type: ${d.detected_type}`);
    if (d.mime_type) lines.push(`mime_type: ${d.mime_type}`);
    if (d.user_note) lines.push(`user_note: ${d.user_note}`);
    if (d.description) lines.push(`description: ${d.description}`);
    if (d.ai_summary) {
      lines.push(`AI SUMMARY:`);
      lines.push(d.ai_summary);
    }
    const extractedText = stringifyExtracted(d.extracted_data);
    if (extractedText) {
      const trimmed = extractedText.length > perDoc
        ? extractedText.slice(0, perDoc) + `\n…[truncated ${extractedText.length - perDoc} chars]`
        : extractedText;
      lines.push(`EXTRACTED TEXT:`);
      lines.push(trimmed);
    }
    lines.push(`--- END EVIDENCE ${idx + 1} ---`);
  });
  return lines.join("\n");
}

function stringifyExtracted(extracted: any): string {
  if (!extracted) return "";
  if (typeof extracted === "string") return extracted;
  if (typeof extracted.text === "string") return extracted.text;
  if (typeof extracted.content === "string") return extracted.content;
  if (typeof extracted.ocr === "string") return extracted.ocr;
  if (Array.isArray(extracted.pages)) {
    return extracted.pages.map((p: any) => p?.text ?? p?.content ?? "").filter(Boolean).join("\n\n");
  }
  try { return JSON.stringify(extracted); } catch { return ""; }
}
