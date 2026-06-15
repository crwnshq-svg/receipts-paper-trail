import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus, Trash2, StickyNote, AlertCircle, Bell, Sparkles, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AttachDocs, AttachedDocsRow } from "@/components/attach-docs";
import { popPrefill } from "@/lib/prefill";
import { analyzeIncident } from "@/lib/document-intelligence.functions";

type Incident = {
  id: string;
  case_id: string;
  title: string;
  occurred_at: string;
  who_involved: string | null;
  what_happened: string;
  location: string | null;
  notes: string | null;
  document_ids?: unknown;
  clarifying_questions?: unknown;
  created_at: string;
};

type Note = {
  id: string;
  case_id: string;
  content: string;
  reminder_at: string | null;
  reminder_sent: boolean;
  document_ids?: unknown;
  created_at: string;
};

function toIds(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function toQuestions(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as unknown[]).filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    : [];
}


export function ActivityTab({
  caseId,
  incidents,
  autoOpen,
  onChange,
}: {
  caseId: string;
  incidents: Incident[];
  autoOpen?: boolean;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [answerQ, setAnswerQ] = useState<{ incidentId: string; question: string } | null>(null);
  const callAnalyze = useServerFn(analyzeIncident);


  useEffect(() => {
    if (autoOpen) setIncidentOpen(true);
  }, [autoOpen]);

  const { data: notes = [] } = useQuery({
    queryKey: ["notes", caseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("notes")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Note[];
    },
  });

  const refetchNotes = () =>
    qc.invalidateQueries({ queryKey: ["notes", caseId] });

  // Unified chronological feed
  type Feed =
    | { kind: "incident"; at: string; data: Incident }
    | { kind: "note"; at: string; data: Note };

  const feed = useMemo<Feed[]>(() => {
    const items: Feed[] = [
      ...incidents.map<Feed>((i) => ({
        kind: "incident",
        at: i.occurred_at,
        data: i,
      })),
      ...notes.map<Feed>((n) => ({
        kind: "note",
        at: n.created_at,
        data: n,
      })),
    ];
    return items.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [incidents, notes]);

  async function removeIncident(id: string) {
    if (!confirm("Delete this event?")) return;
    const { error } = await supabase.from("incidents").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      onChange();
    }
  }

  async function removeNote(id: string) {
    if (!confirm("Delete this note?")) return;
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      refetchNotes();
    }
  }

  // Fire-and-forget AI analysis after an incident saves.
  async function triggerAnalysis(incidentId: string) {
    setAnalyzingIds((s) => new Set(s).add(incidentId));
    try {
      await callAnalyze({ data: { incidentId } });
    } catch (err) {
      console.error("analyzeIncident failed", err);
    } finally {
      setAnalyzingIds((s) => {
        const n = new Set(s);
        n.delete(incidentId);
        return n;
      });
      onChange();
    }
  }

  async function dismissQuestions(incidentId: string) {
    const { error } = await supabase
      .from("incidents")
      .update({ clarifying_questions: [] as never })
      .eq("id", incidentId);
    if (error) toast.error(error.message);
    else onChange();
  }

  async function submitAnswer(incidentId: string, question: string, answer: string) {
    const inc = incidents.find((i) => i.id === incidentId);
    if (!inc) return;
    const appended = `${inc.notes ? inc.notes + "\n\n" : ""}Q: ${question}\nA: ${answer}`;
    const remaining = toQuestions(inc.clarifying_questions).filter((q) => q !== question);
    const { error } = await supabase
      .from("incidents")
      .update({ notes: appended, clarifying_questions: remaining as never })
      .eq("id", incidentId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Answer added to event");
      setAnswerQ(null);
      onChange();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setNoteOpen(true)}
          className="border-muted-foreground/30"
        >
          <StickyNote className="mr-1 h-4 w-4" /> Add Note
        </Button>
        <Button
          onClick={() => setIncidentOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-accent"
        >
          <Plus className="mr-1 h-4 w-4" /> Log an Event
        </Button>
      </div>

      <IncidentDialog
        caseId={caseId}
        open={incidentOpen}
        onOpenChange={setIncidentOpen}
        onSaved={(newId) => {
          onChange();
          if (newId) void triggerAnalysis(newId);
        }}
      />
      <NoteDialog
        caseId={caseId}
        open={noteOpen}
        onOpenChange={setNoteOpen}
        onSaved={refetchNotes}
      />


      {feed.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No events logged yet. Log an event or add a note as things happen — details fade fast. Your file. Documented and proven.
        </Card>
      ) : (
        <ol className="space-y-3">
          {feed.map((f) =>
            f.kind === "incident" ? (
              <li key={`i-${f.data.id}`} className="space-y-2">
                <Card className="border-l-4 border-l-red-500 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-red-400">
                        <AlertCircle className="h-3 w-3" /> Event
                        <span className="font-normal text-muted-foreground">
                          · {new Date(f.data.occurred_at).toLocaleString()}
                        </span>
                        {analyzingIds.has(f.data.id) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal normal-case text-muted-foreground">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Analyzing…
                          </span>
                        )}
                      </div>
                      <div className="mt-1 font-medium">{f.data.title}</div>
                      {f.data.who_involved && (
                        <div className="mt-1.5 text-sm">
                          <span className="text-muted-foreground">Who: </span>
                          {f.data.who_involved}
                        </div>
                      )}
                      <div className="mt-1 text-sm whitespace-pre-wrap">
                        {f.data.what_happened}
                      </div>
                      {f.data.location && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Location: {f.data.location}
                        </div>
                      )}
                      {f.data.notes && (
                        <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                          {f.data.notes}
                        </div>
                      )}
                      <AttachedDocsRow
                        caseId={caseId}
                        ids={toIds(f.data.document_ids)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeIncident(f.data.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>

                {(() => {
                  const questions = toQuestions(f.data.clarifying_questions);
                  if (questions.length === 0) return null;
                  return (
                    <Card className="border-l-4 border-l-sky-400 bg-sky-500/5 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300">
                          <Sparkles className="h-3 w-3" />
                          A couple of things that could strengthen this entry
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissQuestions(f.data.id)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {questions.map((q, idx) => (
                          <li key={idx}>
                            <button
                              type="button"
                              onClick={() => setAnswerQ({ incidentId: f.data.id, question: q })}
                              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground/90 hover:bg-sky-500/10 transition-colors"
                            >
                              {q}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  );
                })()}
              </li>

            ) : (
              <li key={`n-${f.data.id}`}>
                <Card className="border-l-4 border-l-muted-foreground/40 bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <StickyNote className="h-3 w-3" /> Note
                        <span className="font-normal">
                          · {new Date(f.data.created_at).toLocaleString()}
                        </span>
                        {f.data.reminder_at && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                              f.data.reminder_sent
                                ? "bg-muted text-muted-foreground"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            <Bell className="h-2.5 w-2.5" />
                            {f.data.reminder_sent ? "Reminded" : "Reminder"}{" "}
                            {new Date(f.data.reminder_at).toLocaleString([], {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 text-sm whitespace-pre-wrap">
                        {f.data.content}
                      </div>
                      <AttachedDocsRow
                        caseId={caseId}
                        ids={toIds(f.data.document_ids)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeNote(f.data.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              </li>
            ),
          )}
        </ol>
      )}

      <Sheet open={!!answerQ} onOpenChange={(v) => { if (!v) setAnswerQ(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="text-base">Answer this question</SheetTitle>
          </SheetHeader>
          {answerQ && (
            <AnswerForm
              question={answerQ.question}
              onCancel={() => setAnswerQ(null)}
              onSubmit={(text) => submitAnswer(answerQ.incidentId, answerQ.question, text)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AnswerForm({
  question,
  onSubmit,
  onCancel,
}: {
  question: string;
  onSubmit: (text: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setSaving(true);
        try { await onSubmit(text.trim()); } finally { setSaving(false); }
      }}
      className="mt-3 space-y-3"
    >
      <p className="text-sm text-foreground/90">{question}</p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={question}
        rows={4}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving || !text.trim()} className="bg-primary text-primary-foreground">
          {saving ? "Saving…" : "Submit Answer"}
        </Button>
      </div>
    </form>
  );
}


function Field({
  label,
  children,
  aiSuggested,
}: {
  label: string;
  children: React.ReactNode;
  aiSuggested?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {aiSuggested && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
            ✨ AI suggested
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function IncidentDialog({
  caseId,
  open,
  onOpenChange,
  onSaved,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (newIncidentId?: string) => void;
}) {

  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [location, setLocation] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [docIds, setDocIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState<Record<string, boolean>>({});

  // When the dialog opens, pop any AI-supplied prefill and apply it.
  useEffect(() => {
    if (!open) return;
    const pre = popPrefill<Record<string, any>>("incident");
    if (!pre) return;
    const marks: Record<string, boolean> = {};
    if (typeof pre.title === "string") { setTitle(pre.title); marks.title = true; }
    if (typeof pre.who_involved === "string") { setWho(pre.who_involved); marks.who = true; }
    if (typeof pre.what_happened === "string") { setWhat(pre.what_happened); marks.what = true; }
    if (typeof pre.notes === "string") { setExtraNotes(pre.notes); marks.notes = true; }
    if (typeof pre.location === "string") { setLocation(pre.location); marks.location = true; }
    if (typeof pre.occurred_at === "string") {
      const d = new Date(pre.occurred_at);
      if (!isNaN(+d)) { setOccurredAt(d.toISOString().slice(0, 16)); marks.occurredAt = true; }
    }
    if (Array.isArray(pre.suggested_document_ids)) {
      setDocIds(pre.suggested_document_ids.filter((x) => typeof x === "string"));
      marks.docIds = true;
    }
    // Witness-logging prefill: fold structured witness fields into the form.
    const witnessParts = [pre.witness_name, pre.witness_contact, pre.witness_location]
      .filter((x) => typeof x === "string" && x.trim().length > 0);
    if (witnessParts.length > 0 && !marks.who) {
      setWho(`Witness: ${witnessParts.join(" — ")}`);
      marks.who = true;
    }
    if (typeof pre.witness_observations === "string" && !marks.what) {
      setWhat(pre.witness_observations);
      marks.what = true;
    }
    setPrefilled(marks);
  }, [open]);

  function reset() {
    setTitle("");
    setWho("");
    setWhat("");
    setExtraNotes("");
    setLocation("");
    setOccurredAt(new Date().toISOString().slice(0, 16));
    setDocIds([]);
    setPrefilled({});
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: inserted, error } = await supabase.from("incidents").insert({
        case_id: caseId,
        user_id: user.id,
        title,
        who_involved: who || null,
        what_happened: what,
        notes: extraNotes || null,
        location: location || null,
        occurred_at: new Date(occurredAt).toISOString(),
        document_ids: docIds as never,
      }).select("id").single();
      if (error) throw error;
      toast.success("Event logged");
      onOpenChange(false);
      reset();
      onSaved(inserted?.id);

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log an Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={add} className="space-y-3">
          <Field label="Title" aiSuggested={prefilled.title}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="What happened, in a few words"
            />
          </Field>
          <Field label="When" aiSuggested={prefilled.occurredAt}>
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required
            />
          </Field>
          <Field label="Who was involved" aiSuggested={prefilled.who}>
            <Input
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="Names or roles"
            />
          </Field>
          <Field label="What happened" aiSuggested={prefilled.what}>
            <Textarea
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              required
              rows={4}
            />
          </Field>
          <Field label="Location (optional)" aiSuggested={prefilled.location}>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
          <Field label="Notes (optional)" aiSuggested={prefilled.notes}>
            <Textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              rows={2}
            />
          </Field>

          <div className="space-y-1.5">
            <Label>Attach Evidence</Label>
            <AttachDocs caseId={caseId} value={docIds} onChange={setDocIds} />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={saving}
              className="bg-primary text-primary-foreground"
            >
              {saving ? "Saving…" : "Save event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({
  caseId,
  open,
  onOpenChange,
  onSaved,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState("");
  const [setReminder, setSetReminder] = useState(false);
  const [reminderAt, setReminderAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [docIds, setDocIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function reset() {
    setContent("");
    setSetReminder(false);
    setDocIds([]);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setReminderAt(d.toISOString().slice(0, 16));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("notes").insert({
        case_id: caseId,
        user_id: user.id,
        content,
        reminder_at: setReminder ? new Date(reminderAt).toISOString() : null,
        document_ids: docIds as never,
      });
      if (error) throw error;
      toast.success("Note saved");
      onOpenChange(false);
      reset();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a Note</DialogTitle>
        </DialogHeader>
        <form onSubmit={add} className="space-y-3">
          <Field label="Note">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={4}
              placeholder="A thought, reminder, or observation that doesn't rise to a formal event."
            />
          </Field>

          <div className="rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={setReminder}
                onChange={(e) => setSetReminder(e.target.checked)}
                className="h-4 w-4"
              />
              <Bell className="h-3.5 w-3.5" /> Set a reminder
            </label>
            {setReminder && (
              <div className="mt-2">
                <Input
                  type="datetime-local"
                  value={reminderAt}
                  onChange={(e) => setReminderAt(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  We'll send you a notification at this time.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Attach Evidence (optional)</Label>
            <AttachDocs caseId={caseId} value={docIds} onChange={setDocIds} />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={saving}
              className="bg-primary text-primary-foreground"
            >
              {saving ? "Saving…" : "Save note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
