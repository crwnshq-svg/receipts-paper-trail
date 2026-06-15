import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Disclaimer } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  User,
  CreditCard,
  Bell,
  LifeBuoy,
  LogOut,
  AlertTriangle,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { FREE_STORAGE_BYTES, STORAGE_WARNING_BYTES, FREE_AI_QUESTIONS } from "@/lib/constants";
import { updateAiTone } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account — Pull Up Receipts" }] }),
  component: AccountPage,
});

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function loadNotifPref(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(`notif:${key}`);
  return v === null ? fallback : v === "true";
}

function AccountPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return { ...data, email: data?.email ?? user.email };
    },
  });

  const { data: storage } = useQuery({
    queryKey: ["storage-usage"],
    queryFn: async () => {
      const { data } = await supabase.from("documents").select("file_size");
      return (data ?? []).reduce((s, d) => s + (d.file_size ?? 0), 0);
    },
  });

  const [passiveAi, setPassiveAi] = useState(() => loadNotifPref("passive_ai", true));
  const [deadlines, setDeadlines] = useState(() => loadNotifPref("deadlines", true));
  const [caseUpdates, setCaseUpdates] = useState(() => loadNotifPref("case_updates", true));

  const [aiTone, setAiToneLocal] = useState<"straightforward" | "personable">("straightforward");
  useEffect(() => {
    if (profile?.ai_tone === "personable" || profile?.ai_tone === "straightforward") {
      setAiToneLocal(profile.ai_tone);
    }
  }, [profile?.ai_tone]);
  const updateTone = useServerFn(updateAiTone);
  async function changeTone(t: "straightforward" | "personable") {
    setAiToneLocal(t);
    try {
      await updateTone({ data: { tone: t } });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(`AI tone set to ${t === "personable" ? "Personable" : "Straightforward"}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update tone");
    }
  }

  function setNotif(key: string, value: boolean, setter: (v: boolean) => void) {
    setter(value);
    if (typeof window !== "undefined") window.localStorage.setItem(`notif:${key}`, String(value));
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const used = storage ?? 0;
  const pct = Math.min(100, (used / FREE_STORAGE_BYTES) * 100);
  const overWarn = used >= STORAGE_WARNING_BYTES;
  const tier = profile?.subscription_tier ?? "free";
  const questionsUsed = profile?.ai_questions_used ?? 0;
  const questionsLeft = Math.max(0, FREE_AI_QUESTIONS - questionsUsed);

  const tierLabel = tier === "free" ? "Free" : tier === "monthly" ? "Monthly" : "Annual";

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your Pull Up Receipts plan, notifications, and access.</p>
        </div>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <User className="h-5 w-5 text-accent" />
            </div>
            <div>
              <div className="text-base font-semibold">{profile?.full_name || "Welcome"}</div>
              <div className="text-sm text-muted-foreground">{profile?.email}</div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" /> Subscription
          </div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-serif text-2xl font-semibold">{tierLabel} plan</div>
              {tier !== "free" && (
                <div className="text-xs text-muted-foreground">
                  Renews {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                </div>
              )}
            </div>
            {tier === "free" ? (
              <Button className="bg-primary text-primary-foreground hover:bg-accent">Upgrade</Button>
            ) : (
              <Button variant="outline">Manage</Button>
            )}
          </div>

          <Separator className="my-4" />

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Storage</span>
                <span className={overWarn ? "text-destructive" : "text-muted-foreground"}>
                  {formatBytes(used)} of 75 MB
                </span>
              </div>
              <Progress value={pct} className="mt-2 h-2" />
              {overWarn && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  You're approaching your free storage limit. Upgrade for unlimited storage.
                </div>
              )}
            </div>

            {tier === "free" && (
              <div className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-sm">
                <span>AI questions remaining</span>
                <span className="font-semibold">{questionsLeft} of {FREE_AI_QUESTIONS}</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Bell className="h-3.5 w-3.5" /> Notifications
          </div>
          <div className="mt-4 space-y-4">
            <NotifRow
              id="passive-ai"
              label="Passive AI alerts"
              desc="Get flagged when something in your case may need attention."
              checked={passiveAi}
              onChange={(v) => setNotif("passive_ai", v, setPassiveAi)}
            />
            <NotifRow
              id="deadlines"
              label="Deadline reminders"
              desc="Statute of limitations and response deadlines."
              checked={deadlines}
              onChange={(v) => setNotif("deadlines", v, setDeadlines)}
            />
            <NotifRow
              id="case-updates"
              label="File updates"
              desc="Activity on your events and evidence."
              checked={caseUpdates}
              onChange={(v) => setNotif("case_updates", v, setCaseUpdates)}
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> AI Response Style
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Choose how Receipts AI talks to you. Both modes give the same accurate information.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => changeTone("straightforward")}
              className={`rounded-lg border p-3 text-left transition ${aiTone === "straightforward" ? "border-accent bg-accent/5" : "bg-background hover:border-muted-foreground/30"}`}
            >
              <div className="font-medium text-sm">Straightforward</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Direct, plain English, legally precise. No filler, no warmth — just clear, accurate information you can act on.
              </div>
            </button>
            <button
              onClick={() => changeTone("personable")}
              className={`rounded-lg border p-3 text-left transition ${aiTone === "personable" ? "border-accent bg-accent/5" : "bg-background hover:border-muted-foreground/30"}`}
            >
              <div className="font-medium text-sm">Personable</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Same accuracy and directness, with warmth and acknowledgment of your situation. You're not alone in this.
              </div>
            </button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <LifeBuoy className="h-3.5 w-3.5" /> Support
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link to="/resources">
              <Button variant="outline" className="w-full justify-between">
                FAQ <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
            <a href="mailto:support@receipts.app">
              <Button variant="outline" className="w-full justify-between">
                Contact support <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">Privacy Policy</Link>
            <Link to="/" className="hover:text-foreground">Terms of Service</Link>
          </div>
        </Card>

        <Button variant="destructive" className="w-full" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" /> Log out
        </Button>

        <Disclaimer className="pt-2" />
      </div>
    </AppShell>
  );
}

function NotifRow({
  id, label, desc, checked, onChange,
}: { id: string; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
