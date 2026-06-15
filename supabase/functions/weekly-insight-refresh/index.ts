// Weekly insight refresh — re-analyzes recent evidence for users inactive 7+ days.
// Schedule via pg_cron weekly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Inactive users (>=7 days)
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: users } = await supabase
    .from("profiles").select("id").lt("last_active_at", cutoff);

  let processed = 0;
  for (const u of users ?? []) {
    // pick up to 5 most recent documents per user
    const { data: docs } = await supabase
      .from("documents").select("id,file_name,ai_summary,case_id,user_id,mime_type")
      .eq("user_id", u.id)
      .order("created_at", { ascending: false })
      .limit(5);
    for (const d of docs ?? []) {
      try {
        // Simple insight regeneration prompt using current context
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            system: "Return ONLY a JSON array (max 2 items) of NEW insights about this piece of evidence. Each item: {insight_type, insight_title, brief_description, full_guidance}. Use only hedged language. End full_guidance with: This is not legal advice. Review with a qualified attorney for guidance specific to your situation.",
            messages: [
              {
                role: "user",
                content: `Evidence: ${d.file_name}\nSummary: ${d.ai_summary ?? "(none)"}\n\nWhat new considerations might have come up in the past week?`,
              },
            ],
          }),
        });
        const json = await res.json();
        const text = json.content?.[0]?.text ?? "";
        const arr = parseInsights(text);
        if (arr.length === 0) continue;
        const rows = arr.slice(0, 2).map((p: any) => ({
          document_id: d.id, case_id: d.case_id, user_id: d.user_id,
          insight_type: p.insight_type, insight_title: p.insight_title,
          brief_description: p.brief_description, full_guidance: p.full_guidance,
        }));
        const { data: inserted } = await supabase.from("document_insights").insert(rows).select();
        if (inserted) {
          await supabase.from("notifications").insert(inserted.map((i: any) => ({
            user_id: i.user_id, type: "insight",
            title: `New insight: ${i.insight_title}`,
            body: i.brief_description,
            related_case_id: i.case_id, related_document_id: i.document_id,
          })));
        }
        processed++;
      } catch (err) {
        console.error("doc analysis failed", err);
      }
    }
  }
  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { "Content-Type": "application/json" },
  });
});

function parseInsights(raw: string) {
  if (!raw) return [];
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
