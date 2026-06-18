import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { ReceiptText, ArrowLeft, ShieldCheck, Lightbulb, Sparkles, Check, X } from "lucide-react";
import { toast } from "sonner";
import { showAchievement } from "@/lib/achievements";
import { inferOnboardingFields } from "@/lib/onboarding.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Welcome — Pull Up Receipts" }] }),
  component: OnboardingPage,
});

type TrackKey = "renting" | "employment" | "other";

type RentStatus = "yes" | "own" | "looking" | null;
type EmpStatus = "yes" | "evaluating" | "no" | null;

type Suggestions = { sub_type: string | null; key_details: string[] };

type RentingAnswers = {
  status: RentStatus;
  propertyName: string;
  propertyCity: string;
  propertyState: string;
  intro: string;
  hasIssues: boolean | null;
  sub_type: string | null;
  key_details: string[];
};

type EmploymentAnswers = {
  status: EmpStatus;
  employer: string;
  position: string;
  salary: string;
  intro: string;
  hasIssues: boolean | null;
  helpText: string;
  sub_type: string | null;
  key_details: string[];
};

const EMPTY_RENT: RentingAnswers = {
  status: null, propertyName: "", propertyCity: "", propertyState: "",
  intro: "", hasIssues: null, sub_type: null, key_details: [],
};
const EMPTY_EMP: EmploymentAnswers = {
  status: null, employer: "", position: "", salary: "",
  intro: "", hasIssues: null, helpText: "", sub_type: null, key_details: [],
};

type Page =
  | { kind: "welcome" }
  | { kind: "name" }
  | { kind: "location" }
  | { kind: "tracks" }
  | { kind: "renting"; sub: "status" | "property" | "intro" | "suggest" | "issues" }
  | { kind: "employment"; sub: "status" | "employer" | "intro" | "suggest" | "issues" | "help" }
  | { kind: "other_ack" }
  | { kind: "done" };

