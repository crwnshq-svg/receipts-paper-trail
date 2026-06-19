import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Disclaimer } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Check } from "lucide-react";
import { DocumentGenerator, type GeneratorStep } from "@/components/document-generator";
import { setPrefill } from "@/lib/prefill";
import { cn } from "@/lib/utils";

type GenerateSearch = {
  type?: string;
  recipient?: string;
  to?: string;
  facts?: string;
};

export const Route = createFileRoute("/_authenticated/cases/$caseId/generate")({
  head: () => ({ meta: [{ title: "Generate a document — Pull Up Receipts" }] }),
  validateSearch: (search: Record<string, unknown>): GenerateSearch => ({
    type: typeof search.type === "string" ? search.type : undefined,
    recipient: typeof search.recipient === "string" ? search.recipient : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
    facts: typeof search.facts === "string" ? search.facts : undefined,
  }),
  component: GenerateDocumentPage,
});

const STEPS: { key: GeneratorStep; label: string }[] = [
  { key: "type", label: "Choose type" },
  { key: "recipient", label: "Recipient" },
  { key: "build", label: "Build" },
  { key: "result", label: "Review" },
];

function GenerateDocumentPage() {
  const { caseId } = Route.useParams();
  const search = Route.useSearch();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [step, setStep] = useState<GeneratorStep>("type");

  useEffect(() => {
    if (!search.type && !search.recipient && !search.to && !search.facts) return;
    setPrefill("document", {
      ...(search.type ? { documentType: search.type } : {}),
      ...(search.recipient ? { recipientType: search.recipient } : {}),
      ...(search.to ? { recipientName: search.to } : {}),
      ...(search.facts ? { keyFacts: search.facts } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: caseRow, isLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("id,title,opposing_party")
        .eq("id", caseId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const isPaid = profile?.subscription_tier === "monthly" || profile?.subscription_tier === "annual";

  if (isLoading) {
    return <AppShell><Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card></AppShell>;
  }
  if (!caseRow) {
    return <AppShell><Card className="p-8 text-center">File not found.</Card></AppShell>;
  }

  const label = caseRow.opposing_party?.trim() || caseRow.title;
  const activeIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <header className="border-b pb-6">
          <Link
            to="/cases/$caseId"
            params={{ caseId }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {label}
          </Link>
          <h1 className="mt-3 font-serif text-3xl font-semibold">Generate a document</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Generate a document from your file — drafted using the events and evidence on{" "}
            <strong className="text-foreground">{label}</strong>.
          </p>
        </header>

        {/* Step indicator */}
        <nav aria-label="Progress">
          <ol className="flex items-center w-full gap-2 sm:gap-3">
            {STEPS.map((s, i) => {
              const isDone = i < activeIndex;
              const isCurrent = i === activeIndex;
              return (
                <li key={s.key} className="flex-1 flex items-center gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        "h-6 w-6 shrink-0 rounded-full border flex items-center justify-center text-[11px] font-medium",
                        isDone && "bg-accent border-accent text-accent-foreground",
                        isCurrent && "border-accent text-accent",
                        !isDone && !isCurrent && "border-muted-foreground/30 text-muted-foreground",
                      )}
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span
                      className={cn(
                        "text-xs sm:text-sm truncate",
                        isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-px",
                        i < activeIndex ? "bg-accent" : "bg-border",
                      )}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Step content — full width, no embedded card */}
        <section className="min-h-[400px]">
          <DocumentGenerator
            caseId={caseId}
            isPaid={isPaid}
            onLocked={() => setShowUpgrade(true)}
            chromeless
            onStepChange={setStep}
          />
        </section>

        <Disclaimer className="pt-4" />

        <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
          <DialogContent>
            <DialogHeader><DialogTitle>Upgrade to keep going</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Document generation is included with the paid plan. Upgrade for unlimited drafts,
              AI chat, and a court-ready Case Package.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowUpgrade(false)}>Not now</Button>
              <Button className="bg-primary text-primary-foreground" disabled>Upgrade (coming soon)</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
