import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Trash2, Lightbulb, Pencil, Check, X, RefreshCw, Sparkles, Download, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  updateDocumentSummary,
  analyzeDocument,
  renameDocument,
  dismissNameSuggestion,
} from "@/lib/document-intelligence.functions";
import { InsightModal, type InsightRow } from "./insight-modal";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function DocumentCard({
  doc, isPaid, onRemove, onConsumed, onLimitHit,
}: {
  doc: any;
  isPaid: boolean;
  onRemove: (d: any) => void;
  onConsumed?: (used: number) => void;
  onLimitHit?: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.ai_summary ?? "");
  const [openInsight, setOpenInsight] = useState<InsightRow | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const updateSummary = useServerFn(updateDocumentSummary);
  const analyze = useServerFn(analyzeDocument);
  const rename = useServerFn(renameDocument);
  const dismissSuggestion = useServerFn(dismissNameSuggestion);

  const { data: insights } = useQuery({
    queryKey: ["document_insights", doc.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_insights")
        .select("*")
        .eq("document_id", doc.id)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InsightRow[];
    },
    refetchInterval: doc.ai_summary && !reanalyzing ? false : 5000,
  });

  const displayName = doc.display_name || doc.file_name;

  async function download() {
    const { data, error } = await supabase.storage
      .from("case-documents").createSignedUrl(doc.storage_path, 60);
    if (error || !data) { toast.error("Could not open file"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function saveSummary() {
    try {
      await updateSummary({ data: { documentId: doc.id, summary: draft.trim() } });
      toast.success("Summary updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["documents", doc.case_id] });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save");
    }
  }

  async function reanalyze() {
    if (reanalyzing) return;
    setReanalyzing(true);
    // Optimistically clear local summary so the skeleton shows
    qc.setQueryData(["documents", doc.case_id], (old: any) =>
      Array.isArray(old)
        ? old.map((d: any) => d.id === doc.id ? { ...d, ai_summary: null } : d)
        : old,
    );
    try {
      await analyze({ data: { documentId: doc.id } });
      toast.success("Re-analyzed");
    } catch (err: any) {
      toast.error(err?.message ?? "Re-analysis failed");
    } finally {
      setReanalyzing(false);
      qc.invalidateQueries({ queryKey: ["documents", doc.case_id] });
      qc.invalidateQueries({ queryKey: ["document_insights", doc.id] });
    }
  }

  async function acceptSuggestion() {
    try {
      await rename({ data: { documentId: doc.id, displayName: doc.suggested_name } });
      toast.success("Renamed");
      qc.invalidateQueries({ queryKey: ["documents", doc.case_id] });
    } catch (err: any) {
      toast.error(err?.message ?? "Rename failed");
    }
  }

  async function keepOriginalName() {
    try {
      await dismissSuggestion({ data: { documentId: doc.id } });
      qc.invalidateQueries({ queryKey: ["documents", doc.case_id] });
    } catch {}
  }

  const hasInsights = (insights?.length ?? 0) > 0;
  const showSummarySkeleton = !doc.ai_summary || reanalyzing;

  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <FileText className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <button onClick={download} className="text-left w-full">
            <div className="truncate font-medium text-sm">{displayName}</div>
            <div className="text-[11px] text-muted-foreground">
              {(doc.file_size / 1024).toFixed(1)} KB · {new Date(doc.created_at).toLocaleDateString()}
              {doc.display_name && (
                <span className="ml-1 opacity-70">· original: {doc.file_name}</span>
              )}
            </div>
          </button>

          <div className="mt-2">
            {showSummarySkeleton ? (
              <div className="space-y-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <p className="text-[10px] text-muted-foreground italic">
                  {reanalyzing ? "Re-analyzing evidence…" : "Analyzing evidence…"}
                </p>
              </div>
            ) : editing ? (
              <div className="space-y-2">
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)}
                  rows={4} className="text-xs" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveSummary} className="bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5 mr-1" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(doc.ai_summary ?? ""); }}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="group/sum flex items-start gap-2">
                <p className="text-xs text-muted-foreground leading-relaxed flex-1 whitespace-pre-wrap">
                  {doc.ai_summary}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => { setDraft(doc.ai_summary ?? ""); setEditing(true); }}
                    className="opacity-60 hover:opacity-100" title="Edit summary">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={reanalyze} disabled={reanalyzing}
                    className="opacity-60 hover:opacity-100 disabled:opacity-30"
                    title="Re-analyze Evidence">
                    <RefreshCw className={`h-3 w-3 ${reanalyzing ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {doc.suggested_name && !doc.display_name && !showSummarySkeleton && (
            <div className="mt-2 rounded-md border border-accent/40 bg-accent/5 p-2 flex items-center gap-2 flex-wrap">
              <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
              <div className="text-[11px] flex-1 min-w-0">
                <span className="text-muted-foreground">Suggested name: </span>
                <span className="font-medium text-foreground truncate">{doc.suggested_name}</span>
              </div>
              <Button size="sm" onClick={acceptSuggestion}
                className="h-7 px-2 text-xs bg-accent text-accent-foreground hover:bg-accent/90">
                Rename
              </Button>
              <Button size="sm" variant="ghost" onClick={keepOriginalName} className="h-7 px-2 text-xs">
                Keep original
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          {hasInsights && (
            <button onClick={() => setOpenInsight(insights![0])}
              title={`${insights!.length} insight${insights!.length === 1 ? "" : "s"}`}
              className="rounded-full bg-amber-100 hover:bg-amber-200 p-1.5 transition relative">
              <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
              {insights!.length > 1 && (
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-500 text-[9px] font-bold text-white flex items-center justify-center">
                  {insights!.length}
                </span>
              )}
            </button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onRemove(doc)}
            className="text-muted-foreground hover:text-destructive h-7 w-7 p-0">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <InsightModal
        insight={openInsight}
        open={!!openInsight}
        onOpenChange={(o) => !o && setOpenInsight(null)}
        isPaid={isPaid}
        onConsumed={onConsumed}
        onLimitHit={onLimitHit}
        onDismissed={() => qc.invalidateQueries({ queryKey: ["document_insights", doc.id] })}
      />
    </Card>
  );
}
