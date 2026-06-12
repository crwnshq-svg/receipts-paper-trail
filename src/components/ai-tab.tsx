import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Send, Sparkles, Lock, FileText, Download, Mail, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { consumeAiQuestion, generateDocument } from "@/lib/ai.functions";
import { FREE_AI_QUESTIONS } from "@/lib/constants";

const DISCLAIMER_LINE = "Receipts does not provide legal advice. Nothing generated constitutes an attorney-client relationship.";

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

export function AiTab({ caseId, isPaid, questionsUsed }: {
  caseId: string; isPaid: boolean; questionsUsed: number;
}) {
  const [used, setUsed] = useState(questionsUsed);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const remaining = Math.max(0, FREE_AI_QUESTIONS - used);

  return (
    <div className="space-y-6">
      <ChatPanel
        caseId={caseId}
        isPaid={isPaid}
        remaining={remaining}
        onConsumed={(newUsed) => setUsed(newUsed)}
        onLimitHit={() => setShowUpgrade(true)}
      />

      <DocumentGenerator caseId={caseId} isPaid={isPaid} onLocked={() => setShowUpgrade(true)} />

      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade to keep going</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You've used your 3 free AI questions. Upgrade to get unlimited AI chat,
            document generation, and a court-ready Case Package.
          </p>
          <ul className="text-sm space-y-1 mt-2">
            <li>• Unlimited AI questions</li>
            <li>• Generate demand letters & formal complaints</li>
            <li>• 75MB → unlimited storage</li>
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowUpgrade(false)}>Not now</Button>
            <Button className="bg-primary text-primary-foreground" disabled>Upgrade (coming soon)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChatPanel({ caseId, isPaid, remaining, onConsumed, onLimitHit }: {
  caseId: string; isPaid: boolean; remaining: number;
  onConsumed: (used: number) => void; onLimitHit: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const consume = useServerFn(consumeAiQuestion);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const transport = useRef(new DefaultChatTransport({
    api: "/api/chat",
    fetch: async (url, init) => {
      const { data } = await supabase.auth.getSession();
      const headers = new Headers(init?.headers);
      if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
      // attach caseId to body
      let body = init?.body;
      if (typeof body === "string") {
        const parsed = JSON.parse(body);
        parsed.caseId = caseId;
        body = JSON.stringify(parsed);
      }
      return fetch(url, { ...init, headers, body });
    },
  })).current;

  const { messages, sendMessage, status } = useChat({
    transport,
    onError: (err) => toast.error(err.message || "Chat failed"),
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    try {
      const result = await consume();
      onConsumed(typeof result.used === "number" ? result.used : 0);
    } catch (err: any) {
      if (err?.message?.includes("FREE_LIMIT_REACHED")) {
        onLimitHit();
        return;
      }
      toast.error(err?.message ?? "Could not send");
      return;
    }
    setInput("");
    await sendMessage({ text });
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-accent/10 p-1.5"><Sparkles className="h-4 w-4 text-accent" /></div>
          <div>
            <div className="font-medium text-sm">Receipts AI</div>
            <div className="text-xs text-muted-foreground">Case-specific guidance from your evidence</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {isPaid ? "Unlimited" : `${remaining} of ${FREE_AI_QUESTIONS} questions remaining`}
        </div>
      </div>

      <div ref={scrollRef} className="h-[420px] overflow-y-auto p-4 space-y-4 bg-secondary/30">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">
            Ask anything about your case. The AI has your incidents and documents as context.
            <div className="mt-3 grid gap-2 max-w-md mx-auto text-left">
              {[
                "What are my strongest pieces of evidence?",
                "What should I document next?",
                "Help me understand my options.",
              ].map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  className="rounded-md border bg-background p-2 text-xs hover:border-accent text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m: UIMessage) => {
          const text = m.parts.map((p: any) => p.type === "text" ? p.text : "").join("");
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={isUser ? "flex justify-end" : ""}>
              <div className={isUser
                ? "max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm whitespace-pre-wrap"
                : "max-w-[95%] text-sm whitespace-pre-wrap"}>
                {text}
                {!isUser && text && (
                  <div className="mt-3 pt-2 border-t border-border/60 text-[11px] text-muted-foreground italic">
                    {DISCLAIMER_LINE}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {status === "submitted" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="border-t p-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isPaid || remaining > 0 ? "Ask about your case…" : "Free questions used — upgrade to continue"}
          disabled={isLoading || (!isPaid && remaining === 0)}
          autoFocus
        />
        <Button type="submit" disabled={isLoading || !input.trim() || (!isPaid && remaining === 0)}
          className="bg-primary text-primary-foreground hover:bg-accent">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </Card>
  );
}

function DocumentGenerator({ caseId, isPaid, onLocked }: {
  caseId: string; isPaid: boolean; onLocked: () => void;
}) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [customType, setCustomType] = useState("");
  const [recipientType, setRecipientType] = useState<string>("");
  const [recipientName, setRecipientName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const generateFn = useServerFn(generateDocument);

  function pickType(t: string) {
    if (!isPaid) { onLocked(); return; }
    setSelectedType(t);
    setResult(null);
  }

  function pickCustom() {
    if (!isPaid) { onLocked(); return; }
    if (!customType.trim()) { toast.error("Enter a document type"); return; }
    setSelectedType(customType.trim());
    setResult(null);
  }

  async function handleGenerate() {
    if (!selectedType || !recipientType) return;
    setGenerating(true);
    try {
      const res = await generateFn({ data: {
        caseId, documentType: selectedType, recipientType,
        recipientName: recipientName.trim() || undefined,
      }});
      setResult(res.content);
    } catch (err: any) {
      toast.error(err?.message ?? "Generation failed");
    } finally { setGenerating(false); }
  }

  function downloadPdf() {
    if (!result) return;
    // Simple printable HTML -> user prints to PDF via browser
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
    const subject = encodeURIComponent(`Receipts — ${selectedType}`);
    const body = encodeURIComponent(result);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4 w-4 text-accent" />
        <h3 className="font-medium">Generate a document</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Pick a document type. We'll draft it using your case context.
      </p>

      {result ? (
        <ResultEditor
          docType={selectedType ?? "Document"}
          value={result}
          onChange={setResult}
          onBack={() => { setResult(null); setSelectedType(null); }}
          onDownload={downloadPdf}
          onEmail={emailToMe}
        />
      ) : selectedType ? (
        <RecipientPicker
          docType={selectedType}
          recipientType={recipientType}
          setRecipientType={setRecipientType}
          recipientName={recipientName}
          setRecipientName={setRecipientName}
          onBack={() => setSelectedType(null)}
          onGenerate={handleGenerate}
          generating={generating}
        />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DOCUMENT_TYPES.map((t) => (
              <button key={t} onClick={() => pickType(t)}
                className="group relative rounded-lg border bg-background p-3 text-left text-sm hover:border-accent transition">
                <div className="flex items-start gap-2">
                  {!isPaid && <Lock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                  <span className="font-medium">{t}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t">
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
            <p className="mt-4 text-xs text-muted-foreground text-center">
              Document generation is included with the paid plan.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function RecipientPicker(props: {
  docType: string; recipientType: string; setRecipientType: (s: string) => void;
  recipientName: string; setRecipientName: (s: string) => void;
  onBack: () => void; onGenerate: () => void; generating: boolean;
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
      <Button onClick={props.onGenerate} disabled={!props.recipientType || props.generating}
        className="bg-primary text-primary-foreground hover:bg-accent w-full">
        {props.generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : "Generate document"}
      </Button>
    </div>
  );
}

function ResultEditor(props: {
  docType: string; value: string; onChange: (s: string) => void;
  onBack: () => void; onDownload: () => void; onEmail: () => void;
}) {
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
