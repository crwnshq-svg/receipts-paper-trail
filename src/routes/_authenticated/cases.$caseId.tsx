import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, DISPUTE_LABELS, Disclaimer } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Upload, Trash2, FileText, Sparkles, Lock } from "lucide-react";
import { toast } from "sonner";

import { FREE_STORAGE_BYTES } from "@/lib/constants";
const FREE_LIMIT_BYTES = FREE_STORAGE_BYTES;

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  head: () => ({ meta: [{ title: "Case — Receipts" }] }),
  component: CaseDetail,
});

function CaseDetail() {
  const { caseId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

  async function deleteCase() {
    if (!confirm("Delete this case and all its incidents and documents? This cannot be undone.")) return;
    // delete storage files
    if (docs) {
      const paths = docs.map((d) => d.storage_path);
      if (paths.length) await supabase.storage.from("case-documents").remove(paths);
    }
    const { error } = await supabase.from("cases").delete().eq("id", caseId);
    if (error) { toast.error(error.message); return; }
    toast.success("Case deleted");
    navigate({ to: "/cases" });
  }

  if (isLoading) return <AppShell><Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card></AppShell>;
  if (!caseRow) return <AppShell><Card className="p-8 text-center">Case not found.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link to="/cases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to cases
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-3xl font-semibold">{caseRow.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-secondary px-2 py-0.5">{DISPUTE_LABELS[caseRow.dispute_type]}</span>
                {caseRow.opposing_party && <span>vs. {caseRow.opposing_party}</span>}
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
        </div>

        <Tabs defaultValue="incidents">
          <TabsList>
            <TabsTrigger value="incidents">Incidents ({incidents?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="documents">Documents ({docs?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="ai">AI tools</TabsTrigger>
          </TabsList>

          <TabsContent value="incidents" className="mt-4">
            <IncidentsTab caseId={caseId} incidents={incidents ?? []}
              onChange={() => qc.invalidateQueries({ queryKey: ["incidents", caseId] })} />
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <DocumentsTab caseId={caseId} docs={docs ?? []}
              onChange={() => {
                qc.invalidateQueries({ queryKey: ["documents", caseId] });
                qc.invalidateQueries({ queryKey: ["storage-usage"] });
              }} />
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <AiTab isPaid={isPaid} />
          </TabsContent>
        </Tabs>

        <Disclaimer className="pt-4" />
      </div>
    </AppShell>
  );
}

function IncidentsTab({ caseId, incidents, onChange }: {
  caseId: string; incidents: any[]; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("incidents").insert({
        case_id: caseId, user_id: user.id,
        title, who_involved: who || null, what_happened: what,
        notes: notes || null, location: location || null,
        occurred_at: new Date(occurredAt).toISOString(),
      });
      if (error) throw error;
      toast.success("Incident logged");
      setOpen(false);
      setTitle(""); setWho(""); setWhat(""); setNotes(""); setLocation("");
      setOccurredAt(new Date().toISOString().slice(0, 16));
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this incident?")) return;
    const { error } = await supabase.from("incidents").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); onChange(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-accent">
              <Plus className="mr-1 h-4 w-4" /> Log incident
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Log an incident</DialogTitle></DialogHeader>
            <form onSubmit={add} className="space-y-3">
              <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="What happened, in a few words" /></Field>
              <Field label="When"><Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required /></Field>
              <Field label="Who was involved"><Input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Names or roles" /></Field>
              <Field label="What happened"><Textarea value={what} onChange={(e) => setWhat(e.target.value)} required rows={4} /></Field>
              <Field label="Location (optional)"><Input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
              <Field label="Notes (optional)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
              <DialogFooter>
                <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? "Saving…" : "Save incident"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {incidents.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No incidents yet. Start logging as soon as things happen — details fade fast.
        </Card>
      ) : (
        <ol className="relative border-l border-border ml-3 space-y-4">
          {incidents.map((inc) => (
            <li key={inc.id} className="pl-5 relative">
              <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-gold ring-4 ring-background"></span>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(inc.occurred_at).toLocaleString()}
                    </div>
                    <div className="mt-0.5 font-medium">{inc.title}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remove(inc.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {inc.who_involved && <div className="mt-2 text-sm"><span className="text-muted-foreground">Who: </span>{inc.who_involved}</div>}
                <div className="mt-1 text-sm whitespace-pre-wrap">{inc.what_happened}</div>
                {inc.location && <div className="mt-1 text-xs text-muted-foreground">Location: {inc.location}</div>}
                {inc.notes && <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{inc.notes}</div>}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DocumentsTab({ caseId, docs, onChange }: { caseId: string; docs: any[]; onChange: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // check free tier cap
      const { data: profile } = await supabase.from("profiles").select("subscription_tier").eq("id", user.id).maybeSingle();
      if (profile?.subscription_tier === "free") {
        const { data: existing } = await supabase.from("documents").select("file_size").eq("user_id", user.id);
        const used = (existing ?? []).reduce((s, d) => s + (d.file_size ?? 0), 0);
        if (used + file.size > FREE_LIMIT_BYTES) {
          toast.error("You've reached the 50MB free storage cap. Upgrade for unlimited storage.");
          setUploading(false);
          return;
        }
      }

      const path = `${user.id}/${caseId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("case-documents").upload(path, file, {
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("documents").insert({
        case_id: caseId, user_id: user.id,
        file_name: file.name, storage_path: path,
        file_size: file.size, mime_type: file.type,
      });
      if (dbErr) throw dbErr;
      toast.success("Uploaded");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function download(d: any) {
    const { data, error } = await supabase.storage.from("case-documents").createSignedUrl(d.storage_path, 60);
    if (error || !data) { toast.error("Could not open file"); return; }
    window.open(data.signedUrl, "_blank");
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
          <Upload className="mr-1 h-4 w-4" /> {uploading ? "Uploading…" : "Upload document"}
        </Button>
      </div>

      {docs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Upload contracts, emails, photos, or screenshots. Stored privately in your vault.
        </Card>
      ) : (
        <div className="grid gap-2">
          {docs.map((d) => (
            <Card key={d.id} className="p-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-accent shrink-0" />
                <button onClick={() => download(d)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-medium text-sm">{d.file_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {(d.file_size / 1024).toFixed(1)} KB · {new Date(d.created_at).toLocaleDateString()}
                  </div>
                </button>
                <Button variant="ghost" size="sm" onClick={() => remove(d)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AiTab({ isPaid }: { isPaid: boolean }) {
  const tools = [
    { title: "Explain a document in plain English", desc: "Paste a contract, lease clause, or letter — get a clear summary." },
    { title: "Help me write up an incident", desc: "Turn rough notes into a clear, factual incident entry." },
    { title: "Draft a demand letter", desc: "Generate a firm, professional letter based on your case." },
    { title: "Generate a case summary", desc: "A formatted summary of your full case for review." },
  ];

  return (
    <div className="space-y-4">
      {!isPaid && (
        <Card className="border-gold/40 bg-gold/5 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-gold/20 p-2"><Sparkles className="h-4 w-4 text-gold-foreground" /></div>
            <div className="flex-1">
              <div className="font-medium">AI tools are part of the paid plan</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Unlock all AI features for $10/month or $110/year. The $29 Case Package add-on gives you a court-ready PDF export.
              </p>
              <Button className="mt-3 bg-primary text-primary-foreground hover:bg-accent" disabled>
                Upgrade (coming soon)
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {tools.map((t) => (
          <Card key={t.title} className="p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-secondary p-2">
                {isPaid ? <Sparkles className="h-4 w-4 text-accent" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="flex-1">
                <div className="font-medium">{t.title}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
                <Button variant="outline" size="sm" className="mt-3" disabled>
                  {isPaid ? "Coming soon" : "Locked"}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Every AI-generated output will include: "Receipts does not provide legal advice. Nothing generated constitutes an attorney-client relationship."
      </p>
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
