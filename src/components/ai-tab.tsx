import { useState, useRef, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Send, Sparkles, Loader2, ArrowRight,
  ExternalLink, Phone, FileSearch, Paperclip, Check, Mail, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { consumeAiQuestion } from "@/lib/ai.functions";
import { analyzeDocument } from "@/lib/document-intelligence.functions";
import { loadConversation, saveConversation } from "@/lib/conversation.functions";
import { FREE_AI_QUESTIONS } from "@/lib/constants";
import { setPrefill } from "@/lib/prefill";
import { ClarifyingQuestion } from "@/components/clarifying-question";
import { DOCUMENT_TYPES } from "@/components/document-generator";




// ============================== Structured response types ==============================

type StructuredActionType =
  | "generate_document"
  | "upload_evidence"
  | "log_incident"
  | "file_complaint"
  | "find_resource"
  | "send_preservation_demand"
  | "log_witness"
  | "create_written_record"
  | "draft_followup_email"
  | "generate_police_report"
  | "generate_footage_request"
  | "log_spoliation"
  | "open_file"
  | "open_evidence_vault"
  | "open_resources"
  | "open_alert"
  | "attach_evidence_to_file";

type StructuredAction = {
  type: StructuredActionType;
  label: string;
  prefill?: Record<string, any>;
};

export type PendingUpload = {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};
type StructuredResource = { name: string; url: string; description?: string };
type StructuredPartner = {
  id?: string; name: string; specialty?: string; location?: string | null; contact?: string | null;
};
type Structured = {
  message: string;
  beats?: string[];
  clarifying_question?: string | null;
  actions?: StructuredAction[];
  resources?: StructuredResource[];
  partners?: StructuredPartner[];
  document_refs?: string[];
  suggestions?: string[];
};

// Strip markdown code fences anywhere in the text, then return the substring
// from the first `{` to the last `}` so trailing whitespace, stray prose,
// or commentary outside the JSON object don't break parsing.
function stripFencesAndExtractJson(raw: string): string | null {
  if (!raw) return null;
  let text = raw.trim();
  text = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

// Strip structural markers the model should never emit inside message text
// (legacy "\n---\n" bubble separators and "[Q]" clarifying-question prefix).
function scrubMarkers(s: string): string {
  if (!s) return s;
  return s
    .replace(/\n\s*---\s*\n/g, "\n\n")
    .replace(/^\s*\[Q\]\s*/gim, "")
    .trim();
}

// SINGLE entry point for parsing an AI response into a Structured object.
// Used by every chat surface (unscoped /ai, file-scoped AI tab, event
// "ask about this", in-chat evidence upload). Returns null only when the
// response is not valid structured JSON; callers fall back to rendering
// the raw or partial text.
function tryParseStructured(raw: string): Structured | null {
  const json = stripFencesAndExtractJson(raw);
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    if (typeof obj?.message !== "string") return null;
    const message = scrubMarkers(obj.message);
    const beats = Array.isArray(obj.beats)
      ? obj.beats.map((b: unknown) => scrubMarkers(String(b ?? ""))).filter(Boolean)
      : undefined;
    const clarifying_question =
      typeof obj.clarifying_question === "string" && obj.clarifying_question.trim().length > 0
        ? scrubMarkers(obj.clarifying_question)
        : null;
    return { ...obj, message, beats, clarifying_question } as Structured;
  } catch {
    return null;
  }
}

// Pull the (possibly partial) value of the top-level "message" field from a
// streaming JSON response so the user sees text immediately instead of a
// blank placeholder while bytes arrive. Also serves as a safety net when
// the completed response fails strict JSON parsing.
function extractPartialMessage(raw: string): string | null {
  if (!raw) return null;
  let text = raw.trim();
  text = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  if (!text.startsWith("{")) return null;
  const keyIdx = text.search(/"message"\s*:\s*"/);
  if (keyIdx === -1) return null;
  const startQuote = text.indexOf('"', text.indexOf(":", keyIdx)) + 1;
  let out = "";
  let i = startQuote;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", "/": "/" };
      out += map[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === '"') return scrubMarkers(out);
    out += ch;
    i++;
  }
  return scrubMarkers(out);
}

// ============================== Top-level tab ==============================

export function AiTab({ caseId, isPaid, questionsUsed, ask, generate }: {
  caseId: string | null; isPaid: boolean; questionsUsed: number; ask?: string | null; generate?: string | null;
}) {
  const [used, setUsed] = useState(questionsUsed);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const remaining = Math.max(0, FREE_AI_QUESTIONS - used);
  const navigateAi = useNavigate();

  // Realtime subscription to profiles so the counter stays accurate across tabs.
  useEffect(() => {
    let cancelled = false;
    let channel: any;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      channel = supabase
        .channel(`profile-ai-${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          (payload) => {
            const next = (payload.new as any)?.ai_questions_used;
            if (typeof next === "number") setUsed(next);
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Auto-open upgrade modal as soon as the free quota hits zero.
  useEffect(() => {
    if (!isPaid && remaining === 0) setShowUpgrade(true);
  }, [isPaid, remaining]);

  // Legacy ?generate=<docType> URL — redirect to the dedicated generate
  // page so the chat panel is never responsible for document generation.
  useEffect(() => {
    if (!caseId || !generate) return;
    setPrefill("document", { documentType: generate });
    navigateAi({
      to: "/cases/$caseId/generate",
      params: { caseId },
      replace: true,
    } as any);
  }, [caseId, generate, navigateAi]);

  return (
    <div className="space-y-6">
      <ChatPanel
        caseId={caseId}
        isPaid={isPaid}
        remaining={remaining}
        ask={ask ?? null}
        onConsumed={(newUsed) => setUsed(newUsed)}
        onLimitHit={() => setShowUpgrade(true)}
      />

      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade to keep going</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You've used your 3 free AI questions. Upgrade for unlimited AI chat,
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


// ============================== Chat ==============================

function ChatPanel(props: {
  caseId: string | null; isPaid: boolean; remaining: number; ask: string | null;
  onConsumed: (used: number) => void; onLimitHit: () => void;
}) {
  const loadFn = useServerFn(loadConversation);
  const [loaded, setLoaded] = useState(false);
  const [initial, setInitial] = useState<UIMessage[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!props.caseId) {
      // Unscoped chat — fresh session every time, no DB persistence.
      setInitial([]);
      setStartedAt(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await loadFn({ data: { caseId: props.caseId! } });
        if (cancelled) return;
        setInitial((res.messages ?? []) as UIMessage[]);
        setStartedAt(res.started_at);
      } catch (err) {
        console.warn("Failed to load chat history", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [props.caseId, loadFn]);

  if (!loaded) {
    return (
      <Card className="overflow-hidden border-none shadow-none bg-transparent">
        <div className="p-4 flex items-center gap-2">
          <div className="rounded-md bg-accent/10 p-1.5"><Sparkles className="h-4 w-4 text-accent" /></div>
          <div className="text-xs text-muted-foreground">Loading conversation…</div>
        </div>
        <div className="h-[480px] flex items-center justify-center text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </Card>
    );
  }


  return <ChatPanelInner {...props} initialMessages={initial} startedAt={startedAt} />;
}

const COLLECT_QUESTIONS: Record<string, string> = {
  landlord_name: "What's your landlord's name?",
  property_management_company: "Who's the property management company? (If none, say 'none'.)",
  monthly_rent: "What's your monthly rent? (just the number is fine)",
  lease_end_date: "When does your lease end? (a date, e.g. 2026-05-01 or 'May 1 2026')",
  lease_status: "What's your lease status — month-to-month, fixed-term, or expired?",
  employment_type: "Is this full-time, part-time, contract, or at-will?",
  supervisor_name: "Who's your direct supervisor?",
  work_location: "Where do you work — office, remote, hybrid, or on-site?",
  has_written_contract: "Do you have a written employment contract? (yes or no)",
};

const COLLECT_LABELS: Record<string, string> = {
  landlord_name: "landlord",
  property_management_company: "property management company",
  monthly_rent: "monthly rent",
  lease_end_date: "lease end date",
  lease_status: "lease status",
  employment_type: "employment type",
  supervisor_name: "supervisor",
  work_location: "work location",
  has_written_contract: "written contract status",
};

function parseCollectedValue(
  field: string,
  raw: string,
): { value: any; display: string } | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "Please type an answer." };
  switch (field) {
    case "monthly_rent": {
      const n = parseFloat(t.replace(/[^\d.]/g, ""));
      if (!Number.isFinite(n) || n <= 0) return { error: "Couldn't read that as a number." };
      return { value: n, display: `$${n.toLocaleString()}` };
    }
    case "lease_end_date": {
      const d = new Date(t);
      if (Number.isNaN(+d)) return { error: "Couldn't read that as a date." };
      const iso = d.toISOString().slice(0, 10);
      return { value: iso, display: iso };
    }
    case "has_written_contract": {
      const low = t.toLowerCase();
      if (/^(y|yes|yeah|yep|true|i do|i have)/.test(low)) return { value: true, display: "yes" };
      if (/^(n|no|nope|none|false|i don'?t|i do not)/.test(low)) return { value: false, display: "no" };
      return { error: "Please answer yes or no." };
    }
    case "property_management_company": {
      if (/^(none|n\/?a|no)$/i.test(t)) return { value: null, display: "none" };
      return { value: t, display: t };
    }
    case "lease_status":
    case "employment_type":
    case "work_location": {
      return { value: t.toLowerCase(), display: t.toLowerCase() };
    }
    default:
      return { value: t, display: t };
  }
}

function ChatPanelInner({ caseId, isPaid, remaining, ask, onConsumed, onLimitHit, initialMessages, startedAt }: {
  caseId: string | null; isPaid: boolean; remaining: number; ask: string | null;
  onConsumed: (used: number) => void; onLimitHit: () => void;
  initialMessages: UIMessage[]; startedAt: string | null;
}) {
  const [input, setInput] = useState("");
  const consume = useServerFn(consumeAiQuestion);
  const saveFn = useServerFn(saveConversation);
  const scrollRef = useRef<HTMLDivElement>(null);
  const askFired = useRef(false);
  const pendingUploadRef = useRef<PendingUpload | null>(null);
  const pendingCollectRef = useRef<{ field: string } | null>(null);
  const navigateCollect = useNavigate();
  const qcCollect = useQueryClient();

  // Pull case title so the chat header can name what the conversation is anchored to.
  const { data: caseRow } = useQuery({
    queryKey: ["case-header", caseId],
    queryFn: async () => {
      if (!caseId) return null;
      const { data } = await supabase
        .from("cases")
        .select("title,opposing_party")
        .eq("id", caseId)
        .maybeSingle();
      return data;
    },
    enabled: !!caseId,
  });
  const anchorLabel = (caseRow?.opposing_party?.trim() || caseRow?.title || "").trim();


  // (Insight follow-up is now handled via ?ask=insight:<id> in the auto-fire
  // effect below so it sends immediately instead of pre-filling the input.)


  const sessionKey = caseId ?? "unscoped";
  const transport = useRef(new DefaultChatTransport({
    api: "/api/chat",
    fetch: async (url, init) => {
      const { data } = await supabase.auth.getSession();
      const headers = new Headers(init?.headers);
      if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
      let body = init?.body;
      if (typeof body === "string") {
        const parsed = JSON.parse(body);
        parsed.caseId = caseId;
        body = JSON.stringify(parsed);
      }
      return fetch(url, { ...init, headers, body });
    },
  })).current;

  const { messages, sendMessage, setMessages, status } = useChat({
    id: sessionKey,
    messages: initialMessages,
    transport,
    onError: (err) => toast.error(err.message || "Chat failed"),
    onFinish: ({ messages: latest }) => {
      if (!caseId) return; // no persistence for unscoped chat
      saveFn({ data: { caseId, messages: latest as any[] } }).catch((err) =>
        console.warn("Failed to save chat history", err),
      );
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function doSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // Intercept: collecting a missing profile field. Save the answer directly
    // to the case row without spending an AI question.
    if (pendingCollectRef.current && caseId) {
      const field = pendingCollectRef.current.field;
      const parsed = parseCollectedValue(field, trimmed);
      if ("error" in parsed) {
        toast.error(parsed.error);
        return;
      }
      pendingCollectRef.current = null;
      setInput("");
      const userMsg: any = {
        id: `collect-u-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: trimmed }],
      };
      const ackMsg: any = {
        id: `collect-a-${Date.now() + 1}`,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `Saved — I noted your ${COLLECT_LABELS[field] ?? field} as "${parsed.display}". You can update it any time from the file profile.`,
          },
        ],
      };
      const nextMessages = [...messages, userMsg, ackMsg];
      setMessages(nextMessages as any);
      try {
        const { error } = await supabase
          .from("cases")
          .update({ [field]: parsed.value } as any)
          .eq("id", caseId);
        if (error) throw error;
        qcCollect.invalidateQueries({ queryKey: ["case", caseId] });
        qcCollect.invalidateQueries({ queryKey: ["cases"] });
        saveFn({ data: { caseId, messages: nextMessages as any[] } }).catch(() => {});
        // Clear the collect param from the URL so a refresh doesn't re-seed.
        navigateCollect({
          to: "/cases/$caseId",
          params: { caseId },
          search: { tab: "ai" } as any,
          replace: true,
        } as any);
      } catch (e: any) {
        toast.error(e?.message ?? "Could not save");
      }
      return;
    }

    // Fire the question-counter decrement in parallel — don't block streaming on it.
    if (!isPaid) {
      consume()
        .then((result) => {
          onConsumed(typeof result.used === "number" ? result.used : 0);
        })
        .catch((err: any) => {
          if (err?.message?.includes("FREE_LIMIT_REACHED")) {
            onLimitHit();
          } else {
            console.warn("consumeAiQuestion failed", err);
          }
        });
    }
    setInput("");
    await sendMessage({ text: trimmed });
  }


  // Auto-fire the first AI response when ?ask=event:<id> / alert:<id> / urgent:<caseId> is present.
  useEffect(() => {
    if (askFired.current) return;
    if (!ask) return;
    const isCollect = ask.startsWith("collect:");
    if (!isCollect && messages.length > 0) return; // don't auto-send into an existing convo
    askFired.current = true;
    (async () => {
      const [kind, id] = ask.split(":");
      let prompt = "";
      try {
        if (kind === "event" && id) {
          const { data } = await supabase
            .from("incidents")
            .select("title,what_happened,occurred_at,who_involved,location,notes")
            .eq("id", id)
            .maybeSingle();
          if (data) {
            prompt =
              `[CONTEXT] Asking about a logged event:\n` +
              `Title: ${data.title}\n` +
              `When: ${new Date(data.occurred_at).toLocaleString()}\n` +
              (data.who_involved ? `Who: ${data.who_involved}\n` : "") +
              (data.location ? `Where: ${data.location}\n` : "") +
              `What happened: ${data.what_happened}\n` +
              (data.notes ? `Notes: ${data.notes}\n` : "") +
              `\nReact to this event specifically — what stands out, what to watch for, and one concrete next step.`;
          }
        } else if (kind === "alert" && id) {
          const { data } = await supabase
            .from("notifications")
            .select("title,body,type")
            .eq("id", id)
            .maybeSingle();
          if (data) {
            prompt =
              `[CONTEXT] Discussing this alert:\n` +
              `Title: ${data.title}\n` +
              `Detail: ${data.body}\n\n` +
              `React to the alert's importance for this file and ask one relevant follow-up question if appropriate.`;
          }
        } else if (kind === "insight" && id) {
          const { data } = await supabase
            .from("document_insights")
            .select("insight_title,brief_description,full_guidance")
            .eq("id", id)
            .maybeSingle();
          if (data) {
            prompt =
              `[CONTEXT] The user tapped "Tell me more" on this insight:\n` +
              `Title: ${data.insight_title}\n` +
              `Brief: ${data.brief_description}\n` +
              (data.full_guidance ? `Guidance: ${data.full_guidance}\n` : "") +
              `\nReact to this specific insight — what it means for this file, why it matters, and one concrete next step. Don't restate the insight verbatim.`;
          }

        } else if (kind === "urgent" && id) {
          prompt =
            `[CONTEXT] The check-in surfaced an urgent issue on this file. Brief me on the most important active concern and one concrete next step I should take right now.`;
        } else if (kind === "collect" && id && caseId) {
          const question = COLLECT_QUESTIONS[id];
          if (question) {
            pendingCollectRef.current = { field: id };
            const seedMsg: any = {
              id: `collect-q-${Date.now()}`,
              role: "assistant",
              parts: [{ type: "text", text: question }],
            };
            setMessages([...messages, seedMsg] as any);
          }
          return;
        }
      } catch (err) {
        console.warn("ask context load failed", err);
      }
      if (!prompt) return;
      await doSend(prompt);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);


  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await doSend(input);
  }

  const historyLabel = useMemo(() => {
    if (!startedAt) return null;
    const days = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000);
    if (days <= 0) return "Conversation started today";
    if (days === 1) return "Conversation started yesterday";
    if (days < 30) return `Conversation started ${days} days ago`;
    if (days < 365) return `Conversation started ${Math.floor(days / 30)} mo ago`;
    return `Conversation started ${new Date(startedAt).toLocaleDateString()}`;
  }, [startedAt]);

  const unscopedSuggestions = [
    "I have a new situation I want to start a file for.",
    "Help me think through something on one of my files.",
    "What should I be documenting right now?",
  ];
  const scopedSuggestions = [
    "What are my strongest pieces of evidence?",
    "What laws apply to my situation?",
    "Who can help me with this?",
    "What should I document next?",
  ];
  const empty = messages.length === 0;
  const emptyTitle = caseId
    ? "Ask anything about your file. I have your full file in context — every event and every piece of evidence."
    : "What's going on? Describe a new situation, mention an existing File, or drop in evidence.";

  return (
    <Card className="overflow-hidden border bg-card">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-accent shrink-0" />
          <div className="min-w-0 truncate text-sm">
            {anchorLabel ? (
              <>
                <span className="text-muted-foreground">on:</span>{" "}
                <span className="font-medium">{anchorLabel}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Companion — start anywhere</span>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground shrink-0">
          {isPaid ? "Unlimited" : `${remaining} of ${FREE_AI_QUESTIONS} left`}
        </div>
      </div>

      {historyLabel && messages.length > 0 && (
        <div className="px-4 py-1 text-[10px] uppercase tracking-wide text-muted-foreground/70 text-center">
          {historyLabel} · {messages.length} message{messages.length === 1 ? "" : "s"}
        </div>
      )}

      <div ref={scrollRef} className="h-[480px] overflow-y-auto px-4 pt-2 pb-4 space-y-4">

        {empty && !ask && (
          <div className="text-center text-sm text-muted-foreground py-10">
            {emptyTitle}
            <div className="mt-3 grid gap-2 max-w-md mx-auto text-left">
              {(caseId ? scopedSuggestions : unscopedSuggestions).map((s) => (
                <button key={s} onClick={() => doSend(s)}
                  className="rounded-md border bg-background p-2 text-xs hover:border-accent text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m: UIMessage) => (
          <ChatMessage
            key={m.id}
            message={m}
            caseId={caseId}
            onTapSuggestion={doSend}
            pendingUploadRef={pendingUploadRef}
          />
        ))}

        {status === "submitted" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <ChatComposer
        caseId={caseId}
        disabled={isLoading || (!isPaid && remaining === 0)}
        placeholder={isPaid || remaining > 0
          ? (caseId ? "Ask about your file…" : "Tell me what's going on…")
          : "Free questions used — upgrade to continue"}
        input={input}
        setInput={setInput}
        onSubmit={(e) => handleSend(e)}
        onUploaded={(filename, pending) => {
          if (pending) pendingUploadRef.current = pending;
          void doSend(`[uploaded evidence: ${filename}]`);
        }}
        isLoading={isLoading}
      />
    </Card>
  );
}

function ChatComposer({
  caseId, disabled, placeholder, input, setInput, onSubmit, onUploaded, isLoading,
}: {
  caseId: string | null; disabled: boolean; placeholder: string;
  input: string; setInput: (s: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onUploaded: (filename: string, pending?: PendingUpload) => void;
  isLoading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const analyze = useServerFn(analyzeDocument);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      if (caseId) {
        // File-scoped: upload + create document row in this case.
        const path = `${user.id}/${caseId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("case-documents")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: inserted, error: dbErr } = await supabase
          .from("documents")
          .insert({
            case_id: caseId, user_id: user.id,
            file_name: file.name, storage_path: path,
            file_size: file.size, mime_type: file.type,
          })
          .select()
          .single();
        if (dbErr) throw dbErr;
        toast.success("Evidence added");
        onUploaded(file.name);
        if (inserted) {
          analyze({ data: { documentId: inserted.id } })
            .catch((err) => console.warn("analyze failed", err));
        }
      } else {
        // Unscoped /ai companion: no File context yet. Best-effort stash the
        // bytes under the user's pending folder and hand the filename to the
        // AI so its routing rules ask which File to attach to (or kick off
        // File creation). NEVER block the upload.
        const path = `${user.id}/pending/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("case-documents")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        toast.success("Got it — I'll ask where to file this.");
        onUploaded(file.name, {
          storagePath: path,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !disabled && !uploading) void handleFile(f);
      }}
      className={cn(
        "px-3 pt-2 pb-3 transition-colors",
        dragOver && "bg-accent/10 ring-2 ring-accent/40 ring-inset",
      )}
    >
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
        accept="image/*,application/pdf,.doc,.docx,.txt,.eml,.msg"
      />
      <div className="flex items-end gap-1.5">
        <button
          type="button"
          disabled={uploading || disabled}
          onClick={() => fileRef.current?.click()}
          title="Attach evidence"
          className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50 transition"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={dragOver ? "Drop to attach evidence…" : placeholder}
          disabled={disabled}
          autoFocus
          className="flex-1 border-0 bg-secondary/60 focus-visible:ring-1 focus-visible:ring-ring shadow-none"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim() || disabled}
          className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-sky-600 text-white hover:bg-sky-600/90 disabled:opacity-40 transition"
          aria-label="Send"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );
}


// ============================== Structured message renderer ==============================

function ChatMessage({ message, caseId, onTapSuggestion, pendingUploadRef }: {
  message: UIMessage; caseId: string | null; onTapSuggestion: (text: string) => void;
  pendingUploadRef: React.MutableRefObject<PendingUpload | null>;
}) {
  const text = message.parts.map((p: any) => p.type === "text" ? p.text : "").join("");
  const isUser = message.role === "user";

  if (isUser) {
    // Hide synthetic [CONTEXT] auto-prompts (sent by Ask-about-this / alert discussion).
    if (text.trim().startsWith("[CONTEXT]")) {
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-full bg-secondary px-3 py-1 text-[11px] text-muted-foreground italic">
            Asking RECEIPTS AI to react…
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-sky-600 text-white px-4 py-2 text-sm whitespace-pre-wrap shadow-sm">
          {text}
        </div>
      </div>
    );
  }

  const structured = tryParseStructured(text);

  if (!structured) {
    // Either still streaming, or strict JSON parse failed. In both cases pull
    // out the partial/recoverable "message" field so the user NEVER sees raw
    // JSON, code fences, or an empty bubble. Render the partial inside the
    // SAME bubble styling StaggeredBeats uses, so the response never visibly
    // snaps from raw-text to bubble once the JSON closes.
    const trimmed = text.trim();
    const looksJson = trimmed.startsWith("{") || trimmed.startsWith("```");
    const partial = looksJson ? extractPartialMessage(text) : null;
    const display = looksJson ? (partial ?? "") : text;
    return (
      <div className="max-w-[95%] text-sm space-y-2">
        {display ? (
          <div
            className="rounded-2xl bg-secondary px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: renderInline(display) }}
          />
        ) : (
          <div className="rounded-2xl bg-secondary px-3.5 py-2.5 leading-relaxed text-muted-foreground italic">
            Composing…
          </div>
        )}
      </div>
    );
  }


  // Prefer the structured beats[] array when the model provides it. Fall back
  // to splitting message text on legacy "\n---\n" markers for backward
  // compatibility, and lift any trailing "[Q] ..." beat into clarifying.
  let beats: string[];
  let clarifying: string | null = structured.clarifying_question ?? null;
  if (structured.beats && structured.beats.length > 0) {
    beats = structured.beats;
  } else {
    const rawBeats = structured.message
      .split(/\n\s*---\s*\n/g)
      .map((b) => b.trim())
      .filter(Boolean);
    beats = [];
    for (const b of rawBeats) {
      if (b.startsWith("[Q]") && clarifying === null) {
        clarifying = b.replace(/^\[Q\]\s*/, "");
      } else {
        beats.push(b);
      }
    }
  }

  return (
    <div className="max-w-[95%] text-sm space-y-2">
      <StaggeredBeats beats={beats} />
      {clarifying && (
        <ClarifyingQuestion
          question={clarifying}
          onAnswer={(ans) => onTapSuggestion(ans)}
        />
      )}
      {structured.actions && structured.actions.length > 0 && (
        <ActionCards caseId={caseId} actions={structured.actions} pendingUploadRef={pendingUploadRef} />
      )}
      {structured.partners && structured.partners.length > 0 && (
        <div className="space-y-2">
          {structured.partners.map((p, i) => <PartnerCard key={i} partner={p} />)}
        </div>
      )}
      {structured.resources && structured.resources.length > 0 && (
        <div className="grid gap-2">
          {structured.resources.map((r, i) => <ResourceCard key={i} resource={r} />)}
        </div>
      )}
      {structured.document_refs && structured.document_refs.length > 0 && caseId && (
        <DocumentRefList caseId={caseId} ids={structured.document_refs} />
      )}
      {structured.suggestions && structured.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {structured.suggestions.map((s, i) => (
            <button key={i} onClick={() => onTapSuggestion(s)}
              className="rounded-full bg-secondary hover:bg-secondary/70 text-xs px-3 py-1.5 text-foreground/80">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StaggeredBeats({ beats }: { beats: string[] }) {
  // Show beats one-by-one with a 900ms stagger; first beat is immediate.
  const [visible, setVisible] = useState(1);
  useEffect(() => {
    setVisible(1);
    if (beats.length <= 1) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < beats.length; i++) {
      const delay = i * 1000;
      timers.push(setTimeout(() => setVisible((v) => Math.max(v, i + 1)), delay));
    }
    return () => { timers.forEach(clearTimeout); };
  }, [beats.join("\n---\n")]);

  return (
    <div className="space-y-2">
      {beats.slice(0, visible).map((b, i) => (
        <div
          key={i}
          className="rounded-2xl bg-secondary px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-1 duration-300"
          dangerouslySetInnerHTML={{ __html: renderInline(b) }}
        />
      ))}
    </div>
  );
}

function renderInline(text: string) {
  const esc = text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  return esc.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function ActionCards({ caseId, actions, pendingUploadRef }: {
  caseId: string | null;
  actions: StructuredAction[];
  pendingUploadRef: React.MutableRefObject<PendingUpload | null>;
}) {
  const navigate = useNavigate();
  const analyze = useServerFn(analyzeDocument);

  function matchDocType(label: string): string | null {
    const lower = label.toLowerCase();
    const found = DOCUMENT_TYPES.find((t) => lower.includes(t.toLowerCase()));
    return found ?? null;
  }

  function pickCaseId(a: StructuredAction): string | null {
    const anyA = a as any;
    const pref =
      a.prefill?.caseId ?? a.prefill?.case_id ??
      a.prefill?.fileId ?? a.prefill?.file_id ??
      anyA.caseId ?? anyA.case_id;
    return (typeof pref === "string" && pref) ? pref : caseId;
  }

  async function attachPendingToFile(targetCaseId: string) {
    const pending = pendingUploadRef.current;
    if (!pending) {
      toast.error("No pending upload to attach.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    const newPath = `${user.id}/${targetCaseId}/${Date.now()}-${pending.fileName}`;
    const { error: moveErr } = await supabase.storage
      .from("case-documents")
      .move(pending.storagePath, newPath);
    if (moveErr) throw moveErr;
    const { data: inserted, error: dbErr } = await supabase
      .from("documents")
      .insert({
        case_id: targetCaseId, user_id: user.id,
        file_name: pending.fileName, storage_path: newPath,
        file_size: pending.fileSize, mime_type: pending.mimeType,
      })
      .select()
      .single();
    if (dbErr) throw dbErr;
    pendingUploadRef.current = null;
    toast.success("Evidence attached to your File");
    if (inserted) {
      analyze({ data: { documentId: inserted.id } }).catch((e) => console.warn("analyze failed", e));
    }
    navigate({ to: "/cases/$caseId", params: { caseId: targetCaseId },
      search: { tab: "documents" } } as any);
  }

  // Navigation actions are owned by real UI in the case overview now,
  // not by the chat. Filter them out before rendering.
  const NAV_TYPES = new Set<StructuredActionType>([
    "open_file", "open_evidence_vault", "open_resources", "open_alert",
  ]);
  const visibleActions = actions.filter((a) => {
    if (NAV_TYPES.has(a.type)) return false;
    if (/\btimeline\b/i.test(a.label)) return false;
    return true;
  });

  function isGenerate(a: StructuredAction) {
    if (a.type === "generate_document") return true;
    return [
      "send_preservation_demand",
      "create_written_record",
      "draft_followup_email",
      "generate_police_report",
      "generate_footage_request",
      "log_spoliation",
    ].includes(a.type);
  }

  async function handle(a: StructuredAction) {
    console.info("[ai-action] click", { type: a.type, label: a.label, prefill: a.prefill, currentCaseId: caseId });
    try {
      if (a.type === "attach_evidence_to_file") {
        const target = pickCaseId(a);
        if (!target) { toast.error("Pick a File to attach to."); return; }
        await attachPendingToFile(target);
        return;
      }

      // generate_document and specialized doc actions both route to the
      // dedicated generate page — chat is no longer responsible for the
      // generation flow. Pass prefill via search params so the destination
      // can pre-select the document type and pre-fill known details
      // without depending on sessionStorage.
      const specializedDocType: Record<string, string> = {
        send_preservation_demand: "Preservation Demand Letter",
        create_written_record: "Contemporaneous Written Record",
        draft_followup_email: "Follow-Up Email",
        generate_police_report: "Police Report Summary",
        generate_footage_request: "Business Footage Request Letter",
        log_spoliation: "Spoliation of Evidence Notice",
      };
      if (isGenerate(a)) {
        const target = pickCaseId(a);
        if (!target) {
          toast.message("Pick a File to draft this for.");
          navigate({ to: "/cases" } as any);
          return;
        }
        const pre = (a.prefill ?? {}) as Record<string, any>;
        const anyA = a as any;
        const docType =
          specializedDocType[a.type] ??
          matchDocType(a.label) ??
          (typeof pre.documentType === "string" ? pre.documentType : null) ??
          (typeof pre.document_type === "string" ? pre.document_type : null) ??
          (typeof anyA.document_type === "string" ? anyA.document_type : null);
        const recipientType =
          (typeof pre.recipientType === "string" ? pre.recipientType : null) ??
          (typeof pre.recipient_type === "string" ? pre.recipient_type : null) ??
          (typeof anyA.recipient_type === "string" ? anyA.recipient_type : null);
        const recipientName =
          (typeof pre.recipientName === "string" ? pre.recipientName : null) ??
          (typeof pre.recipient_name === "string" ? pre.recipient_name : null);
        const keyFacts =
          (typeof pre.keyFacts === "string" ? pre.keyFacts : null) ??
          (typeof pre.key_facts === "string" ? pre.key_facts : null) ??
          (typeof pre.body === "string" ? pre.body : null) ??
          (typeof pre.description === "string" ? pre.description : null);

        // Also stash full prefill (incident_ids/document_ids etc.) for the
        // destination — search params only carry the headline fields.
        setPrefill("document", {
          ...pre,
          ...(docType ? { documentType: docType } : {}),
          ...(recipientType ? { recipientType } : {}),
          ...(recipientName ? { recipientName } : {}),
          ...(keyFacts ? { keyFacts } : {}),
          actionLabel: a.label,
        });

        const search: Record<string, string> = {};
        if (docType) search.type = docType;
        if (recipientType) search.recipient = recipientType;
        if (recipientName) search.to = recipientName;
        if (keyFacts) search.facts = keyFacts;

        console.info("[ai-action] -> navigate /cases/$caseId/generate", { target, search });
        navigate({
          to: "/cases/$caseId/generate",
          params: { caseId: target },
          search,
        } as any);
        return;
      }

      // File-scoped actions: need a caseId
      const target = pickCaseId(a);
      if (!target) {
        toast.message("Pick a File to continue.");
        navigate({ to: "/cases" } as any);
        return;
      }

      if (a.type === "log_incident") {
        if (a.prefill) setPrefill("incident", a.prefill);
        navigate({ to: "/cases/$caseId", params: { caseId: target },
          search: { tab: "incidents", action: "new" } } as any);
        return;
      }
      if (a.type === "upload_evidence") {
        if (a.prefill) setPrefill("document", a.prefill);
        navigate({ to: "/cases/$caseId", params: { caseId: target },
          search: { tab: "documents", action: "upload" } } as any);
        return;
      }
      if (a.type === "file_complaint" || a.type === "find_resource") {
        navigate({ to: "/resources" } as any);
        return;
      }
      if (a.type === "log_witness") {
        setPrefill("incident", {
          title: "Witness account",
          ...(a.prefill ?? {}),
        });
        navigate({ to: "/cases/$caseId", params: { caseId: target },
          search: { tab: "incidents", action: "new" } } as any);
        return;
      }
      console.warn("[ai-action] unhandled action type", a);
    } catch (err: any) {
      console.error("[ai-action] failed", { action: a, error: err });
      toast.error(err?.message ?? "Action failed");
    }
  }

  if (visibleActions.length === 0) return null;

  return (
    <div className="grid gap-1">
      {visibleActions.map((a, i) => {
        if (isGenerate(a)) {
          // Quiet, muted row — distinguishes a lightweight suggestion from a
          // real button-style action elsewhere in the app.
          return (
            <button
              key={i}
              onClick={() => handle(a)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">{a.label}</span>
              <ArrowRight className="h-3 w-3 opacity-60" />
            </button>
          );
        }
        return (
          <button
            key={i}
            onClick={() => handle(a)}
            className="flex items-center justify-between gap-3 rounded-lg bg-primary text-primary-foreground px-4 py-3 text-sm font-medium hover:bg-primary/90 transition text-left"
          >
            <span>{a.label}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}


function ResourceCard({ resource }: { resource: StructuredResource }) {
  return (
    <a href={resource.url} target="_blank" rel="noopener noreferrer"
      className="group flex items-start justify-between gap-3 rounded-lg border bg-background p-3 hover:border-accent">
      <div className="min-w-0">
        <div className="font-medium text-sm">{resource.name}</div>
        {resource.description && (
          <div className="text-xs text-muted-foreground mt-0.5">{resource.description}</div>
        )}
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-accent shrink-0" />
    </a>
  );
}

function PartnerCard({ partner }: { partner: StructuredPartner }) {
  const contact = partner.contact?.trim();
  const isEmail = contact?.includes("@");
  const isUrl = contact?.startsWith("http");
  const href = contact
    ? (isEmail ? `mailto:${contact}` : isUrl ? contact : `tel:${contact}`)
    : null;
  const subline = [partner.specialty, partner.location].filter(Boolean).join(" · ");
  return (
    <div className="space-y-1.5">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
          <Check className="h-3.5 w-3.5" /> Verified Pull Up Receipts Partner
        </div>
        <div>
          <div className="font-semibold text-[15px]">{partner.name}</div>
          {subline && <div className="text-xs text-muted-foreground mt-0.5">{subline}</div>}
        </div>
        {href && (
          <a href={href} target={isUrl ? "_blank" : undefined} rel="noopener noreferrer" className="inline-block">
            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
              {isEmail ? <Mail className="h-3.5 w-3.5 mr-1" /> : isUrl ? <ExternalLink className="h-3.5 w-3.5 mr-1" /> : <Phone className="h-3.5 w-3.5 mr-1" />}
              Contact
            </Button>
          </a>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground px-1">
        No pressure either way — your file stays just as strong if you keep going solo.
      </p>
    </div>
  );
}

function DocumentRefList({ caseId, ids }: { caseId: string; ids: string[] }) {
  const navigate = useNavigate();
  const { data: docs } = useQuery({
    queryKey: ["docs-by-ids", caseId, ids.join(",")],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const { data } = await supabase.from("documents").select("id,file_name").in("id", ids);
      return data ?? [];
    },
    enabled: ids.length > 0,
  });
  if (!docs || docs.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      {docs.map((d) => (
        <button key={d.id}
          onClick={() => navigate({ to: "/cases/$caseId", params: { caseId }, search: { tab: "documents" } } as any)}
          className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs hover:border-accent text-left">
          <FileSearch className="h-3.5 w-3.5 text-accent shrink-0" />
          <span className="truncate font-medium">{d.file_name}</span>
        </button>
      ))}
    </div>
  );
}
