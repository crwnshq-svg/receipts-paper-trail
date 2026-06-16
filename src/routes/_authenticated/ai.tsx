import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Disclaimer } from "@/components/app-shell";
import { AiTab } from "@/components/ai-tab";
import { FREE_AI_QUESTIONS } from "@/lib/constants";

const searchSchema = z
  .object({
    ask: z.string().optional(),
  })
  .optional();

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "RECEIPTS AI — Pull Up Receipts" }] }),
  validateSearch: searchSchema,
  component: AiPage,
});

function AiPage() {
  const search = Route.useSearch();
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const isPaid =
    profile?.subscription_tier === "monthly" ||
    profile?.subscription_tier === "annual";
  const used = profile?.ai_questions_used ?? 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold">RECEIPTS AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Talk to RECEIPTS AI without picking a File first. Start anywhere — describe what's
            going on, mention an existing File, or drop in evidence.
          </p>
        </div>

        <AiTab
          caseId={null}
          isPaid={isPaid}
          questionsUsed={used}
          ask={search?.ask ?? null}
        />

        <Disclaimer className="pt-2" />
      </div>
    </AppShell>
  );
}
