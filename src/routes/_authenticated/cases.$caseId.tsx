import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, DISPUTE_LABELS, Disclaimer } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Upload, Trash2, ShieldAlert, MoreVertical, Download } from "lucide-react";
import { toast } from "sonner";
import { EditableText } from "@/components/editable-text";
import { DeleteCaseDialog } from "@/components/delete-case-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiTab } from "@/components/ai-tab";
import { ActivityTab } from "@/components/activity-tab";
import { DocumentCard } from "@/components/document-card";
import { TimelineTab } from "@/components/timeline-tab";
import { FREE_STORAGE_BYTES } from "@/lib/constants";
import { analyzeDocument } from "@/lib/document-intelligence.functions";
import { uploadEvidence, EVIDENCE_ACCEPT } from "@/lib/evidence-upload";
import { exportCaseZip } from "@/lib/case-export";
import { CaseOverviewHeader } from "@/components/case-overview-header";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const FREE_LIMIT_BYTES = FREE_STORAGE_BYTES;

const searchSchema = z.object({
  tab: z.enum(["incidents", "documents", "ai", "timeline"]).optional(),
  action: z.enum(["new", "upload"]).optional(),
  generate: z.string().optional(),
  ask: z.string().optional(),
}).optional();

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  head: () => ({ meta: [{ title: "File — Pull Up Receipts" }] }),
  validateSearch: searchSchema,
  component: CaseDetail,
});

