import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ReceiptText, ArrowLeft, Upload, Camera } from "lucide-react";
import { toast } from "sonner";
import { analyzeDocument } from "@/lib/document-intelligence.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Welcome — Pull Up Receipts" }] }),
  component: OnboardingPage,
});

type Section = "personal" | "rental" | "work";

type Answers = {
  first_name: string;
  city: string;
  state: string;
  primary_language: string;
  is_renting: boolean | null;
  rental_duration: string;
  lease_type: string;
  has_landlord_issues: boolean | null;
  is_employed: boolean | null;
  work_type: string;
  has_workplace_issues: boolean | null;
};

const EMPTY: Answers = {
  first_name: "", city: "", state: "", primary_language: "",
  is_renting: null, rental_duration: "", lease_type: "", has_landlord_issues: null,
  is_employed: null, work_type: "", has_workplace_issues: null,
};

function OnboardingPage() {
  const navigate = useNavigate();
  const analyze = useServerFn(analyzeDocument);
  const [step, setStep] = useState(1);
  const [a, setA] = useState<Answers>(EMPTY);
  const [history, setHistory] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [privacyAck, setPrivacyAck] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function recordPrivacyAck() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ privacy_acknowledged_at: new Date().toISOString() } as never).eq("id", user.id);
  }

  // hydrate from existing profile so partial completions resume
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
      setA((prev) => ({
        ...prev,
        first_name: data.first_name ?? prev.first_name,
        city: data.city ?? "",
        state: data.state ?? "",
        primary_language: data.primary_language ?? "",
        is_renting: data.is_renting,
        rental_duration: data.rental_duration ?? "",
        lease_type: data.lease_type ?? "",
        has_landlord_issues: data.has_landlord_issues,
        is_employed: data.is_employed,
        work_type: data.work_type ?? "",
        has_workplace_issues: data.has_workplace_issues,
      }));
    })();
  }, [navigate]);

  const section: Section = useMemo(() => {
    if (step <= 5) return "personal";
    if (step <= 10) return "rental";
    return "work";
  }, [step]);
  const sectionPct = section === "personal" ? 25 : section === "rental" ? 60 : 95;

  async function persist(patch: Partial<Answers>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload: Record<string, any> = {};
    for (const k of Object.keys(patch)) {
      const v = (patch as any)[k];
      if (v === "" || v === null || v === undefined) continue;
      payload[k] = v;
    }
    if (Object.keys(payload).length === 0) return;
    await supabase.from("profiles").update(payload as never).eq("id", user.id);
  }

  async function completeOnboarding() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
  }

  function goTo(next: number, patch?: Partial<Answers>) {
    if (patch) {
      setA((p) => ({ ...p, ...patch }));
      persist(patch).catch(() => {});
    }
    setHistory((h) => [...h, step]);
    setStep(next);
  }

  function back() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = [...h];
      const target = prev.pop()!;
      setStep(target);
      return prev;
    });
  }

  async function skipAll() {
    setBusy(true);
    try {
      await completeOnboarding();
      navigate({ to: "/dashboard", replace: true });
    } finally { setBusy(false); }
  }

  async function handleFinishUpload(file: File | null) {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      if (file) {
        const disputeType = a.has_landlord_issues || a.is_renting
          ? "landlord_tenant"
          : a.has_workplace_issues || a.is_employed
          ? "employer_employee"
          : "other";
        const { data: caseRow, error: cErr } = await supabase.from("cases").insert({
          user_id: user.id,
          title: "My First File",
          dispute_type: disputeType as never,
        }).select().single();
        if (cErr) throw cErr;
        const path = `${user.id}/${caseRow.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("case-documents").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: doc, error: dErr } = await supabase.from("documents").insert({
          case_id: caseRow.id, user_id: user.id,
          file_name: file.name, storage_path: path,
          file_size: file.size, mime_type: file.type,
        }).select().single();
        if (dErr) throw dErr;
        if (doc) analyze({ data: { documentId: doc.id } }).catch(() => {});
        toast.success("Your first file is started. Analyzing now.");
      }
      await completeOnboarding();
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-y-auto">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            {step > 1 && history.length > 0 ? (
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
            disabled={busy}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Skip for now
          </button>
        </div>
        {step > 1 && (
          <div className="mx-auto w-full max-w-2xl px-4 pb-3">
            <Progress value={sectionPct} className="h-1" />
            <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className={section === "personal" ? "text-foreground font-semibold" : ""}>Personal</span>
              <span className={section === "rental" ? "text-foreground font-semibold" : ""}>Rental</span>
              <span className={section === "work" ? "text-foreground font-semibold" : ""}>Work</span>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-xl flex-col px-5 py-8 sm:py-14">
          <StepView
            step={step}
            a={a}
            setA={setA}
            goTo={goTo}
            busy={busy}
            onUploadClick={() => fileRef.current?.click()}
            onSkipUpload={() => handleFinishUpload(null)}
          />
        </div>
      </main>

      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/*,application/pdf,.doc,.docx,.txt,.eml,.msg"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFinishUpload(f);
        }}
      />
    </div>
  );
}

/* ----------------- Steps ----------------- */

function StepView({
  step, a, setA, goTo, busy, onUploadClick, onSkipUpload,
}: {
  step: number;
  a: Answers;
  setA: React.Dispatch<React.SetStateAction<Answers>>;
  goTo: (n: number, patch?: Partial<Answers>) => void;
  busy: boolean;
  onUploadClick: () => void;
  onSkipUpload: () => void;
}) {
  // helpers
  const nextRentalAfterIs = (val: boolean | null) => (val === true ? 8 : 11);
  const nextWorkAfterIs = (val: boolean | null) => (val === true ? 13 : 14);

  switch (step) {
    case 1:
      return (
        <FadeIn>
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
              <ReceiptText className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="mt-6 font-serif text-3xl font-semibold tracking-tight">Welcome.</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Pull Up Receipts is your personal file for any situation where you need to protect yourself.
              A few quick questions will help your AI companion give you better guidance from day one.
            </p>
            <div className="mt-8 space-y-3">
              <Button onClick={() => goTo(2)} className="w-full h-11">Get Started</Button>
              <button onClick={onSkipUpload} disabled={busy} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4">
                Skip everything
              </button>
            </div>
          </div>
        </FadeIn>
      );

    case 2:
      return (
        <SectionHeader title="First, a little about you." onContinue={() => goTo(3)} />
      );

    case 3:
      return (
        <QuestionShell q="What is your first name?">
          <Input
            autoFocus
            placeholder="Your first name"
            value={a.first_name}
            onChange={(e) => setA((p) => ({ ...p, first_name: e.target.value }))}
            className="h-11"
          />
          <ContinueRow onContinue={() => goTo(4, { first_name: a.first_name })} />
        </QuestionShell>
      );

    case 4:
      return (
        <QuestionShell q="Where are you located?">
          <div className="grid grid-cols-2 gap-3">
            <Input autoFocus placeholder="City" value={a.city}
              onChange={(e) => setA((p) => ({ ...p, city: e.target.value }))} className="h-11" />
            <Input placeholder="State" maxLength={20} value={a.state}
              onChange={(e) => setA((p) => ({ ...p, state: e.target.value }))} className="h-11" />
          </div>
          <ContinueRow onContinue={() => goTo(5, { city: a.city, state: a.state })} />
        </QuestionShell>
      );

    case 5:
      return (
        <QuestionShell q="What is your primary language?">
          <Pills
            options={[
              { label: "English", value: "English" },
              { label: "Spanish", value: "Spanish" },
              { label: "Other", value: "Other" },
            ]}
            value={a.primary_language}
            onSelect={(v) => goTo(6, { primary_language: v })}
          />
          <ContinueRow onContinue={() => goTo(6, { primary_language: a.primary_language })} />
        </QuestionShell>
      );

    case 6:
      return <SectionHeader title="Now, your rental situation." onContinue={() => goTo(7)} />;

    case 7:
      return (
        <QuestionShell q="Are you currently renting?">
          <Pills
            options={[
              { label: "Yes, I am renting", value: "yes" },
              { label: "No, I own my home", value: "own" },
              { label: "I am staying with someone", value: "staying" },
              { label: "Not applicable", value: "na" },
            ]}
            value={a.is_renting === true ? "yes" : a.is_renting === false ? "own" : ""}
            onSelect={(v) => {
              const isRenting = v === "yes";
              const patch: Partial<Answers> = { is_renting: v === "yes" ? true : v === "own" || v === "na" ? false : null };
              goTo(isRenting ? 8 : v === "staying" ? 8 : 11, patch);
            }}
          />
          <ContinueRow onContinue={() => goTo(nextRentalAfterIs(a.is_renting))} />
        </QuestionShell>
      );

    case 8:
      return (
        <QuestionShell q="How long have you been at your current address?">
          <Pills
            options={[
              { label: "Less than 6 months", value: "<6mo" },
              { label: "6 months to 1 year", value: "6mo-1y" },
              { label: "1 to 3 years", value: "1-3y" },
              { label: "More than 3 years", value: ">3y" },
            ]}
            value={a.rental_duration}
            onSelect={(v) => goTo(9, { rental_duration: v })}
          />
          <ContinueRow onContinue={() => goTo(9, { rental_duration: a.rental_duration })} />
        </QuestionShell>
      );

    case 9:
      return (
        <QuestionShell q="Do you have a written lease?">
          <Pills
            options={[
              { label: "Yes, written lease", value: "written" },
              { label: "Month to month", value: "month_to_month" },
              { label: "No written agreement", value: "none" },
              { label: "Not sure", value: "unsure" },
            ]}
            value={a.lease_type}
            onSelect={(v) => goTo(10, { lease_type: v })}
          />
          <ContinueRow onContinue={() => goTo(10, { lease_type: a.lease_type })} />
        </QuestionShell>
      );

    case 10:
      return (
        <QuestionShell q="Are you currently having issues with your landlord or property manager?">
          <Pills
            options={[
              { label: "Yes", value: "yes" },
              { label: "No", value: "no" },
              { label: "Not yet, but want to be prepared", value: "prep" },
            ]}
            value={a.has_landlord_issues === true ? "yes" : a.has_landlord_issues === false ? "no" : ""}
            onSelect={(v) => {
              const val = v === "yes" ? true : v === "no" ? false : false;
              goTo(11, { has_landlord_issues: val });
            }}
          />
          <ContinueRow onContinue={() => goTo(11)} />
        </QuestionShell>
      );

    case 11:
      return <SectionHeader title="Last, your work situation." onContinue={() => goTo(12)} />;

    case 12:
      return (
        <QuestionShell q="Are you currently employed?">
          <Pills
            options={[
              { label: "Yes", value: "yes" },
              { label: "Self employed", value: "self" },
              { label: "No", value: "no" },
              { label: "Not applicable", value: "na" },
            ]}
            value={a.is_employed === true ? "yes" : a.is_employed === false ? "no" : ""}
            onSelect={(v) => {
              const isEmployed = v === "yes" || v === "self";
              const patch: Partial<Answers> = { is_employed: isEmployed };
              goTo(isEmployed ? 13 : 14, patch);
            }}
          />
          <ContinueRow onContinue={() => goTo(nextWorkAfterIs(a.is_employed))} />
        </QuestionShell>
      );

    case 13:
      return (
        <QuestionShell q="What type of work do you do?">
          <Input
            autoFocus
            placeholder="Describe your role or industry"
            value={a.work_type}
            onChange={(e) => setA((p) => ({ ...p, work_type: e.target.value }))}
            className="h-11"
          />
          <ContinueRow onContinue={() => goTo(14, { work_type: a.work_type })} />
        </QuestionShell>
      );

    case 14:
      return (
        <QuestionShell q="Are you currently having issues at work?">
          <Pills
            options={[
              { label: "Yes", value: "yes" },
              { label: "No", value: "no" },
              { label: "Not yet, but want to be prepared", value: "prep" },
            ]}
            value={a.has_workplace_issues === true ? "yes" : a.has_workplace_issues === false ? "no" : ""}
            onSelect={(v) => {
              const val = v === "yes";
              goTo(15, { has_workplace_issues: val });
            }}
          />
          <ContinueRow onContinue={() => goTo(15)} />
        </QuestionShell>
      );

    case 15:
      return (
        <FadeIn>
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Want to start your first file?</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Upload anything related to a current situation — a lease, an email, a contract, a screenshot.
            We'll analyze it and have your AI companion ready to help.
          </p>
          <button
            type="button"
            onClick={onUploadClick}
            disabled={busy}
            className="mt-6 flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-secondary/30 px-6 py-12 transition hover:bg-secondary/50"
          >
            <Camera className="h-7 w-7 text-accent" />
            <span className="text-sm font-medium">Tap to upload evidence</span>
            <span className="text-xs text-muted-foreground">PDF, image, doc — up to 20MB</span>
          </button>
          <div className="mt-6 text-center">
            <button
              onClick={onSkipUpload}
              disabled={busy}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              {busy ? "Finishing…" : "Skip and go to dashboard"}
            </button>
          </div>
        </FadeIn>
      );

    default:
      return null;
  }
}

/* ----------------- Primitives ----------------- */

function FadeIn({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{children}</div>;
}

function SectionHeader({ title, onContinue }: { title: string; onContinue: () => void }) {
  return (
    <FadeIn>
      <div className="py-6 text-center">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">{title}</h2>
        <Button onClick={onContinue} className="mt-8 h-11 px-8">Continue</Button>
      </div>
    </FadeIn>
  );
}

function QuestionShell({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <FadeIn>
      <h2 className="font-serif text-xl font-semibold leading-snug">{q}</h2>
      <div className="mt-5 space-y-4">{children}</div>
    </FadeIn>
  );
}

function ContinueRow({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="pt-2">
      <Button onClick={onContinue} className="w-full h-11">Continue</Button>
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

// unused but kept to avoid import warnings if needed elsewhere
export const _icon = Upload;
