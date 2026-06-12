import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider, CHAT_MODEL } from "@/lib/ai-gateway.server";
import { buildSystemPrompt } from "@/lib/ai.functions";

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
          supabase.from("incidents").select("*").eq("case_id", caseId).order("occurred_at", { ascending: true }),
          supabase.from("documents").select("file_name,mime_type,created_at").eq("case_id", caseId),
          supabase.from("profiles").select("first_name").eq("id", userId).maybeSingle(),
        ]);
        if (!caseRes.data) return new Response("Case not found", { status: 404 });

        const system = buildSystemPrompt({
          case: caseRes.data,
          incidents: incRes.data ?? [],
          documents: docRes.data ?? [],
          firstName: profRes.data?.first_name ?? null,
        });

        const gateway = createLovableAiGatewayProvider(apiKey);
        const result = streamText({
          model: gateway(CHAT_MODEL),
          system,
          messages: convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});
