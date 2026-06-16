import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { AlertCircle, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/events")({
  head: () => ({ meta: [{ title: "All Events — Pull Up Receipts" }] }),
  component: EventsPage,
});

function EventsPage() {
  const { data: rows = [] } = useQuery({
    queryKey: ["events-all-feed"],
    queryFn: async () => {
      const [{ data: incidents }, { data: cases }] = await Promise.all([
        supabase
          .from("incidents")
          .select("id,case_id,title,what_happened,occurred_at,created_at")
          .order("occurred_at", { ascending: false })
          .limit(500),
        supabase.from("cases").select("id,title,opposing_party"),
      ]);
      const caseMap = new Map(
        (cases ?? []).map((c) => [
          c.id,
          (c.opposing_party && c.opposing_party.trim().length > 0
            ? c.opposing_party
            : c.title) as string,
        ]),
      );
      return (incidents ?? []).map((i) => ({
        ...i,
        case_label: caseMap.get(i.case_id) ?? "File",
      }));
    },
  });

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">All Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every event you've logged across all of your Files, newest first.
          </p>
        </div>

        {rows.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No events yet. Log events from inside a File as things happen.
          </Card>
        ) : (
          <ol className="space-y-3">
            {rows.map((e) => (
              <li key={e.id}>
                <Card className="border-l-4 border-l-red-500 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-red-400">
                    <AlertCircle className="h-3 w-3" /> Event
                    <span className="font-normal text-muted-foreground">
                      · {new Date(e.occurred_at).toLocaleString()}
                    </span>
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: e.case_id }}
                      className="ml-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] normal-case font-normal text-foreground/80 hover:text-foreground"
                    >
                      {e.case_label}
                    </Link>
                  </div>
                  <div className="mt-1 font-medium">{e.title}</div>
                  <div className="mt-1 text-sm whitespace-pre-wrap line-clamp-3">
                    {e.what_happened}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: e.case_id }}
                      search={{ tab: "ai", ask: `event:${e.id}` } as any}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <MessageCircle className="h-3 w-3" /> Ask about this
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
    </AppShell>
  );
}
