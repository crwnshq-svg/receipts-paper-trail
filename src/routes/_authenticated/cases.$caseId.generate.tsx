import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Disclaimer } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, ArrowRight, Check, Download, FileText, Loader2, Send,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { popPrefill, PREFILL_EVENT } from "@/lib/prefill";
import { generateDocument } from "@/lib/ai.functions";
import { nextDocumentQuestion, markDocumentSent } from "@/lib/document-flow.functions";

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

const DOCUMENT_TYPES = [
  "Demand Letter",
  "Formal Complaint",
  "Response to Written Warning",
  "Exit/Resignation Letter",
  "Raise or Compensation Request",
  "Lease Violation Notice",
  "Repair Request Letter",
  "Cease and Desist",
  "HR Escalation Letter",
];

const RECIPIENTS = ["Court", "HR Department", "Labor Board", "Housing Authority", "Other"];

type Step = "type" | "questions" | "selection" | "review";
type QaTurn = { role: "assistant" | "user"; content: string };

const STEPS: { key: Step; label: string }[] = [
  { key: "type", label: "Document type" },
  { key: "questions", label: "A few questions" },
  { key: "selection", label: "Events & evidence" },
  { key: "review", label: "Review" },
];

function GenerateDocumentPage() {
  const { caseId } = Route.useParams();
  const search = Route.useSearch();

  // Flow state
  const [step, setStep] = useState<Step>("type");
  const [docType, setDocType] = useState<string | null>(null);
  const [customType, setCustomType] = useState("");
  const [recipientType, setRecipientType] = useState<string>("");
  const [recipientName, setRecipientName] = useState("");

  // Q&A state
  const [turns, setTurns] = useState<QaTurn[]>([]);
  const [keyFactsSummary, setKeyFactsSummary] = useState<string>("");

  // Selection
  const [selectedIncidents, setSelectedIncidents] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  // Review
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [sendPromptOpen, setSendPromptOpen] = useState(false);
  const [savingSent, setSavingSent] = useState(false);

  const generateFn = useServerFn(generateDocument);
  const askFn = useServerFn(nextDocumentQuestion);
  const markSentFn = useServerFn(markDocumentSent);

  // Apply prefill from chat / URL search
  function applyPrefill() {
    const pre = popPrefill<Record<string, any>>("document") ?? {};
    const merged: Record<string, any> = {
      ...(search.type ? { documentType: search.type } : {}),
      ...(search.recipient ? { recipientType: search.recipient } : {}),
      ...(search.to ? { recipientName: search.to } : {}),
      ...(search.facts ? { keyFacts: search.facts } : {}),
      ...pre,
    };
    if (typeof merged.documentType === "string") setDocType(merged.documentType);
    if (typeof merged.document_type === "string" && !merged.documentType) setDocType(merged.document_type);
    if (typeof merged.recipientType === "string") setRecipientType(merged.recipientType);
    else if (typeof merged.recipient_type === "string") setRecipientType(merged.recipient_type);
    if (typeof merged.recipientName === "string") setRecipientName(merged.recipientName);
    else if (typeof merged.recipient_name === "string") setRecipientName(merged.recipient_name);
    const facts = merged.keyFacts ?? merged.key_facts ?? merged.body ?? merged.description;
    if (typeof facts === "string" && facts.trim()) {
      setKeyFactsSummary(facts.trim());
    }
    if (Array.isArray(merged.incident_ids)) {
      setSelectedIncidents(merged.incident_ids.filter((x: any) => typeof x === "string"));
    }
    if (Array.isArray(merged.document_ids)) {
      setSelectedDocs(merged.document_ids.filter((x: any) => typeof x === "string"));
    }
    if (typeof merged.documentType === "string" || typeof merged.document_type === "string") {
      setStep("questions");
    }
  }

  useEffect(() => {
    applyPrefill();
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.scope === "document") applyPrefill();
    }
    window.addEventListener(PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(PREFILL_EVENT, onPrefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: caseRow, isLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases")
        .select("id,title,opposing_party")
        .eq("id", caseId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <AppShell><Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card></AppShell>;
  }
  if (!caseRow) {
    return <AppShell><Card className="p-8 text-center">File not found.</Card></AppShell>;
  }

  const label = caseRow.opposing_party?.trim() || caseRow.title;
  const activeIndex = STEPS.findIndex((s) => s.key === step);

  function pickType(t: string) {
    setDocType(t);
    setStep("questions");
  }
  function useCustomType() {
    if (!customType.trim()) { toast.error("Enter a document type"); return; }
    setDocType(customType.trim());
    setStep("questions");
  }

  async function handleGenerate() {
    if (!docType) return;
    if (selectedIncidents.length === 0 && selectedDocs.length === 0) {
      toast.error("Select at least one event or evidence file.");
      return;
    }
    setGenerating(true);
    try {
      const res = await generateFn({ data: {
        caseId,
        documentType: docType,
        recipientType: recipientType || "Other",
        recipientName: recipientName.trim() || undefined,
        incidentIds: selectedIncidents,
        documentIds: selectedDocs,
        keyFacts: keyFactsSummary.trim() || undefined,
      }});
      setResult(res.content);
      setGeneratedId(res.id);
      setStep("review");
      // After a short delay, prompt about sending
      setTimeout(() => setSendPromptOpen(true), 600);
    } catch (err: any) {
      toast.error(err?.message ?? "Generation failed");
    } finally { setGenerating(false); }
  }

  async function handleMarkSent() {
    if (!generatedId) return;
    setSavingSent(true);
    try {
      await markSentFn({ data: { documentId: generatedId } });
      toast.success("Marked as sent. Event logged on this file.");
      setSendPromptOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not mark as sent");
    } finally {
      setSavingSent(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <header className="border-b pb-6">
          <Link
            to="/cases/$caseId"
            params={{ caseId }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {label}
          </Link>
          <h1 className="mt-3 font-serif text-3xl font-semibold">Generate a document</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A focused, step-by-step flow for drafting a document on{" "}
            <strong className="text-foreground">{label}</strong>.
          </p>
        </header>

        {/* Step indicator */}
        <nav aria-label="Progress">
          <ol className="flex items-center w-full gap-2 sm:gap-3">
            {STEPS.map((s, i) => {
              const isDone = i < activeIndex;
              const isCurrent = i === activeIndex;
              return (
                <li key={s.key} className="flex-1 flex items-center gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "h-6 w-6 shrink-0 rounded-full border flex items-center justify-center text-[11px] font-medium",
                      isDone && "bg-accent border-accent text-accent-foreground",
                      isCurrent && "border-accent text-accent",
                      !isDone && !isCurrent && "border-muted-foreground/30 text-muted-foreground",
                    )}>
                      {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={cn(
                      "text-xs sm:text-sm truncate",
                      isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                    )}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={cn("flex-1 h-px", i < activeIndex ? "bg-accent" : "bg-border")} />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="min-h-[400px]">
          {step === "type" && (
            <TypeStep
              docType={docType}
              customType={customType}
              setCustomType={setCustomType}
              onPick={pickType}
              onUseCustom={useCustomType}
            />
          )}

          {step === "questions" && docType && (
            <QuestionsStep
              caseId={caseId}
              docType={docType}
              recipientType={recipientType}
              setRecipientType={setRecipientType}
              recipientName={recipientName}
              setRecipientName={setRecipientName}
              turns={turns}
              setTurns={setTurns}
              keyFactsSummary={keyFactsSummary}
              setKeyFactsSummary={setKeyFactsSummary}
              askFn={askFn}
              onBack={() => setStep("type")}
              onNext={() => setStep("selection")}
            />
          )}

          {step === "selection" && docType && (
            <SelectionStep
              caseId={caseId}
              selectedIncidents={selectedIncidents}
              setSelectedIncidents={setSelectedIncidents}
              selectedDocs={selectedDocs}
              setSelectedDocs={setSelectedDocs}
              onBack={() => setStep("questions")}
              onGenerate={handleGenerate}
              generating={generating}
            />
          )}

          {step === "review" && result && (
            <ReviewStep
              docType={docType ?? "Document"}
              recipientName={recipientName}
              content={result}
              onContentChange={setResult}
              onBack={() => setStep("selection")}
              onOpenSentPrompt={() => setSendPromptOpen(true)}
            />
          )}
        </section>

        <Disclaimer className="pt-4" />

        <Dialog open={sendPromptOpen} onOpenChange={setSendPromptOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Did you send this?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              If you've sent this document, we'll mark it as sent and log a new event on this
              file noting it's awaiting a response — so you can track follow-up.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setSendPromptOpen(false)} disabled={savingSent}>
                Not yet
              </Button>
              <Button onClick={handleMarkSent} disabled={savingSent || !generatedId}>
                {savingSent ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Yes, I sent it
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

// ─────────────────────────── Step 1: Type ───────────────────────────

function TypeStep(props: {
  docType: string | null;
  customType: string;
  setCustomType: (s: string) => void;
  onPick: (t: string) => void;
  onUseCustom: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Choose a document type
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DOCUMENT_TYPES.map((t) => (
            <button key={t} onClick={() => props.onPick(t)}
              className={cn(
                "group relative rounded-lg border bg-background p-4 text-left text-sm hover:border-accent transition",
                props.docType === t && "border-accent",
              )}>
              <span className="font-medium">{t}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t">
        <Label className="text-xs">Custom document type</Label>
        <div className="mt-1.5 flex gap-2">
          <Input value={props.customType} onChange={(e) => props.setCustomType(e.target.value)}
            placeholder="e.g. Settlement Proposal" />
          <Button onClick={props.onUseCustom} variant="outline">Use</Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Step 2: AI Questions ───────────────────────

function QuestionsStep(props: {
  caseId: string;
  docType: string;
  recipientType: string;
  setRecipientType: (s: string) => void;
  recipientName: string;
  setRecipientName: (s: string) => void;
  turns: QaTurn[];
  setTurns: React.Dispatch<React.SetStateAction<QaTurn[]>>;
  keyFactsSummary: string;
  setKeyFactsSummary: (s: string) => void;
  askFn: (args: { data: any }) => Promise<{ done: boolean; question: string | null; summary: string | null }>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [done, setDone] = useState<boolean>(!!props.keyFactsSummary);
  const askedOnceRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [props.turns, loading]);

  // Kick off first question on mount if no turns yet
  useEffect(() => {
    if (askedOnceRef.current) return;
    askedOnceRef.current = true;
    if (props.turns.length === 0 && !done) {
      void ask([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(currentTurns: QaTurn[]) {
    setLoading(true);
    try {
      const res = await props.askFn({ data: {
        caseId: props.caseId,
        documentType: props.docType,
        recipientType: props.recipientType || null,
        recipientName: props.recipientName || null,
        turns: currentTurns,
      }});
      if (res.done) {
        setDone(true);
        if (res.summary) props.setKeyFactsSummary(res.summary);
      } else if (res.question) {
        props.setTurns((prev) => [...prev, { role: "assistant", content: res.question! }]);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't reach the assistant");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next: QaTurn[] = [...props.turns, { role: "user", content: text }];
    props.setTurns(next);
    await ask(next);
  }

  return (
    <div className="space-y-5">
      <button onClick={props.onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Pick a different document
      </button>

      <div className="rounded-md bg-secondary px-3 py-2 text-sm">
        Drafting: <strong>{props.docType}</strong>
      </div>

      {/* Recipient — collected up-front because it shapes the questions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Recipient</Label>
          <Select value={props.recipientType} onValueChange={props.setRecipientType}>
            <SelectTrigger><SelectValue placeholder="Who is this addressed to?" /></SelectTrigger>
            <SelectContent>
              {RECIPIENTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Recipient name (optional)</Label>
          <Input value={props.recipientName} onChange={(e) => props.setRecipientName(e.target.value)}
            placeholder="e.g. ABC Property Management" />
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          A few quick questions
        </div>
        <div ref={scrollRef} className="rounded-lg border bg-background p-4 max-h-[420px] overflow-y-auto space-y-3">
          {props.turns.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground italic">Starting the conversation…</p>
          )}
          {props.turns.map((t, i) => (
            <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                t.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
              )}>
                {t.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-secondary text-foreground rounded-2xl px-3.5 py-2 text-sm inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            </div>
          )}
          {done && (
            <div className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs text-accent">
              Got everything I need. Continue to pick events and evidence.
            </div>
          )}
        </div>
      </div>

      {!done && (
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); }
            }}
            placeholder="Type your answer…"
            rows={2}
            disabled={loading}
          />
          <Button onClick={() => void submit()} disabled={loading || !input.trim()}>
            Send
          </Button>
        </div>
      )}

      <div className="flex justify-between items-center pt-2 border-t">
        <button
          onClick={() => setDone(true)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Skip — I have enough to start
        </button>
        <Button onClick={props.onNext} disabled={!done && props.turns.length === 0}>
          Next: Events & evidence <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ────────────── Step 3: Events & Evidence Selection ──────────────

function SelectionStep(props: {
  caseId: string;
  selectedIncidents: string[];
  setSelectedIncidents: React.Dispatch<React.SetStateAction<string[]>>;
  selectedDocs: string[];
  setSelectedDocs: React.Dispatch<React.SetStateAction<string[]>>;
  onBack: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const { data: incidents } = useQuery({
    queryKey: ["gen-incidents", props.caseId],
    queryFn: async () => {
      const { data } = await supabase.from("incidents")
        .select("id,title,occurred_at,what_happened,location")
        .eq("case_id", props.caseId).order("occurred_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: docs } = useQuery({
    queryKey: ["gen-docs", props.caseId],
    queryFn: async () => {
      const { data } = await supabase.from("documents")
        .select("id,file_name,display_name,mime_type,ai_summary")
        .eq("case_id", props.caseId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  function toggle(list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  const hasSelection = props.selectedIncidents.length + props.selectedDocs.length > 0;

  return (
    <div className="space-y-5">
      <button onClick={props.onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back
      </button>

      <div>
        <h4 className="font-serif text-xl font-semibold">Choose supporting context</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pick the events and evidence that should be cited in this document.
        </p>
      </div>

      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Events ({props.selectedIncidents.length}/{incidents?.length ?? 0})
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {(incidents ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground italic">No events logged yet.</p>
          )}
          {(incidents ?? []).map((inc) => {
            const checked = props.selectedIncidents.includes(inc.id);
            return (
              <label key={inc.id}
                className={cn(
                  "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer",
                  checked ? "border-accent bg-accent/5" : "bg-background hover:border-muted-foreground/30",
                )}>
                <Checkbox checked={checked} onCheckedChange={() => toggle(props.selectedIncidents, props.setSelectedIncidents, inc.id)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{new Date(inc.occurred_at).toLocaleDateString()}</span>
                    {inc.location && <span>· {inc.location}</span>}
                  </div>
                  <div className="text-sm font-medium truncate">{inc.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{inc.what_happened}</div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Evidence ({props.selectedDocs.length}/{docs?.length ?? 0})
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {(docs ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground italic">No evidence uploaded yet.</p>
          )}
          {(docs ?? []).map((d) => {
            const checked = props.selectedDocs.includes(d.id);
            const firstSentence = d.ai_summary?.split(/(?<=[.!?])\s/)[0] ?? "";
            return (
              <label key={d.id}
                className={cn(
                  "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer",
                  checked ? "border-accent bg-accent/5" : "bg-background hover:border-muted-foreground/30",
                )}>
                <Checkbox checked={checked} onCheckedChange={() => toggle(props.selectedDocs, props.setSelectedDocs, d.id)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{d.display_name || d.file_name}</div>
                  <div className="text-[11px] text-muted-foreground">{d.mime_type ?? "file"}</div>
                  {firstSentence && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{firstSentence}</div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </section>

      <div className="border-t pt-4">
        {!hasSelection && (
          <p className="text-xs text-center text-muted-foreground italic mb-2">
            Select at least one event or piece of evidence.
          </p>
        )}
        <Button onClick={props.onGenerate} disabled={!hasSelection || props.generating}
          className="w-full">
          {props.generating
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
            : <><FileText className="h-4 w-4 mr-2" /> Generate document</>}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────── Step 4: Review ───────────────────────

function ReviewStep(props: {
  docType: string;
  recipientName: string;
  content: string;
  onContentChange: (s: string) => void;
  onBack: () => void;
  onOpenSentPrompt: () => void;
}) {
  const safeName = useMemo(() => sanitizeFilename(`${props.docType}${props.recipientName ? `-${props.recipientName}` : ""}`), [props.docType, props.recipientName]);

  function downloadPdf() {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Pop-ups blocked — allow pop-ups to download."); return; }
    const escaped = props.content.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    w.document.write(`<html><head><title>${props.docType}</title>
      <style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 24px;white-space:pre-wrap;line-height:1.6;color:#1a1a2e}</style>
      </head><body>${escaped}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  function downloadDoc() {
    const escaped = props.content.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${props.docType}</title>
<style>body{font-family:Georgia,serif;line-height:1.6;color:#1a1a2e;white-space:pre-wrap;}</style></head>
<body>${escaped}</body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={props.onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
        <span className="text-xs text-muted-foreground">{props.docType}</span>
      </div>

      <Textarea
        value={props.content}
        onChange={(e) => props.onContentChange(e.target.value)}
        className="min-h-[460px] font-mono text-xs leading-relaxed"
      />

      <div className="grid sm:grid-cols-2 gap-2">
        <Button onClick={downloadPdf} variant="outline">
          <Download className="h-4 w-4 mr-1" /> Download as PDF
        </Button>
        <Button onClick={downloadDoc} variant="outline">
          <Download className="h-4 w-4 mr-1" /> Download as Word (.doc)
        </Button>
      </div>

      <div className="border-t pt-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <strong>Did you send this?</strong>{" "}
          <span className="text-muted-foreground">Mark it as sent and we'll log an event noting it's awaiting a response.</span>
        </div>
        <Button onClick={props.onOpenSentPrompt} variant="outline">
          <Send className="h-4 w-4 mr-1" /> Mark as sent
        </Button>
      </div>
    </div>
  );
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "document";
}
