import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Disclaimer } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { DocumentGenerator } from "@/components/document-generator";
import { setPrefill } from "@/lib/prefill";

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

function GenerateDocumentPage() {
  const { caseId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Seed prefill from search params (set by AI action navigation) so the
  // generator pre-selects the right type and pre-fills known details. Runs
  // before DocumentGenerator's mount-time popPrefill via layout ordering.
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

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link
            to="/cases/$caseId"
            params={{ caseId }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {label}
          </Link>
          <h1 className="mt-3 font-serif text-3xl font-semibold">Generate a document</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drafted from the events and evidence on <strong>{label}</strong>.
          </p>
        </div>

        <DocumentGenerator
          caseId={caseId}
          isPaid={isPaid}
          onLocked={() => setShowUpgrade(true)}
        />

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
