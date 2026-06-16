import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, DISPUTE_LABELS, Disclaimer } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, FolderOpen, FileText, Clock, ListChecks, Brain, CheckCircle2,
  PenSquare, Upload, MessageSquare, Lightbulb, ArrowRight, BookOpen, Sparkles,
  MoreVertical, Pencil, Trash2, Check, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { DeleteCaseDialog } from "@/components/delete-case-dialog";
import { FREE_STORAGE_BYTES, FREE_AI_QUESTIONS } from "@/lib/constants";

const FREE_LIMIT_BYTES = FREE_STORAGE_BYTES;

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Pull Up Receipts" }] }),
  component: Dashboard,
});

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function relTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const mo = Math.floor(days / 30);
  return `${mo} month${mo === 1 ? "" : "s"} ago`;
}

// status_level (record/case) drives the badge color now; old `status` field unused for badges.

const RESOURCE_BY_MODULE: Record<string, string> = {
  landlord_tenant: "Did you know? Your landlord must give 24 hours notice before entering your home in California.",
  employer_employee: "California employees have the right to discuss wages with coworkers regardless of company policy.",
  other_general: "Contractors in California are protected by prompt payment laws — unpaid work has legal remedies.",
  neighbor: "California protects you from harassment — documented patterns matter in court.",
  other: "Keep a clear paper trail. Documented timelines are admissible evidence in most disputes.",
};