function CaseDetail() {
  const { caseId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const initialTab = search?.tab ?? "incidents";

  const { data: caseRow, isLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("*").eq("id", caseId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: incidents } = useQuery({
    queryKey: ["incidents", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("incidents").select("*")
        .eq("case_id", caseId).order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: docs } = useQuery({
    queryKey: ["documents", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*")
        .eq("case_id", caseId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
  const [aiUsed, setAiUsed] = useState<number | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const effectiveUsed = aiUsed ?? (profile?.ai_questions_used ?? 0);

  async function updateCaseField(patch: Partial<Record<string, any>>) {
    const { error } = await supabase.from("cases").update(patch as any).eq("id", caseId);
    if (error) { toast.error(error.message); throw error; }
    qc.invalidateQueries({ queryKey: ["case", caseId] });
    qc.invalidateQueries({ queryKey: ["cases"] });
    toast.success("Updated");
  }

  async function promoteToCase() {
    if (!confirm("Mark this as a Case? Use this when the situation has escalated to formal action.")) return;
    const { error } = await supabase.from("cases").update({ status_level: "case" }).eq("id", caseId);
    if (error) { toast.error(error.message); return; }
    toast.success("Promoted to Case");
    qc.invalidateQueries({ queryKey: ["case", caseId] });
    qc.invalidateQueries({ queryKey: ["cases"] });
  }

  function switchTab(tab: "incidents" | "documents" | "ai" | "timeline") {
    navigate({ to: "/cases/$caseId", params: { caseId }, search: { tab }, replace: true } as any);
  }

  if (isLoading) return <AppShell><Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card></AppShell>;
  if (!caseRow) return <AppShell><Card className="p-8 text-center">File not found.</Card></AppShell>;

  // Mobile: open the companion as a dedicated full-screen chat view.
  if (isMobile && initialTab === "ai") {
    return (
      <AppShell>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => switchTab("incidents")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {caseRow.title}
          </button>
          <AiTab
            caseId={caseId}
            isPaid={isPaid}
            questionsUsed={effectiveUsed}
            ask={search?.ask ?? null}
            generate={search?.generate ?? null}
          />
          <Disclaimer className="pt-2" />
        </div>
      </AppShell>
    );
  }


  const partyName = caseRow.opposing_party && caseRow.opposing_party.trim().length > 0
    ? caseRow.opposing_party
    : caseRow.title;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-3xl font-semibold">
                <EditableText
                  value={partyName}
                  ariaLabel="file name"
                  onSave={async (next) => {
                    // partyName comes from opposing_party first, falling back to title
                    if (caseRow.opposing_party && caseRow.opposing_party.trim().length > 0) {
                      await updateCaseField({ opposing_party: next });
                    } else {
                      await updateCaseField({ title: next });
                    }
                  }}
                />
              </h1>
              {caseRow.opposing_party && caseRow.opposing_party.trim().length > 0 && (
                <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
                  <span>Title:</span>
                  <EditableText
                    value={caseRow.title}
                    ariaLabel="file title"
                    onSave={(next) => updateCaseField({ title: next })}
                  />
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {(() => {
                  const lvl = (caseRow as any).status_level === "case" ? "case" : "record";
                  const cls = lvl === "case"
                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30";
                  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{lvl === "case" ? "Case" : "File"}</span>;
                })()}
                <Select
                  value={caseRow.dispute_type}
                  onValueChange={(v) => updateCaseField({ dispute_type: v })}
                >
                  <SelectTrigger className="h-6 w-auto gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DISPUTE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>· Started {new Date(caseRow.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="File actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={async () => {
                    try { await exportCaseZip(caseId); } catch (e) { /* exportCaseZip toasts on error */ }
                  }}
                >
                  <Download className="mr-2 h-4 w-4" /> Export File (zip)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDelete(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete file
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {caseRow.description && (
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{caseRow.description}</p>
          )}

          {((caseRow as any).status_level !== "case") && (incidents?.length ?? 0) >= 7 && (
            <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-red-500/60 bg-red-500/5 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 text-red-400 shrink-0" />
                <div>
                  <div className="text-sm font-medium">Your file has enough documented events and evidence that it may be time to escalate to a Case.</div>
                  <div className="text-xs text-muted-foreground">Would you like to create a Case from this File?</div>
                </div>
              </div>
              <Button size="sm" onClick={promoteToCase} className="bg-red-500/90 text-white hover:bg-red-500">
                Mark as Case
              </Button>
            </Card>
          )}
        </div>

        <CaseOverviewHeader
          caseRow={caseRow as any}
          isPaid={isPaid}
          onConsumed={setAiUsed}
          onLimitHit={() => setShowUpgrade(true)}
        />

        <Tabs value={initialTab} onValueChange={(v) => switchTab(v as any)}>
          <TabsList>
            <TabsTrigger value="incidents">Activity ({incidents?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="documents">Evidence Vault ({docs?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="timeline">Activity Timeline</TabsTrigger>
            
          </TabsList>

          <TabsContent value="incidents" className="mt-4">
            <ActivityTab caseId={caseId} incidents={incidents ?? []}
              autoOpen={search?.action === "new"}
              onChange={() => qc.invalidateQueries({ queryKey: ["incidents", caseId] })} />
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <DocumentsTab
              caseId={caseId}
              docs={docs ?? []}
              isPaid={isPaid}
              autoUpload={search?.action === "upload"}
              onChange={() => {
                qc.invalidateQueries({ queryKey: ["documents", caseId] });
                qc.invalidateQueries({ queryKey: ["storage-usage"] });
              }}
              onConsumed={setAiUsed}
              onLimitHit={() => setShowUpgrade(true)}
            />
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <TimelineTab caseId={caseId} caseRow={caseRow} onJumpToTab={switchTab} />
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <AiTab caseId={caseId} isPaid={isPaid} questionsUsed={effectiveUsed} ask={search?.ask ?? null} generate={search?.generate ?? null} />
          </TabsContent>
        </Tabs>

        <Disclaimer className="pt-4" />

        <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
          <DialogContent>
            <DialogHeader><DialogTitle>Upgrade to keep going</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              You've used your 3 free AI questions. Upgrade for unlimited AI chat and document generation.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowUpgrade(false)}>Not now</Button>
              <Button className="bg-primary text-primary-foreground" disabled>Upgrade (coming soon)</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DeleteCaseDialog
          open={showDelete}
          onOpenChange={setShowDelete}
          caseId={caseId}
          caseLabel={partyName}
          onDeleted={() => navigate({ to: "/dashboard" })}
        />
      </div>
    </AppShell>
  );
}

function DocumentsTab({ caseId, docs, isPaid, autoUpload, onChange, onConsumed, onLimitHit }: {
  caseId: string; docs: any[]; isPaid: boolean; autoUpload?: boolean; onChange: () => void;
  onConsumed?: (used: number) => void; onLimitHit?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const analyze = useServerFn(analyzeDocument);
  useEffect(() => { if (autoUpload) fileRef.current?.click(); }, [autoUpload]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const inserted = await uploadEvidence({ file, caseId });
      if (inserted) {
        toast.success("Uploaded — analyzing…");
        onChange();
        analyze({ data: { documentId: inserted.id } })
          .then(() => onChange())
          .catch((err) => console.warn("analyze failed", err));
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(d: any) {
    if (!confirm(`Delete ${d.file_name}?`)) return;
    await supabase.storage.from("case-documents").remove([d.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); onChange(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <input ref={fileRef} type="file" hidden onChange={onUpload}
          accept={EVIDENCE_ACCEPT} />
        <Button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="bg-primary text-primary-foreground hover:bg-accent">
          <Upload className="mr-1 h-4 w-4" /> {uploading ? "Uploading…" : "Add Evidence"}
        </Button>
      </div>

      {docs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No evidence uploaded yet. Upload anything that matters — we keep it encrypted and organized until you need it.
        </Card>
      ) : (
        <div className="grid gap-2">
          {docs.map((d) => (
            <DocumentCard
              key={d.id} doc={d} isPaid={isPaid}
              onRemove={remove}
              onConsumed={onConsumed}
              onLimitHit={onLimitHit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
