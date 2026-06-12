import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, DISPUTE_LABELS } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cases/")({
  head: () => ({ meta: [{ title: "Cases — Receipts" }] }),
  component: CasesList,
});

function CasesList() {
  const { data: cases, isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-3xl font-semibold">Cases</h1>
          <Link to="/cases/new">
            <Button className="bg-primary text-primary-foreground hover:bg-accent">
              <Plus className="mr-1 h-4 w-4" /> New case
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : !cases || cases.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">You haven't started a case yet.</p>
            <Link to="/cases/new"><Button className="mt-4 bg-primary text-primary-foreground">Create your first case</Button></Link>
          </Card>
        ) : (
          <div className="grid gap-3">
            {cases.map((c) => (
              <Link key={c.id} to="/cases/$caseId" params={{ caseId: c.id }}>
                <Card className="p-4 transition-colors hover:bg-secondary">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.title}</div>
                      {c.opposing_party && (
                        <div className="mt-0.5 text-xs text-muted-foreground">vs. {c.opposing_party}</div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full bg-secondary px-2 py-0.5">{DISPUTE_LABELS[c.dispute_type]}</span>
                        <span>· Updated {new Date(c.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {c.status}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