const RENT_INSIGHTS: Record<string, { label: string; text: string }> = {
  status: { label: "Tenant tip", text: "In most U.S. states, your landlord must give written notice (often 24 hours) before entering — except in emergencies." },
  property: { label: "Tenant tip", text: "Keeping the property name and address on file makes it much easier to send formal notices later." },
  intro: { label: "Tenant tip", text: "A short written record of issues — even one line per week — is one of the strongest forms of evidence in housing disputes." },
  suggest: { label: "Tenant tip", text: "Habitability problems (heat, water, mold, pests) trigger specific legal duties for landlords in nearly every state." },
  issues: { label: "Tenant tip", text: "Retaliation for reporting code issues is illegal in most states — document the timing of any landlord response." },
};
const EMP_INSIGHTS: Record<string, { label: string; text: string }> = {
  status: { label: "Worker tip", text: "Federal law protects most workers' right to discuss wages with coworkers, even if your employer's policy says otherwise." },
  employer: { label: "Worker tip", text: "Your offer letter, pay stubs, and job description are your strongest baseline records — keep copies outside work email." },
  intro: { label: "Worker tip", text: "Contemporaneous notes (written when things happen) carry more weight than a summary written months later." },
  suggest: { label: "Worker tip", text: "Wage and hour claims usually have short deadlines (often 2–3 years) — don't wait long if pay is off." },
  issues: { label: "Worker tip", text: "Reporting illegal conduct in good faith is generally protected — retaliation for it is its own violation." },
  help: { label: "Worker tip", text: "Stick to facts: who, what, when, where. Save interpretation for later — facts are what stand up." },
};

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inferFn = useServerFn(inferOnboardingFields);

  const [first_name, setFirstName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [needName, setNeedName] = useState(false);
  const [needLocation, setNeedLocation] = useState(false);
  const [privacyAck, setPrivacyAck] = useState(false);

  const [tracks, setTracks] = useState<TrackKey[]>([]);
  const [trackQueue, setTrackQueue] = useState<TrackKey[]>([]);
  const [trackIdx, setTrackIdx] = useState(0);
  const [rent, setRent] = useState<RentingAnswers>(EMPTY_RENT);
  const [emp, setEmp] = useState<EmploymentAnswers>(EMPTY_EMP);

  const [page, setPage] = useState<Page>({ kind: "welcome" });
  const [history, setHistory] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);
  const [inferring, setInferring] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (!data) return;
      if (data.onboarding_completed) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      setPrivacyAck(Boolean(data.privacy_acknowledged_at));
      setFirstName(data.first_name ?? "");
      setCity(data.city ?? "");
      setState(data.state ?? "");
      setNeedName(!data.first_name);
      setNeedLocation(!(data.city && data.state));
    })();
  }, [navigate]);

  function goTo(next: Page) {
    setHistory((h) => [...h, page]);
    setPage(next);
  }
  function back() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = [...h];
      const target = prev.pop()!;
      setPage(target);
      return prev;
    });
  }

  async function persistProfile(patch: Record<string, unknown>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || v === null || v === undefined) continue;
      clean[k] = v;
    }
    if (!Object.keys(clean).length) return;
    await supabase.from("profiles").update(clean as never).eq("id", user.id);
  }

  async function recordPrivacyAck() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({
      privacy_acknowledged_at: new Date().toISOString(),
    } as never).eq("id", user.id);
  }

  function startTracks(selected: TrackKey[]) {
    setTracks(selected);
    setTrackQueue(selected);
    setTrackIdx(0);
    advanceTrack(selected, 0);
  }

  function advanceTrack(queue: TrackKey[], idx: number) {
    if (idx >= queue.length) {
      void finish();
      return;
    }
    const t = queue[idx];
    if (t === "renting") goTo({ kind: "renting", sub: "status" });
    else if (t === "employment") goTo({ kind: "employment", sub: "status" });
    else goTo({ kind: "other_ack" });
  }

  function nextTrack() {
    const nextIdx = trackIdx + 1;
    setTrackIdx(nextIdx);
    advanceTrack(trackQueue, nextIdx);
  }

  async function runInference(module: "landlord_tenant" | "employer_employee", text: string): Promise<Suggestions> {
    if (!text.trim()) return { sub_type: null, key_details: [] };
    setInferring(true);
    try {
      const out = await inferFn({ data: { module, text } });
      return out as Suggestions;
    } catch {
      return { sub_type: null, key_details: [] };
    } finally {
      setInferring(false);
    }
  }

  async function createRentingCase(userId: string) {
    if (!rent.status || rent.status === "own") return null;
    const lifecycle = rent.status === "looking" ? "pre" : "ongoing";
    const fallback = rent.status === "looking" ? "New rental search" : "My rental";
    const title = rent.propertyName.trim() || fallback;
    const introWithDetails = [rent.intro.trim(), rent.key_details.length ? `Key details: ${rent.key_details.join("; ")}` : ""]
      .filter(Boolean).join("\n\n");
    const { data: caseRow, error } = await supabase.from("cases").insert({
      user_id: userId,
      title,
      dispute_type: "landlord_tenant" as never,
      module: "landlord_tenant" as never,
      lifecycle_stage: lifecycle,
      intro_notes: introWithDetails || null,
      property_management_company: rent.propertyName.trim() || null,
      sub_type: rent.sub_type || null,
    } as never).select("id").single();
    if (error) throw error;
    if (rent.status === "yes" && rent.hasIssues === true) {
      const body = rent.intro.trim() || "Initial landlord / property concern";
      await supabase.from("incidents").insert({
        case_id: caseRow.id,
        user_id: userId,
        title: "Initial concern",
        what_happened: body,
        raw_input: body,
        occurred_at: new Date().toISOString(),
      } as never);
    }
    return caseRow.id as string;
  }

  async function createEmploymentCase(userId: string) {
    if (!emp.status || emp.status === "no") return null;
    const lifecycle = emp.status === "evaluating" ? "pre" : "ongoing";
    const title = emp.employer.trim() || "My job";
    const salaryNum = emp.salary.trim() ? Number(emp.salary.replace(/[^0-9.]/g, "")) : null;
    const introWithDetails = [emp.intro.trim(), emp.key_details.length ? `Key details: ${emp.key_details.join("; ")}` : ""]
      .filter(Boolean).join("\n\n");
    const { data: caseRow, error } = await supabase.from("cases").insert({
      user_id: userId,
      title,
      dispute_type: "employer_employee" as never,
      module: "employer_employee" as never,
      lifecycle_stage: lifecycle,
      intro_notes: introWithDetails || null,
      position: emp.position.trim() || null,
      salary: Number.isFinite(salaryNum as number) ? salaryNum : null,
      sub_type: emp.sub_type || null,
    } as never).select("id").single();
    if (error) throw error;
    if (emp.status === "yes" && emp.hasIssues === true && emp.helpText.trim()) {
      await supabase.from("incidents").insert({
        case_id: caseRow.id,
        user_id: userId,
        title: "Initial concern",
        what_happened: emp.helpText.trim(),
        raw_input: emp.helpText.trim(),
        occurred_at: new Date().toISOString(),
      } as never);
    }
    return caseRow.id as string;
  }

  async function finish() {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const createdIds: string[] = [];
      if (tracks.includes("renting")) {
        const id = await createRentingCase(user.id);
        if (id) createdIds.push(id);
      }
      if (tracks.includes("employment")) {
        const id = await createEmploymentCase(user.id);
        if (id) createdIds.push(id);
      }
      const { data: profile, error } = await supabase.from("profiles").update({
        onboarding_completed: true,
        privacy_acknowledged_at: new Date().toISOString(),
      } as never).eq("id", user.id).select("*").single();
      if (error) throw error;
      queryClient.setQueryData(["profile"], (prev: unknown) =>
        prev ? { ...(prev as object), ...profile } : profile,
      );
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      if (createdIds.length === 1) {
        navigate({ to: "/cases/$caseId", params: { caseId: createdIds[0] }, replace: true });
      } else {
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not finish onboarding");
    } finally {
      setBusy(false);
    }
  }

  async function skipAll() {
    if (!privacyAck) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      await supabase.from("profiles").update({
        onboarding_completed: true,
        privacy_acknowledged_at: new Date().toISOString(),
      } as never).eq("id", user.id);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not skip");
    } finally { setBusy(false); }
  }

  const pct = useMemo(() => {
    switch (page.kind) {
      case "welcome": return 0;
      case "name": return 10;
      case "location": return 20;
      case "tracks": return 30;
      case "other_ack": return 80;
      case "done": return 100;
      case "renting":
      case "employment": {
        const base = 35;
        const perTrack = 55 / Math.max(1, tracks.length);
        return Math.min(95, base + trackIdx * perTrack + perTrack / 2);
      }
    }
  }, [page, trackIdx, tracks.length]);

  const insight = useMemo(() => {
    if (page.kind === "renting") return RENT_INSIGHTS[page.sub];
    if (page.kind === "employment") return EMP_INSIGHTS[page.sub];
    return null;
  }, [page]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            {history.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={back} className="-ml-2 h-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <ReceiptText className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <span className="text-sm font-semibold tracking-tight">Pull Up Receipts</span>
          </div>
          <button
            onClick={skipAll}
            disabled={busy || !privacyAck}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 disabled:opacity-40"
          >
            Skip for now
          </button>
        </div>
        {page.kind !== "welcome" && (
          <div className="mx-auto w-full max-w-2xl px-4 pb-3">
            <Progress value={pct} className="h-1" />
          </div>
        )}
      </header>

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-xl flex-col px-5 py-8 sm:py-14">
          {page.kind === "welcome" && (
            <FadeIn>
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
                  <ReceiptText className="h-7 w-7 text-primary-foreground" />
                </div>
                <h1 className="mt-6 font-serif text-3xl font-semibold tracking-tight">Welcome.</h1>
                <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                  Pull Up Receipts is your personal file for any situation where you need to protect yourself.
                </p>
                <div className="mt-7 rounded-2xl border border-border bg-secondary/30 p-5 text-left">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-accent" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your privacy</span>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                    Your data is yours alone — encrypted in storage and in transit, never shared with other users. AI responses are processed by Anthropic and not used to train their models.
                  </p>
                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg p-2 -mx-2 hover:bg-secondary/50">
                    <Checkbox
                      checked={privacyAck}
                      onCheckedChange={(v) => setPrivacyAck(v === true)}
                      className="mt-0.5"
                    />
                    <span className="text-[13px] leading-snug">I understand and want to continue.</span>
                  </label>
                </div>
                <div className="mt-6 space-y-3">
                  <Button
                    onClick={() => {
                      recordPrivacyAck().catch(() => {});
                      if (needName) goTo({ kind: "name" });
                      else if (needLocation) goTo({ kind: "location" });
                      else goTo({ kind: "tracks" });
                    }}
                    disabled={!privacyAck || busy}
                    className="w-full h-11"
                  >
                    Get started
                  </Button>
                </div>
              </div>
            </FadeIn>
          )}

          {page.kind === "name" && (
            <QuestionShell q="What's your first name?">
              <Input
                autoFocus
                value={first_name}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Your first name"
                className="h-11"
              />
              <ContinueRow
                disabled={!first_name.trim()}
                onContinue={async () => {
                  await persistProfile({ first_name: first_name.trim() });
                  if (needLocation) goTo({ kind: "location" });
                  else goTo({ kind: "tracks" });
                }}
                skipLabel="Skip this"
                onSkip={() => {
                  if (needLocation) goTo({ kind: "location" });
                  else goTo({ kind: "tracks" });
                }}
              />
            </QuestionShell>
          )}

          {page.kind === "location" && (
            <QuestionShell q="Where are you located?">
              <div className="grid grid-cols-2 gap-3">
                <Input autoFocus placeholder="City" value={city}
                  onChange={(e) => setCity(e.target.value)} className="h-11" />
                <Input placeholder="State" maxLength={20} value={state}
                  onChange={(e) => setState(e.target.value)} className="h-11" />
              </div>
              <ContinueRow
                disabled={!city.trim() || !state.trim()}
                onContinue={async () => {
                  await persistProfile({ city: city.trim(), state: state.trim() });
                  goTo({ kind: "tracks" });
                }}
                skipLabel="Skip this"
                onSkip={() => goTo({ kind: "tracks" })}
              />
            </QuestionShell>
          )}

          {page.kind === "tracks" && (
            <TracksStep
              onContinue={(selected) => {
                if (selected.length === 0) { void finish(); return; }
                startTracks(selected);
              }}
            />
          )}

          {page.kind === "renting" && (
            <RentingBranch
              sub={page.sub}
              rent={rent}
              setRent={setRent}
              goSub={(s) => goTo({ kind: "renting", sub: s })}
              done={nextTrack}
              insight={insight}
              runInference={(text) => runInference("landlord_tenant", text)}
              inferring={inferring}
            />
          )}

          {page.kind === "employment" && (
            <EmploymentBranch
              sub={page.sub}
              emp={emp}
              setEmp={setEmp}
              goSub={(s) => goTo({ kind: "employment", sub: s })}
              done={nextTrack}
              insight={insight}
              runInference={(text) => runInference("employer_employee", text)}
              inferring={inferring}
            />
          )}

          {page.kind === "other_ack" && (
            <FadeIn>
              <h2 className="font-serif text-2xl font-semibold tracking-tight">Got it.</h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                When something comes up — a neighbor, an HOA notice, a one-off situation — start a new file and your AI companion will help from there.
              </p>
              <div className="pt-6">
                <Button className="w-full h-11" onClick={nextTrack} disabled={busy}>
                  Continue
                </Button>
              </div>
            </FadeIn>
          )}
        </div>
      </main>
    </div>
  );
}

