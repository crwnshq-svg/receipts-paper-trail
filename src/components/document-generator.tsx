import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  ArrowLeft, ArrowRight, Download, FileText, Loader2, Lock, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { generateDocument } from "@/lib/ai.functions";
import { popPrefill, PREFILL_EVENT } from "@/lib/prefill";

const DISCLAIMER_LINE =
  "Pull Up Receipts is a document preparation tool and does not provide legal advice. Nothing generated constitutes legal advice or creates an attorney-client relationship. For legal representation consult a licensed attorney.";

export const DOCUMENT_TYPES = [
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

export type GeneratorStep = "type" | "recipient" | "build" | "result";

export function DocumentGenerator({ caseId, isPaid, onLocked, chromeless, onStepChange }: {
  caseId: string; isPaid: boolean; onLocked: () => void;
  chromeless?: boolean;
  onStepChange?: (step: GeneratorStep) => void;
}) {
  const [step, setStep] = useState<GeneratorStep>("type");
  useEffect(() => { onStepChange?.(step); }, [step, onStepChange]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [customType, setCustomType] = useState("");
  const [recipientType, setRecipientType] = useState<string>("");
  const [recipientName, setRecipientName] = useState("");
  const [selectedIncidents, setSelectedIncidents] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [keyFacts, setKeyFacts] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const generateFn = useServerFn(generateDocument);
  const generatorRootRef = useRef<HTMLDivElement>(null);

  function applyDocumentPrefill() {
    const pre = popPrefill<Record<string, any>>("document");
    if (!pre) return;
    let nextStep: typeof step = "type";
    if (typeof pre.documentType === "string") {
      if (!isPaid) { onLocked(); return; }
      setSelectedType(pre.documentType);
      nextStep = "recipient";
    }
    if (typeof pre.recipientType === "string") {
      setRecipientType(pre.recipientType);
      if (nextStep === "recipient") nextStep = "build";
    }
    if (typeof pre.recipientName === "string") setRecipientName(pre.recipientName);
    else if (typeof pre.recipient_name === "string") setRecipientName(pre.recipient_name);
    if (typeof pre.keyFacts === "string" || typeof pre.body === "string" || typeof pre.description === "string") {
      setKeyFacts(pre.keyFacts ?? pre.body ?? pre.description);
    }
    if (Array.isArray(pre.incident_ids)) {
      setSelectedIncidents(pre.incident_ids.filter((x: any) => typeof x === "string"));
    }
    if (Array.isArray(pre.document_ids)) {
      setSelectedDocs(pre.document_ids.filter((x: any) => typeof x === "string"));
    }
    setResult(null);
    setStep(nextStep);
    requestAnimationFrame(() => {
      generatorRootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  useEffect(() => {
    applyDocumentPrefill();
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.scope === "document") applyDocumentPrefill();
    }
    window.addEventListener(PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(PREFILL_EVENT, onPrefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickType(t: string) {
    if (!isPaid) { onLocked(); return; }
    setSelectedType(t);
    setStep("recipient");
  }
  function pickCustom() {
    if (!isPaid) { onLocked(); return; }
    if (!customType.trim()) { toast.error("Enter a document type"); return; }
    setSelectedType(customType.trim());
    setStep("recipient");
  }
  function reset() {
    setStep("type");
    setSelectedType(null);
    setRecipientType("");
    setRecipientName("");
    setSelectedIncidents([]);
    setSelectedDocs([]);
    setKeyFacts("");
    setResult(null);
  }

  async function handleGenerate() {
    if (!selectedType || !recipientType) return;
    if (selectedIncidents.length === 0 && selectedDocs.length === 0) return;
    setGenerating(true);
    try {
      const res = await generateFn({ data: {
        caseId, documentType: selectedType, recipientType,
        recipientName: recipientName.trim() || undefined,
        incidentIds: selectedIncidents,
        documentIds: selectedDocs,
        keyFacts: keyFacts.trim() || undefined,
      }});
      setResult(res.content);
      setStep("result");
    } catch (err: any) {
      toast.error(err?.message ?? "Generation failed");
    } finally { setGenerating(false); }
  }

  function downloadPdf() {
    if (!result) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${selectedType}</title>
      <style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 24px;white-space:pre-wrap;line-height:1.6;color:#1a1a2e}</style>
      </head><body>${result.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  async function emailToMe() {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email || !result) return;
    const subject = encodeURIComponent(`Pull Up Receipts — ${selectedType}`);
    const body = encodeURIComponent(result);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  const body = (
    <>
      {!chromeless && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-accent" />
            <h3 className="font-medium">Generate a document</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Pick a document type. We'll draft it using your file context.
          </p>
        </>
      )}

      {step === "result" && result && (
        <ResultEditor
          docType={selectedType ?? "Document"}
          value={result}
          onChange={setResult}
          onBack={reset}
          onDownload={downloadPdf}
          onEmail={emailToMe}
        />
      )}

      {step === "recipient" && selectedType && (
        <RecipientPicker
          docType={selectedType}
          recipientType={recipientType}
          setRecipientType={setRecipientType}
          recipientName={recipientName}
          setRecipientName={setRecipientName}
          onBack={() => setStep("type")}
          onNext={() => setStep("build")}
        />
      )}

      {step === "build" && selectedType && (
        <BuildYourDocument
          caseId={caseId}
          docType={selectedType}
          recipientType={recipientType}
          recipientName={recipientName}
          selectedIncidents={selectedIncidents}
          setSelectedIncidents={setSelectedIncidents}
          selectedDocs={selectedDocs}
          setSelectedDocs={setSelectedDocs}
          keyFacts={keyFacts}
          setKeyFacts={setKeyFacts}
          onBack={() => setStep("recipient")}
          onGenerate={handleGenerate}
          generating={generating}
        />
      )}

      {step === "type" && (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Choose a document type
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {DOCUMENT_TYPES.map((t) => (
                <button key={t} onClick={() => pickType(t)}
                  className="group relative rounded-lg border bg-background p-4 text-left text-sm hover:border-accent transition">
                  <div className="flex items-start gap-2">
                    {!isPaid && <Lock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                    <span className="font-medium">{t}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t">
            <Label className="text-xs">Custom document type</Label>
            <div className="mt-1.5 flex gap-2">
              <Input value={customType} onChange={(e) => setCustomType(e.target.value)}
                placeholder="e.g. Settlement Proposal" />
              <Button onClick={pickCustom} variant="outline">
                {!isPaid && <Lock className="h-3.5 w-3.5 mr-1" />}Use
              </Button>
            </div>
          </div>

          {!isPaid && (
            <p className="text-xs text-muted-foreground text-center">
              Document generation is included with the paid plan.
            </p>
          )}
        </div>
      )}
    </>
  );

  return (
    <div ref={generatorRootRef}>
      {chromeless ? body : <Card className="p-5">{body}</Card>}
    </div>
  );
}

function RecipientPicker(props: {
  docType: string; recipientType: string; setRecipientType: (s: string) => void;
  recipientName: string; setRecipientName: (s: string) => void;
  onBack: () => void; onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <button onClick={props.onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Pick a different document
      </button>
      <div className="rounded-md bg-secondary px-3 py-2 text-sm">
        Drafting: <strong>{props.docType}</strong>
      </div>
      <div className="space-y-1.5">
        <Label>Recipient</Label>
        <Select value={props.recipientType} onValueChange={props.setRecipientType}>
          <SelectTrigger><SelectValue placeholder="Who is this addressed to?" /></SelectTrigger>
          <SelectContent>
            {RECIPIENTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Recipient name (optional)</Label>
        <Input value={props.recipientName} onChange={(e) => props.setRecipientName(e.target.value)}
          placeholder="e.g. ABC Property Management" />
      </div>
      <Button onClick={props.onNext} disabled={!props.recipientType}
        className="bg-primary text-primary-foreground hover:bg-accent w-full">
        Next: Build your document <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

function BuildYourDocument(props: {
  caseId: string;
  docType: string; recipientType: string; recipientName: string;
  selectedIncidents: string[]; setSelectedIncidents: (ids: string[]) => void;
  selectedDocs: string[]; setSelectedDocs: (ids: string[]) => void;
  keyFacts: string; setKeyFacts: (s: string) => void;
  onBack: () => void; onGenerate: () => void; generating: boolean;
}) {
  const { data: incidents } = useQuery({
    queryKey: ["build-incidents", props.caseId],
    queryFn: async () => {
      const { data } = await supabase.from("incidents").select("id,title,occurred_at,what_happened,location")
        .eq("case_id", props.caseId).order("occurred_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: docs } = useQuery({
    queryKey: ["build-docs", props.caseId],
    queryFn: async () => {
      const { data } = await supabase.from("documents").select("id,file_name,mime_type,ai_summary")
        .eq("case_id", props.caseId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  function toggleIncident(id: string) {
    props.setSelectedIncidents(
      props.selectedIncidents.includes(id)
        ? props.selectedIncidents.filter((x) => x !== id)
        : [...props.selectedIncidents, id],
    );
  }
  function toggleDoc(id: string) {
    props.setSelectedDocs(
      props.selectedDocs.includes(id)
        ? props.selectedDocs.filter((x) => x !== id)
        : [...props.selectedDocs, id],
    );
  }

  const incCount = props.selectedIncidents.length;
  const docCount = props.selectedDocs.length;
  const hasSelection = incCount + docCount > 0;

  return (
    <div className="space-y-5">
      <button onClick={props.onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back
      </button>

      <div>
        <h4 className="font-serif text-xl font-semibold">Build Your Document</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drafting <strong>{props.docType}</strong> for <strong>{props.recipientType}</strong>
          {props.recipientName ? ` (${props.recipientName})` : ""}
        </p>
      </div>

      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Events ({incCount}/{incidents?.length ?? 0})
        </div>
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {(incidents ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground italic">No events logged yet.</p>
          )}
          {(incidents ?? []).map((inc) => {
            const checked = props.selectedIncidents.includes(inc.id);
            return (
              <label key={inc.id}
                className={`flex items-start gap-2 rounded-md border p-2.5 cursor-pointer ${checked ? "border-accent bg-accent/5" : "bg-background hover:border-muted-foreground/30"}`}>
                <Checkbox checked={checked} onCheckedChange={() => toggleIncident(inc.id)} className="mt-0.5" />
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
          Evidence ({docCount}/{docs?.length ?? 0})
        </div>
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {(docs ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground italic">No evidence uploaded yet.</p>
          )}
          {(docs ?? []).map((d) => {
            const checked = props.selectedDocs.includes(d.id);
            const firstSentence = d.ai_summary?.split(/(?<=[.!?])\s/)[0] ?? "";
            return (
              <label key={d.id}
                className={`flex items-start gap-2 rounded-md border p-2.5 cursor-pointer ${checked ? "border-accent bg-accent/5" : "bg-background hover:border-muted-foreground/30"}`}>
                <Checkbox checked={checked} onCheckedChange={() => toggleDoc(d.id)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{d.file_name}</div>
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

      <section className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Key Facts
        </Label>
        <Textarea
          value={props.keyFacts}
          onChange={(e) => props.setKeyFacts(e.target.value)}
          placeholder="Add any context the AI should know — party names, amounts owed, specific demands, key dates, anything not captured in your events or evidence."
          rows={4}
        />
      </section>

      <div className="border-t pt-4 space-y-2">
        <div className="text-xs text-center text-muted-foreground">
          Generating from <strong>{incCount}</strong> event{incCount === 1 ? "" : "s"} and <strong>{docCount}</strong> piece{docCount === 1 ? "" : "s"} of evidence.
        </div>
        {!hasSelection && (
          <p className="text-xs text-center text-muted-foreground italic">
            Select at least one event or piece of evidence to include.
          </p>
        )}
        <Button onClick={props.onGenerate} disabled={!hasSelection || props.generating}
          className="bg-primary text-primary-foreground hover:bg-accent w-full">
          {props.generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : "Generate document"}
        </Button>
      </div>
    </div>
  );
}

function ResultEditor(props: {
  docType: string; value: string; onChange: (s: string) => void;
  onBack: () => void; onDownload: () => void; onEmail: () => void;
}) {
  const FOOTER_MARKER = "---\nPull Up Receipts is a document preparation tool";
  const hasFooter = props.value.includes(FOOTER_MARKER);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={props.onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> New document
        </button>
        <span className="text-xs text-muted-foreground">{props.docType}</span>
      </div>
      <Textarea value={props.value} onChange={(e) => props.onChange(e.target.value)}
        className="min-h-[400px] font-mono text-xs leading-relaxed" />
      {!hasFooter && (
        <p className="text-[11px] text-muted-foreground italic">
          {DISCLAIMER_LINE}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={props.onDownload} variant="outline" className="flex-1">
          <Download className="h-4 w-4 mr-1" /> Download PDF
        </Button>
        <Button onClick={props.onEmail} variant="outline" className="flex-1">
          <Mail className="h-4 w-4 mr-1" /> Email to myself
        </Button>
      </div>
    </div>
  );
}
