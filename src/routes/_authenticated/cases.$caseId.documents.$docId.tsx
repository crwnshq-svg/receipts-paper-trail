import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Disclaimer } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Sparkles, Download, Mail, Loader2, Save, FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  getGeneratedDocument, getLatestGeneratedDocument,
  updateGeneratedDocument, aiEditGeneratedDocument,
} from "@/lib/document-actions.functions";

export const Route = createFileRoute("/_authenticated/cases/$caseId/documents/$docId")({
  head: () => ({ meta: [{ title: "Review document — Pull Up Receipts" }] }),
  component: DocumentReview,
});

function DocumentReview() {
  const { caseId, docId } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getGeneratedDocument);
  const getLatestFn = useServerFn(getLatestGeneratedDocument);
  const saveFn = useServerFn(updateGeneratedDocument);
  const aiEditFn = useServerFn(aiEditGeneratedDocument);

  const isLatest = docId === "latest";

  const { data: doc, isLoading, refetch } = useQuery({
    queryKey: ["generated-doc", caseId, docId],
    queryFn: async () => {
      if (isLatest) {
        const d = await getLatestFn({ data: { caseId } });
        return d;
      }
      return await getFn({ data: { id: docId } });
    },
  });

  const [content, setContent] = useState("");
  const [instruction, setInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doc?.content) setContent(doc.content);
  }, [doc?.content]);

  // No latest doc → send to AI tab to generate one.
  useEffect(() => {
    if (isLatest && !isLoading && !doc) {
      toast("No generated documents yet — create one below.");
      navigate({ to: "/cases/$caseId", params: { caseId }, search: { tab: "ai" } } as any);
    }
  }, [isLatest, isLoading, doc, caseId, navigate]);

  async function handleSave() {
    if (!doc) return;
    setSaving(true);
    try {
      const res = await saveFn({ data: { id: doc.id, content } });
      setContent(res.content);
      toast.success("Saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally { setSaving(false); }
  }

  async function handleAiEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!doc || !instruction.trim()) return;
    setAiBusy(true);
    try {
      const res = await aiEditFn({ data: { id: doc.id, instruction: instruction.trim() } });
      setContent(res.content);
      setInstruction("");
      toast.success("Document updated");
      refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "AI edit failed");
    } finally { setAiBusy(false); }
  }

  function downloadPdf() {
    if (!content) return;
    const title = doc?.document_type ?? "Document";
    const w = window.open("", "_blank");
    if (!w) return;
    const escaped = content.replace(/[&<>]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    w.document.write(`<html><head><title>${title}</title>
      <style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 24px;white-space:pre-wrap;line-height:1.6;color:#1a1a2e}</style>
      </head><body>${escaped}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  async function emailToMe() {
    if (!content) return;
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) { toast.error("No email on file"); return; }
    const subject = encodeURIComponent(`Receipts — ${doc?.document_type ?? "Document"}`);
    const body = encodeURIComponent(content);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  if (isLoading) {
    return <AppShell><Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card></AppShell>;
  }
  if (!doc) {
    return (
      <AppShell>
        <Card className="p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Document not found.</p>
          <Link to="/cases/$caseId" params={{ caseId }} search={{ tab: "ai" }}>
            <Button variant="outline">Go to AI tools</Button>
          </Link>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5 max-w-4xl mx-auto">
        <div>
          <Link
            to="/cases/$caseId" params={{ caseId }} search={{ tab: "ai" }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to case
          </Link>
          <div className="mt-3 flex items-start gap-3">
            <div className="rounded-md bg-accent/10 p-2"><FileText className="h-5 w-5 text-accent" /></div>
            <div>
              <h1 className="font-serif text-2xl font-semibold">{doc.document_type}</h1>
              <div className="text-xs text-muted-foreground mt-0.5">
                {doc.recipient_type ? `For ${doc.recipient_type}` : "Generated document"}
                {doc.recipient_address ? ` · ${doc.recipient_address}` : ""}
                {" · "}
                {new Date(doc.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* AI editing bar */}
        <Card className="p-3 border-accent/40 bg-accent/5">
          <form onSubmit={handleAiEdit} className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent shrink-0 ml-1" />
            <Input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Apply changes — e.g. make this more formal, add a paragraph about the missed payment"
              disabled={aiBusy}
            />
            <Button type="submit" disabled={aiBusy || !instruction.trim()}
              className="bg-primary text-primary-foreground hover:bg-accent">
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </Button>
          </form>
        </Card>

        {/* Document view (read-only formatted) */}
        <Card className="p-8 bg-card">
          <div className="prose prose-sm max-w-none whitespace-pre-wrap font-serif leading-relaxed text-foreground">
            {content}
          </div>
        </Card>

        {/* Manual edit */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Edit manually
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[260px] font-mono text-xs leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-accent">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save Changes
          </Button>
          <Button onClick={downloadPdf} variant="outline">
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
          <Button onClick={emailToMe} variant="outline">
            <Mail className="h-4 w-4 mr-1" /> Email to Myself
          </Button>
        </div>

        <Disclaimer className="pt-2" />
      </div>
    </AppShell>
  );
}