/* ------------ Tracks step ------------ */

function TracksStep({ onContinue }: { onContinue: (selected: TrackKey[]) => void }) {
  const [selected, setSelected] = useState<Set<TrackKey>>(new Set());
  function toggle(k: TrackKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  const opts: { key: TrackKey; title: string; body: string }[] = [
    { key: "renting", title: "Renting", body: "Your lease, landlord, property" },
    { key: "employment", title: "Employment", body: "Your job, employer, work situation" },
    { key: "other", title: "Something else", body: "Neighbor, HOA, a one-off situation" },
  ];
  const ordered: TrackKey[] = (["renting", "employment", "other"] as TrackKey[]).filter((k) => selected.has(k));
  return (
    <FadeIn>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">
        What should we help you keep track of?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">Pick any that apply.</p>
      <div className="mt-6 space-y-2.5">
        {opts.map((o) => {
          const active = selected.has(o.key);
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => toggle(o.key)}
              className={`w-full flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                active ? "border-accent bg-accent/10" : "border-border hover:border-accent/40 hover:bg-secondary/40"
              }`}
            >
              <Checkbox checked={active} className="mt-0.5 pointer-events-none" />
              <div className="flex-1">
                <div className="text-sm font-semibold">{o.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{o.body}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="pt-6">
        <Button
          className="w-full h-11"
          disabled={ordered.length === 0}
          onClick={() => onContinue(ordered)}
        >
          Continue
        </Button>
      </div>
      <div className="mt-6 space-y-1.5 text-center">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          What you share here stays private to your account. You decide what, if anything, ever gets shown beyond this app.
        </p>
        <p className="text-[11px] text-muted-foreground">you can always add more later.</p>
      </div>
    </FadeIn>
  );
}

/* ------------ Renting branch ------------ */

type RentSub = "status" | "property" | "intro" | "suggest" | "issues";

function RentingBranch({
  sub, rent, setRent, goSub, done, insight, runInference, inferring,
}: {
  sub: RentSub;
  rent: RentingAnswers;
  setRent: React.Dispatch<React.SetStateAction<RentingAnswers>>;
  goSub: (s: RentSub) => void;
  done: () => void;
  insight: { label: string; text: string } | null;
  runInference: (text: string) => Promise<Suggestions>;
  inferring: boolean;
}) {
  if (sub === "status") {
    return (
      <QuestionShell q="Do you currently rent?" insight={insight}>
        <Pills
          options={[
            { label: "Yes, I rent", value: "yes" },
            { label: "No, I own", value: "own" },
            { label: "Looking to rent", value: "looking" },
          ]}
          value={rent.status ?? ""}
          onSelect={(v) => {
            const status = v as RentStatus;
            setRent((p) => ({ ...p, status }));
            if (status === "own") done();
            else goSub("property");
          }}
        />
      </QuestionShell>
    );
  }
  if (sub === "property") {
    const isLooking = rent.status === "looking";
    const valid = isLooking
      ? Boolean(rent.propertyCity.trim() || rent.propertyName.trim())
      : Boolean(rent.propertyName.trim() && rent.propertyCity.trim() && rent.propertyState.trim());
    return (
      <QuestionShell q={isLooking ? "Anything specific in mind?" : "Tell me about the property."} insight={insight}>
        <Input
          autoFocus
          placeholder={isLooking ? "Property name (if you have one in mind)" : "Property name (e.g. Maple Grove Apartments)"}
          value={rent.propertyName}
          onChange={(e) => setRent((p) => ({ ...p, propertyName: e.target.value }))}
          className="h-11"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="City" value={rent.propertyCity}
            onChange={(e) => setRent((p) => ({ ...p, propertyCity: e.target.value }))} className="h-11" />
          <Input placeholder="State" maxLength={20} value={rent.propertyState}
            onChange={(e) => setRent((p) => ({ ...p, propertyState: e.target.value }))} className="h-11" />
        </div>
        <ContinueRow
          disabled={!valid}
          onContinue={() => goSub("intro")}
          skipLabel={isLooking ? "I don't know yet" : "Skip this"}
          onSkip={() => {
            setRent((p) => ({ ...p, propertyName: "", propertyCity: "", propertyState: "" }));
            goSub("intro");
          }}
        />
      </QuestionShell>
    );
  }
  if (sub === "intro") {
    const isLooking = rent.status === "looking";
    const q = isLooking ? "Tell me what you're looking for." : "Tell me what you're looking for.";
    return (
      <QuestionShell q={q} insight={insight}>
        <Textarea
          autoFocus
          rows={5}
          placeholder={isLooking
            ? "Budget, area, what matters most, anything that gives a feel for what you want."
            : "How long have you been there, what's on your mind, anything that gives a feel for the situation."}
          value={rent.intro}
          onChange={(e) => setRent((p) => ({ ...p, intro: e.target.value }))}
        />
        <ContinueRow
          loading={inferring}
          onContinue={async () => {
            const text = rent.intro.trim();
            if (text) {
              const sug = await runInference(text);
              if (sug.sub_type || sug.key_details.length) {
                setRent((p) => ({ ...p, sub_type: sug.sub_type, key_details: sug.key_details }));
                goSub("suggest");
                return;
              }
            }
            if (rent.status === "yes") goSub("issues");
            else done();
          }}
          skipLabel="Skip this"
          onSkip={() => {
            if (rent.status === "yes") goSub("issues");
            else done();
          }}
        />
      </QuestionShell>
    );
  }
  if (sub === "suggest") {
    return (
      <SuggestionsStep
        insight={insight}
        sub_type={rent.sub_type}
        key_details={rent.key_details}
        onConfirm={(sub_type, key_details) => {
          setRent((p) => ({ ...p, sub_type, key_details }));
          if (rent.status === "yes") goSub("issues");
          else done();
        }}
        onSkip={() => {
          setRent((p) => ({ ...p, sub_type: null, key_details: [] }));
          if (rent.status === "yes") goSub("issues");
          else done();
        }}
      />
    );
  }
  return (
    <QuestionShell q="Any problems with the landlord or property right now?" insight={insight}>
      <Pills
        options={[
          { label: "Yes", value: "yes" },
          { label: "Not yet", value: "no" },
        ]}
        value={rent.hasIssues === true ? "yes" : rent.hasIssues === false ? "no" : ""}
        onSelect={(v) => {
          setRent((p) => ({ ...p, hasIssues: v === "yes" }));
          done();
        }}
      />
      <div className="pt-1">
        <SkipLink label="Skip this" onClick={() => { setRent((p) => ({ ...p, hasIssues: null })); done(); }} />
      </div>
    </QuestionShell>
  );
}

/* ------------ Employment branch ------------ */

type EmpSub = "status" | "employer" | "intro" | "suggest" | "issues" | "help";

function EmploymentBranch({
  sub, emp, setEmp, goSub, done, insight, runInference, inferring,
}: {
  sub: EmpSub;
  emp: EmploymentAnswers;
  setEmp: React.Dispatch<React.SetStateAction<EmploymentAnswers>>;
  goSub: (s: EmpSub) => void;
  done: () => void;
  insight: { label: string; text: string } | null;
  runInference: (text: string) => Promise<Suggestions>;
  inferring: boolean;
}) {
  if (sub === "status") {
    return (
      <QuestionShell q="Are you currently employed?" insight={insight}>
        <Pills
          options={[
            { label: "Yes", value: "yes" },
            { label: "Evaluating an offer", value: "evaluating" },
            { label: "Not right now", value: "no" },
          ]}
          value={emp.status ?? ""}
          onSelect={(v) => {
            const status = v as EmpStatus;
            setEmp((p) => ({ ...p, status }));
            if (status === "no") done();
            else goSub("employer");
          }}
        />
      </QuestionShell>
    );
  }
  if (sub === "employer") {
    const valid = emp.employer.trim() && emp.position.trim();
    return (
      <QuestionShell q="A bit about the job." insight={insight}>
        <Input
          autoFocus
          placeholder="Employer name"
          value={emp.employer}
          onChange={(e) => setEmp((p) => ({ ...p, employer: e.target.value }))}
          className="h-11"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Position" value={emp.position}
            onChange={(e) => setEmp((p) => ({ ...p, position: e.target.value }))} className="h-11" />
          <Input placeholder="Salary (optional)" inputMode="numeric" value={emp.salary}
            onChange={(e) => setEmp((p) => ({ ...p, salary: e.target.value }))} className="h-11" />
        </div>
        <ContinueRow
          disabled={!valid}
          onContinue={() => goSub("intro")}
          skipLabel="Skip this"
          onSkip={() => {
            setEmp((p) => ({ ...p, employer: "", position: "", salary: "" }));
            goSub("intro");
          }}
        />
      </QuestionShell>
    );
  }
  if (sub === "intro") {
    return (
      <QuestionShell q="Tell me about your job." insight={insight}>
        <Textarea
          autoFocus
          rows={5}
          placeholder="How long you've been there, what your role looks like, anything on your mind."
          value={emp.intro}
          onChange={(e) => setEmp((p) => ({ ...p, intro: e.target.value }))}
        />
        <ContinueRow
          loading={inferring}
          onContinue={async () => {
            const text = emp.intro.trim();
            if (text) {
              const sug = await runInference(text);
              if (sug.sub_type || sug.key_details.length) {
                setEmp((p) => ({ ...p, sub_type: sug.sub_type, key_details: sug.key_details }));
                goSub("suggest");
                return;
              }
            }
            if (emp.status === "yes") goSub("issues");
            else done();
          }}
          skipLabel="Skip this"
          onSkip={() => {
            if (emp.status === "yes") goSub("issues");
            else done();
          }}
        />
      </QuestionShell>
    );
  }
  if (sub === "suggest") {
    return (
      <SuggestionsStep
        insight={insight}
        sub_type={emp.sub_type}
        key_details={emp.key_details}
        onConfirm={(sub_type, key_details) => {
          setEmp((p) => ({ ...p, sub_type, key_details }));
          if (emp.status === "yes") goSub("issues");
          else done();
        }}
        onSkip={() => {
          setEmp((p) => ({ ...p, sub_type: null, key_details: [] }));
          if (emp.status === "yes") goSub("issues");
          else done();
        }}
      />
    );
  }
  if (sub === "issues") {
    return (
      <QuestionShell q="Any problems at work right now?" insight={insight}>
        <Pills
          options={[
            { label: "Yes", value: "yes" },
            { label: "Not yet", value: "no" },
          ]}
          value={emp.hasIssues === true ? "yes" : emp.hasIssues === false ? "no" : ""}
          onSelect={(v) => {
            const yes = v === "yes";
            setEmp((p) => ({ ...p, hasIssues: yes }));
            if (yes) goSub("help");
            else done();
          }}
        />
        <div className="pt-1">
          <SkipLink label="Skip this" onClick={() => { setEmp((p) => ({ ...p, hasIssues: null })); done(); }} />
        </div>
      </QuestionShell>
    );
  }
  return (
    <QuestionShell q="Tell me how we can help." insight={insight}>
      <Textarea
        autoFocus
        rows={5}
        placeholder="What's going on at work?"
        value={emp.helpText}
        onChange={(e) => setEmp((p) => ({ ...p, helpText: e.target.value }))}
      />
      <ContinueRow
        disabled={!emp.helpText.trim()}
        onContinue={done}
        skipLabel="Skip this"
        onSkip={() => { setEmp((p) => ({ ...p, helpText: "" })); done(); }}
      />
    </QuestionShell>
  );
}

/* ------------ Suggestions step ------------ */

function SuggestionsStep({
  insight, sub_type, key_details, onConfirm, onSkip,
}: {
  insight: { label: string; text: string } | null;
  sub_type: string | null;
  key_details: string[];
  onConfirm: (sub_type: string | null, key_details: string[]) => void;
  onSkip: () => void;
}) {
  const [chosenSub, setChosenSub] = useState<string | null>(sub_type);
  const [chosenDetails, setChosenDetails] = useState<string[]>(key_details);

  function toggleDetail(d: string) {
    setChosenDetails((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  return (
    <QuestionShell q="Does this match what you meant?" insight={insight}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        <span>AI-suggested from what you wrote. Tap to keep or dismiss.</span>
      </div>
      {sub_type && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Likely category</div>
          <SuggestionChip
            label={sub_type}
            active={chosenSub === sub_type}
            onToggle={() => setChosenSub(chosenSub === sub_type ? null : sub_type)}
          />
        </div>
      )}
      {key_details.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Key details we noticed</div>
          <div className="flex flex-wrap gap-2">
            {key_details.map((d) => (
              <SuggestionChip
                key={d}
                label={d}
                active={chosenDetails.includes(d)}
                onToggle={() => toggleDetail(d)}
              />
            ))}
          </div>
        </div>
      )}
      <ContinueRow
        onContinue={() => onConfirm(chosenSub, chosenDetails)}
        skipLabel="Skip this"
        onSkip={onSkip}
      />
    </QuestionShell>
  );
}

function SuggestionChip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-dashed border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground"
      }`}
    >
      {active ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 opacity-50" />}
      <span>{label}</span>
    </button>
  );
}

/* ------------ Primitives ------------ */

function FadeIn({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{children}</div>;
}

function InsightBanner({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
      <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div className="text-[12px] leading-snug">
        <div className="font-semibold text-emerald-700 dark:text-emerald-300">{label}</div>
        <div className="text-foreground/80 mt-0.5">{text}</div>
      </div>
    </div>
  );
}

function QuestionShell({
  q, children, insight,
}: {
  q: string;
  children: React.ReactNode;
  insight?: { label: string; text: string } | null;
}) {
  return (
    <FadeIn>
      <h2 className="font-serif text-xl font-semibold leading-snug">{q}</h2>
      {insight ? <InsightBanner label={insight.label} text={insight.text} /> : null}
      <div className="mt-5 space-y-4">{children}</div>
    </FadeIn>
  );
}

function SkipLink({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="text-center pt-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 disabled:opacity-40"
      >
        {label}
      </button>
    </div>
  );
}

function ContinueRow({
  onContinue, disabled, skipLabel, onSkip, loading,
}: {
  onContinue: () => void;
  disabled?: boolean;
  skipLabel?: string;
  onSkip?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="pt-2 space-y-2">
      <Button onClick={onContinue} disabled={disabled || loading} className="w-full h-11">
        {loading ? "Thinking…" : "Continue"}
      </Button>
      {skipLabel && onSkip ? <SkipLink label={skipLabel} onClick={onSkip} disabled={loading} /> : null}
    </div>
  );
}

function Pills({
  options, value, onSelect,
}: { options: { label: string; value: string }[]; value: string; onSelect: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              active
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-background hover:border-accent/40 hover:bg-secondary/50"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
