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
import { ArrowLeft, Plus, Upload, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AiTab } from "@/components/ai-tab";
import { ActivityTab } from "@/components/activity-tab";
import { DocumentCard } from "@/components/document-card";
import { TimelineTab } from "@/components/timeline-tab";
import { FREE_STORAGE_BYTES } from "@/lib/constants";
import { analyzeDocument } from "@/lib/document-intelligence.functions";

const FREE_LIMIT_BYTES = FREE_STORAGE_BYTES;

const searchSchema = z.object({
  tab: z.enum(["incidents", "documents", "ai", "timeline"]).optional(),
  action: z.enum(["new", "upload"]).optional(),
  generate: z.string().optional(),
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
  const effectiveUsed = aiUsed ?? (profile?.ai_questions_used ?? 0);

  async function deleteCase() {
    if (!confirm("Delete this file and all its events and evidence? This cannot be undone.")) return;
    if (docs) {
      const paths = docs.map((d: any) => d.storage_path);
      if (paths.length) await supabase.storage.from("case-documents").remove(paths);
    }
    const { error } = await supabase.from("cases").delete().eq("id", caseId);
    if (error) { toast.error(error.message); return; }
    toast.success("File deleted");
    navigate({ to: "/cases" });
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

  const partyName = caseRow.opposing_party && caseRow.opposing_party.trim().length > 0
    ? caseRow.opposing_party
    : caseRow.title;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link to="/cases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to files
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-3xl font-semibold">{partyName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {(() => {
                  const lvl = (caseRow as any).status_level === "case" ? "case" : "record";
                  const cls = lvl === "case"
                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30";
                  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{lvl === "case" ? "Case" : "File"}</span>;
                })()}
                <span className="rounded-full bg-secondary px-2 py-0.5">{DISPUTE_LABELS[caseRow.dispute_type]}</span>
                <span>· Started {new Date(caseRow.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={deleteCase} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
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

        <Tabs value={initialTab} onValueChange={(v) => switchTab(v as any)}>
          <TabsList>
            <TabsTrigger value="incidents">Activity ({incidents?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="documents">Evidence Vault ({docs?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="timeline">Activity Timeline</TabsTrigger>
            <TabsTrigger value="ai">RECEIPTS AI</TabsTrigger>
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
            <AiTab caseId={caseId} isPaid={isPaid} questionsUsed={effectiveUsed} />
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: profile } = await supabase.from("profiles").select("subscription_tier").eq("id", user.id).maybeSingle();
      if (profile?.subscription_tier === "free") {
        const { data: existing } = await supabase.from("documents").select("file_size").eq("user_id", user.id);
        const used = (existing ?? []).reduce((s, d) => s + (d.file_size ?? 0), 0);
        if (used + file.size > FREE_LIMIT_BYTES) {
          toast.error("You've reached the 75MB free storage cap. Upgrade for unlimited storage.");
          setUploading(false);
          return;
        }
      }

      const path = `${user.id}/${caseId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("case-documents").upload(path, file, {
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: insertedDoc, error: dbErr } = await supabase.from("documents").insert({
        case_id: caseId, user_id: user.id,
        file_name: file.name, storage_path: path,
        file_size: file.size, mime_type: file.type,
      }).select().single();
      if (dbErr) throw dbErr;
      toast.success("Uploaded — analyzing…");
      onChange();
      // Fire and forget analysis
      if (insertedDoc) {
        analyze({ data: { documentId: insertedDoc.id } })
          .then(() => onChange())
          .catch((err) => console.warn("analyze failed", err));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
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
          accept="image/*,application/pdf,.doc,.docx,.txt,.eml,.msg" />
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
