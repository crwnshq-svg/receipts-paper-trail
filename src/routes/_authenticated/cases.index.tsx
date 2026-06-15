import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, DISPUTE_LABELS } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cases/")({
  head: () => ({ meta: [{ title: "Files — Pull Up Receipts" }] }),
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
          <h1 className="font-serif text-3xl font-semibold">Your Records</h1>
          <Link to="/cases/new">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm">
              <Plus className="mr-1 h-4 w-4" /> New Record
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : !cases || cases.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">You haven't started a record yet.</p>
            <Link to="/cases/new"><Button className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">Start your first Record</Button></Link>
          </Card>
        ) : (
          <div className="grid gap-3">
            {cases.map((c) => {
              const isCase = (c as any).status_level === "case";
              return (
                <Link key={c.id} to="/cases/$caseId" params={{ caseId: c.id }}>
                  <Card className="p-4 transition-colors hover:bg-secondary">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${isCase ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"}`}>
                            {isCase ? "Case" : "Record"}
                          </span>
                          <span className="font-medium truncate">{c.title}</span>
                        </div>
                        {c.opposing_party && (
                          <div className="mt-0.5 text-xs text-muted-foreground">vs. {c.opposing_party}</div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span className="rounded-full bg-secondary px-2 py-0.5">{DISPUTE_LABELS[c.dispute_type]}</span>
                          <span>· Updated {new Date(c.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