function Dashboard() {
  const navigate = useNavigate();
  const { data: profile, isFetched: profileFetched } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (profileFetched && profile && profile.onboarding_completed === false) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [profile, profileFetched, navigate]);


  const { data: cases } = useQuery({
    queryKey: ["cases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: storage } = useQuery({
    queryKey: ["storage-usage"],
    queryFn: async () => {
      const { data } = await supabase.from("documents").select("file_size");
      return (data ?? []).reduce((s, d) => s + (d.file_size ?? 0), 0);
    },
  });

  const { data: incidentsAll = [] } = useQuery({
    queryKey: ["incidents-all"],
    queryFn: async () => {
      const { data } = await supabase.from("incidents").select("id, case_id, title, created_at");
      return data ?? [];
    },
  });

  const { data: documentsAll = [] } = useQuery({
    queryKey: ["documents-all"],
    queryFn: async () => {
      const { data } = await supabase.from("documents").select("id, case_id, file_name, created_at");
      return data ?? [];
    },
  });

  const { data: insightsAll = [] } = useQuery({
    queryKey: ["insights-all"],
    queryFn: async () => {
      const { data } = await supabase.from("document_insights")
        .select("id, case_id, insight_title, is_dismissed, created_at")
        .eq("is_dismissed", false);
      return data ?? [];
    },
  });

  const { data: generatedAll = [] } = useQuery({
    queryKey: ["generated-all"],
    queryFn: async () => {
      const { data } = await supabase.from("generated_documents")
        .select("id, case_id, document_type, created_at");
      return data ?? [];
    },
  });

  const used = storage ?? 0;
  const pct = Math.min(100, (used / FREE_LIMIT_BYTES) * 100);
  const tier = profile?.subscription_tier ?? "free";
  const isPaid = tier !== "free";
  const aiUsed = profile?.ai_questions_used ?? 0;
  const aiRemaining = Math.max(0, FREE_AI_QUESTIONS - aiUsed);

  const caseList = cases ?? [];
  const hasCases = caseList.length > 0;
  const mostRecent = caseList[0];

  // counts per case
  const incidentCountByCase = new Map<string, number>();
  incidentsAll.forEach((i) => incidentCountByCase.set(i.case_id, (incidentCountByCase.get(i.case_id) ?? 0) + 1));
  const docCountByCase = new Map<string, number>();
  documentsAll.forEach((d) => docCountByCase.set(d.case_id, (docCountByCase.get(d.case_id) ?? 0) + 1));
  const insightCountByCase = new Map<string, number>();
  insightsAll.forEach((i) => insightCountByCase.set(i.case_id, (insightCountByCase.get(i.case_id) ?? 0) + 1));
  const genCountByCase = new Map<string, number>();
  generatedAll.forEach((g) => genCountByCase.set(g.case_id, (genCountByCase.get(g.case_id) ?? 0) + 1));

  // greeting status line
  const activeCount = caseList.filter((c) => c.status === "active").length;
  const totalUnreadInsights = insightsAll.length;
  let statusLine = "No files yet — start a file today. Your file. Documented and proven.";
  if (hasCases) {
    if (totalUnreadInsights > 0) {
      const caseIdsWithInsights = new Set(insightsAll.map((i) => i.case_id));
      statusLine = `You have unread insights on ${caseIdsWithInsights.size} file${caseIdsWithInsights.size === 1 ? "" : "s"}.`;
    } else {
      const last = mostRecent?.updated_at;
      statusLine = `You have ${activeCount} active file${activeCount === 1 ? "" : "s"}.${last ? ` Last activity ${relTime(last)}.` : ""}`;
    }
  }

  // featured resource
  const moduleCounts = new Map<string, number>();
  caseList.forEach((c) => moduleCounts.set(c.dispute_type, (moduleCounts.get(c.dispute_type) ?? 0) + 1));
  const topModule = [...moduleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other_general";
  const featuredText = RESOURCE_BY_MODULE[topModule] ?? RESOURCE_BY_MODULE.other_general;

  // activity feed (last 5 across all)
  type Activity = { id: string; type: "doc" | "incident" | "insight" | "generated"; text: string; at: string; caseId: string };
  const caseTitleById = new Map(caseList.map((c) => [c.id, c.title]));
  const activity: Activity[] = [
    ...documentsAll.map<Activity>((d) => ({
      id: `d-${d.id}`, type: "doc", at: d.created_at, caseId: d.case_id,
      text: `Uploaded "${d.file_name}" to ${caseTitleById.get(d.case_id) ?? "a file"}`,
    })),
    ...incidentsAll.map<Activity>((i) => ({
      id: `i-${i.id}`, type: "incident", at: i.created_at, caseId: i.case_id,
      text: `Logged event "${i.title}" in ${caseTitleById.get(i.case_id) ?? "a file"}`,
    })),
    ...insightsAll.map<Activity>((n) => ({
      id: `n-${n.id}`, type: "insight", at: n.created_at, caseId: n.case_id,
      text: `Insight detected: ${n.insight_title}`,
    })),
    ...generatedAll.map<Activity>((g) => ({
      id: `g-${g.id}`, type: "generated", at: g.created_at, caseId: g.case_id,
      text: `Generated ${g.document_type.replace(/_/g, " ")} for ${caseTitleById.get(g.case_id) ?? "a file"}`,
    })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 5);

  const ACTIVITY_DOT: Record<Activity["type"], string> = {
    doc: "bg-sky-400",
    incident: "bg-red-400",
    insight: "bg-amber-400",
    generated: "bg-emerald-400",
  };

  // Quick-action target: most recent case
  const targetCaseId = mostRecent?.id;
  const qa = (tab: "incidents" | "documents" | "ai") =>
    targetCaseId ? { to: "/cases/$caseId" as const, params: { caseId: targetCaseId }, search: { tab } } : null;

  return (
    <TooltipProvider delayDuration={150}>
      <AppShell>
        <div className="space-y-8">
          {/* Greeting */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-3xl font-semibold">
                {profile?.full_name ? `Welcome, ${profile.full_name.split(" ")[0]}` : "Your files"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">Your file, organized.</p>
              <p className="mt-1.5 text-sm text-foreground/80">{statusLine}</p>
            </div>
            <Link to="/cases/new">
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm">
                <Plus className="mr-1 h-4 w-4" /> Start a File
              </Button>
            </Link>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <QuickAction icon={PenSquare} label="Log an Event" target={qa("incidents")} disabled={!hasCases} />
            <QuickAction icon={Upload} label="Upload Evidence" target={qa("documents")} disabled={!hasCases} />
            <QuickAction icon={MessageSquare} label="Ask RECEIPTS AI" target={qa("ai")} disabled={!hasCases} />
          </div>

          <Separator />

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon={FolderOpen} label="Files" value={String(caseList.length)} />
            <Card className="rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Plan
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="font-serif text-2xl font-semibold capitalize">{tier}</div>
                {isPaid ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </span>
                ) : (
                  <Link to="/account">
                    <Button size="sm" className="h-7 bg-accent text-accent-foreground hover:bg-accent/90 text-xs">
                      Upgrade
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
            <Card className="rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Storage
              </div>
              <div className="mt-2 font-serif text-lg font-semibold">
                {formatBytes(used)} <span className="text-xs font-normal text-muted-foreground">/ 75 MB</span>
              </div>
              <Progress value={pct} className="mt-2 h-1.5" />
            </Card>
            <StatCard icon={ListChecks} label="Events" value={String(incidentsAll.length)} />
            <Card className="rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Brain className="h-3.5 w-3.5" /> AI Questions
              </div>
              <div className="mt-2 font-serif text-2xl font-semibold flex items-center gap-2">
                {isPaid ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <span className="text-lg">Unlimited</span>
                  </>
                ) : (
                  <span>{aiRemaining}<span className="text-sm font-normal text-muted-foreground"> of {FREE_AI_QUESTIONS}</span></span>
                )}
              </div>
            </Card>
          </div>

          {/* Recent files */}
          <div>
            <h2 className="font-serif text-xl font-semibold">Recent files</h2>
            {!hasCases ? (
              <Card className="mt-3 rounded-xl p-8 text-center shadow-sm">
                <p className="text-sm text-muted-foreground">No files yet. Start by creating one.</p>
                <Link to="/cases/new">
                  <Button className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">Start a File</Button>
                </Link>
              </Card>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {caseList.slice(0, 6).map((c) => {
                  const inc = incidentCountByCase.get(c.id) ?? 0;
                  const docs = docCountByCase.get(c.id) ?? 0;
                  const insights = insightCountByCase.get(c.id) ?? 0;
                  const gens = genCountByCase.get(c.id) ?? 0;
                  const strength = c.strength_score ?? 0;
                  const days = Math.max(0, Math.floor((Date.now() - +new Date(c.created_at)) / 86400000));
                  const strengthColor = strength >= 60 ? "bg-emerald-500" : strength >= 30 ? "bg-amber-500" : "bg-red-500";
                  

                  let nextAction = "Keep documenting — every event matters";
                  if (docs === 0) nextAction = "Upload your contract or agreement as evidence";
                  else if (inc < 3) nextAction = "Log more events to strengthen this file";
                  else if (strength >= 60 && gens === 0) nextAction = "Ready to generate a document";

                  const statusLevel = (c as any).status_level === "case" ? "case" : "record";
                  const levelClass = statusLevel === "case"
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/30";

                  const partyName = c.opposing_party && c.opposing_party.trim().length > 0
                    ? c.opposing_party
                    : c.title;

                  return (
                    <Link key={c.id} to="/cases/$caseId" params={{ caseId: c.id }}>
                      <Card className="relative rounded-xl p-5 shadow-sm transition-colors hover:bg-secondary/60 h-full">
                        {insights > 0 && (
                          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/30">
                            <Lightbulb className="h-3 w-3" /> {insights}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 pr-16">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${levelClass}`}>
                            {statusLevel === "case" ? "Case" : "File"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {DISPUTE_LABELS[c.dispute_type]}
                          </span>
                        </div>
                        <div className="mt-2 font-medium leading-tight">{partyName}</div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>File strength</span><span>{strength}%</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className={`h-full ${strengthColor}`} style={{ width: `${Math.min(100, strength)}%` }} />
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Chip>{inc} event{inc === 1 ? "" : "s"}</Chip>
                          <Chip>{docs} evidence</Chip>
                          <Chip>{days === 0 ? "today" : `${days}d open`}</Chip>
                        </div>

                        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="truncate">{nextAction}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div>
            <h2 className="font-serif text-xl font-semibold">Recent activity</h2>
            <Card className="mt-3 rounded-xl p-5 shadow-sm">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Your activity will appear here as you build your file.</p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ACTIVITY_DOT[a.type]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{a.text}</div>
                        <div className="text-[11px] text-muted-foreground">{relTime(a.at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Featured resource */}
          <Card className="rounded-xl border-l-4 border-l-accent p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-accent/15 p-2 text-accent">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-serif text-base font-semibold">Know Your Rights</div>
                  <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{featuredText}</p>
                </div>
              </div>
              <Link to="/resources">
                <Button variant="outline" size="sm">
                  <BookOpen className="mr-1 h-4 w-4" /> View Resources
                </Button>
              </Link>
            </div>
          </Card>

          <Disclaimer className="pt-2" />
        </div>
      </AppShell>
    </TooltipProvider>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 font-serif text-3xl font-semibold">{value}</div>
    </Card>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

type QATarget = { to: "/cases/$caseId"; params: { caseId: string }; search: { tab: "incidents" | "documents" | "ai" } } | null;

function QuickAction({ icon: Icon, label, target, disabled }: { icon: any; label: string; target: QATarget; disabled: boolean }) {
  const button = (
    <Button
      variant="outline"
      disabled={disabled}
      className="w-full justify-start h-12 rounded-xl"
    >
      <Icon className="mr-2 h-4 w-4" />
      <span className="text-sm font-medium">{label}</span>
    </Button>
  );
  if (disabled || !target) {
    return (
      <Tooltip>
        <TooltipTrigger asChild><div>{button}</div></TooltipTrigger>
        <TooltipContent>Start a file first</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Link to={target.to} params={target.params} search={target.search}>
      {button}
    </Link>
  );
}
