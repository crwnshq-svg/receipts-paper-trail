import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { inferCaseDraft } from "@/lib/cases.functions";

export const Route = createFileRoute("/_authenticated/cases_/new")({
  head: () => ({ meta: [{ title: "Start a File — Pull Up Receipts" }] }),
  component: NewCase,
});

const MODULE_LABEL: Record<string, string> = {
  landlord_tenant: "Landlord / Tenant",
  employer_employee: "Employer / Employee",
  neighbor: "Neighbor",
  other: "Other / General",
};

type Step =
  | { kind: "ask" }
  | { kind: "thinking"; userText: string }
  | { kind: "confirm"; userText: string; module: string; party: string | null; friendly: string }
  | { kind: "edit"; userText: string; module: string; party: string };

function NewCase() {
  const navigate = useNavigate();
  const inferFn = useServerFn(inferCaseDraft);
  const [step, setStep] = useState<Step>({ kind: "ask" });
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const userText = text.trim();
    setStep({ kind: "thinking", userText });
    try {
      const res = await inferFn({ data: { text: userText } });
      setStep({
        kind: "confirm",
        userText,
        module: res.module_type,
        party: res.opposing_party,
        friendly: res.friendly || `Sounds like a ${MODULE_LABEL[res.module_type]?.toLowerCase()} situation${res.opposing_party ? ` with ${res.opposing_party}` : ""}.`,
      });
    } catch (err) {
      console.warn(err);
      setStep({
        kind: "confirm",
        userText,
        module: "other",
        party: null,
        friendly: "Let's set this up — pick the type and the other party.",
      });
    }
  }

  async function createCase(module: string, party: string | null, userText: string) {
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const title = party ?? "Untitled file";
      const { data, error } = await supabase.from("cases").insert({
        user_id: user.id,
        title,
        dispute_type: module as never,
        opposing_party: party,
        description: userText,
      }).select().single();
      if (error) throw error;
      toast.success("File started");
      navigate({ to: "/cases/$caseId", params: { caseId: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start file");
      setCreating(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="font-serif text-3xl font-semibold">Start a File</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your file. Documented and proven. Tell me what's going on in your own words.
        </p>

        <Card className="mt-6 p-6 space-y-4">
          {/* AI bubble: opening question */}
          <Bubble>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent mb-1">
              <Sparkles className="h-3 w-3" /> RECEIPTS AI
            </div>
            What's going on?
          </Bubble>

          {step.kind === "ask" && (
            <form onSubmit={handleAskSubmit} className="space-y-3">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="In a few sentences, tell me what's happening and who else is involved."
                rows={4}
                autoFocus
                required
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={!text.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  Continue
                </Button>
              </div>
            </form>
          )}

          {step.kind !== "ask" && (
            <UserBubble>{step.userText}</UserBubble>
          )}

          {step.kind === "thinking" && (
            <Bubble>
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Thinking…
            </Bubble>
          )}

          {step.kind === "confirm" && (
            <>
              <Bubble>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent mb-1">
                  <Sparkles className="h-3 w-3" /> RECEIPTS AI
                </div>
                {step.friendly} <span className="text-muted-foreground">That right?</span>
              </Bubble>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={creating}
                  onClick={() => createCase(step.module, step.party, step.userText)}
                  className="bg-primary text-primary-foreground"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Yes, start it
                </Button>
                <Button
                  variant="outline"
                  disabled={creating}
                  onClick={() => setStep({
                    kind: "edit",
                    userText: step.userText,
                    module: step.module,
                    party: step.party ?? "",
                  })}
                >
                  Let me fix that
                </Button>
              </div>
            </>
          )}

          {step.kind === "edit" && (
            <div className="space-y-3">
              <Bubble>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-accent mb-1">
                  Quick edit
                </div>
                Adjust the type and the other party, then start the file.
              </Bubble>
              <div className="grid gap-2">
                <Select value={step.module} onValueChange={(v) => setStep({ ...step, module: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODULE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={step.party}
                  onChange={(e) => setStep({ ...step, party: e.target.value })}
                  placeholder="Other party (person, company, landlord, etc.)"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setStep({
                  kind: "confirm",
                  userText: step.userText,
                  module: step.module,
                  party: step.party.trim() || null,
                  friendly: `Sounds like a ${MODULE_LABEL[step.module]?.toLowerCase()} situation${step.party.trim() ? ` with ${step.party.trim()}` : ""}.`,
                })}>Back</Button>
                <Button
                  disabled={creating}
                  onClick={() => createCase(step.module, step.party.trim() || null, step.userText)}
                  className="bg-primary text-primary-foreground"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start the file"}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => navigate({ to: "/cases" })}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border px-3.5 py-2.5 text-sm leading-relaxed animate-in fade-in slide-in-from-bottom-1 duration-300">
      {children}
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-1 duration-300">
        {children}
      </div>
    </div>
  );
}
