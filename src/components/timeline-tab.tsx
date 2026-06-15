import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  at: string;
  type: "case_created" | "incident" | "note" | "document" | "ai_insight" | "doc_generated";
  label: string;
  description: string;
  onTap?: () => void;
};

const TYPE_STYLES: Record<Entry["type"], { dot: string; badge: string; label: string }> = {
  incident:      { dot: "bg-red-500",    badge: "bg-red-100 text-red-700",       label: "Event logged" },
  note:          { dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-700",     label: "Note" },
  document:      { dot: "bg-blue-500",   badge: "bg-blue-100 text-blue-700",     label: "Evidence uploaded" },
  ai_insight:    { dot: "bg-amber-500",  badge: "bg-amber-100 text-amber-700",   label: "AI insight" },
  doc_generated: { dot: "bg-emerald-500",badge: "bg-emerald-100 text-emerald-700", label: "Document generated" },
  case_created:  { dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-700",     label: "File created" },
};

export function TimelineTab({ caseId, caseRow, onJumpToTab }: {
  caseId: string;
  caseRow: any;
  onJumpToTab: (tab: "incidents" | "documents" | "ai") => void;
}) {
  const { data: incidents } = useQuery({
    queryKey: ["incidents", caseId],
    queryFn: async () => (await supabase.from("incidents").select("*").eq("case_id", caseId)).data ?? [],
  });
  const { data: documents } = useQuery({
    queryKey: ["documents", caseId],
    queryFn: async () => (await supabase.from("documents").select("*").eq("case_id", caseId)).data ?? [],
  });
  const { data: insights } = useQuery({
    queryKey: ["all_insights", caseId],
    queryFn: async () => (await supabase.from("document_insights").select("*").eq("case_id", caseId)).data ?? [],
  });
  const { data: generated } = useQuery({
    queryKey: ["generated_documents", caseId],
    queryFn: async () => (await supabase.from("generated_documents").select("*").eq("case_id", caseId)).data ?? [],
  });
  const { data: notes } = useQuery({
    queryKey: ["notes", caseId],
    queryFn: async () => (await supabase.from("notes").select("*").eq("case_id", caseId)).data ?? [],
  });

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    if (caseRow) {
      out.push({
        id: `case-${caseRow.id}`,
        at: caseRow.created_at,
        type: "case_created",
        label: "File created",
        description: caseRow.title,
      });
    }
    (incidents ?? []).forEach((i: any) => out.push({
      id: `inc-${i.id}`, at: i.occurred_at, type: "incident",
      label: "Event logged", description: i.title,
      onTap: () => onJumpToTab("incidents"),
    }));
    (notes ?? []).forEach((n: any) => out.push({
      id: `note-${n.id}`, at: n.created_at, type: "note",
      label: "Note", description: n.content.length > 80 ? n.content.slice(0, 80) + "…" : n.content,
      onTap: () => onJumpToTab("incidents"),
    }));
    (documents ?? []).forEach((d: any) => out.push({
      id: `doc-${d.id}`, at: d.created_at, type: "document",
      label: "Evidence uploaded", description: d.display_name ?? d.file_name,
      onTap: () => onJumpToTab("documents"),
    }));
    (insights ?? []).forEach((ins: any) => out.push({
      id: `ins-${ins.id}`, at: ins.created_at, type: "ai_insight",
      label: "AI insight", description: ins.insight_title,
      onTap: () => onJumpToTab("documents"),
    }));
    (generated ?? []).forEach((g: any) => out.push({
      id: `gen-${g.id}`, at: g.created_at, type: "doc_generated",
      label: "Document generated", description: `${g.document_type} → ${g.recipient_type}`,
      onTap: () => onJumpToTab("ai"),
    }));
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [caseRow, incidents, notes, documents, insights, generated, onJumpToTab]);

  function exportTxt() {
    const lines = [
      `Pull Up Receipts — File Timeline`,
      `File: ${caseRow?.title ?? ""}`,
      `Exported: ${new Date().toLocaleString()}`,
      ``,
      `------------------------------------------------------`,
    ];
    for (const e of entries) {
      lines.push(`[${new Date(e.at).toLocaleString()}] ${TYPE_STYLES[e.type].label}`);
      lines.push(`  ${e.description}`);
      lines.push(``);
    }
    lines.push(`------------------------------------------------------`);
    lines.push(`This is not legal advice. Review with a qualified attorney for guidance specific to your situation.`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pull-up-receipts-timeline-${caseId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={exportTxt} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-1" /> Export Activity Timeline
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No timeline events yet.
        </Card>
      ) : (
        <ol className="relative border-l border-border ml-3 space-y-3">
          {entries.map((e) => {
            const s = TYPE_STYLES[e.type];
            return (
              <li key={e.id} className="pl-5 relative">
                <span className={cn("absolute -left-[7px] top-3 h-3.5 w-3.5 rounded-full ring-4 ring-background", s.dot)} />
                <button
                  onClick={e.onTap}
                  disabled={!e.onTap}
                  className={cn(
                    "w-full text-left rounded-md border bg-card p-3 transition",
                    e.onTap && "hover:border-accent cursor-pointer",
                  )}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", s.badge)}>
                      {s.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(e.at).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm">{e.description}</div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
