import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider, CHAT_MODEL } from "@/lib/ai-gateway.server";
import { buildChatSystemPrompt, type AiTone, type PartnerLite } from "@/lib/insight-prompts";

type Body = { caseId?: string; messages?: UIMessage[] };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { caseId, messages } = (await request.json()) as Body;
        if (!caseId || !Array.isArray(messages)) {
          return new Response("Bad request", { status: 400 });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice(7);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("AI not configured", { status: 500 });

        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const [caseRes, incRes, docRes, profRes] = await Promise.all([
          supabase.from("cases").select("*").eq("id", caseId).eq("user_id", userId).maybeSingle(),
          supabase.from("incidents").select("title,occurred_at,what_happened,who_involved,location,notes")
            .eq("case_id", caseId).order("occurred_at", { ascending: true }),
          supabase.from("documents").select("id,file_name,mime_type,created_at,ai_summary").eq("case_id", caseId),
          supabase.from("profiles").select("first_name,ai_tone,state").eq("id", userId).maybeSingle(),
        ]);
        if (!caseRes.data) return new Response("Case not found", { status: 404 });

        const tone: AiTone = (profRes.data?.ai_tone as AiTone) ?? "straightforward";
        const userState = profRes.data?.state ?? null;
        const caseRow = caseRes.data;

        // partners filtered by case module type and (optionally) user state
        let partnerQuery = supabase.from("partner_listings")
          .select("id,name,specialty,state,city,contact_email,contact_phone,contact_url")
          .eq("module_type", caseRow.dispute_type)
          .eq("is_active", true);
        if (userState) partnerQuery = partnerQuery.or(`state.is.null,state.eq.${userState}`);
        const { data: partnerRows } = await partnerQuery.limit(8);
        const partners: PartnerLite[] = partnerRows ?? [];

        const caseContext = buildCaseContext(caseRow, incRes.data ?? [], docRes.data ?? []);
        const system = buildChatSystemPrompt({
          tone,
          caseContext,
          partners,
          userState,
          firstName: profRes.data?.first_name ?? null,
        });

        const gateway = createLovableAiGatewayProvider(apiKey);
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
  lines.push(`DOCUMENTS (${documents.length}):`);
  documents.forEach((d) => {
    lines.push(`- id:${d.id} | ${d.file_name}${d.ai_summary ? ` — ${d.ai_summary.slice(0, 160)}` : ""}`);
  });
  return lines.join("\n");
}
