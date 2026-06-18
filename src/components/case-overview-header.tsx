import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sparkles,
  MessageSquarePlus,
  Camera,
  Upload,
  FolderOpen,
  ArrowRight,
  Lightbulb,
  Award,

} from "lucide-react";
import { toast } from "sonner";
import { showAchievement } from "@/lib/achievements";
import { uploadEvidence, EVIDENCE_ACCEPT } from "@/lib/evidence-upload";
import { analyzeDocument } from "@/lib/document-intelligence.functions";
import { InsightModal, type InsightRow } from "@/components/insight-modal";

function toQuestions(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function fmtSince(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(+d)) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toLowerCase();
}

type CaseRow = {
  id: string;
  title: string;
  module: string | null;
  dispute_type: string;
  lifecycle_stage: string | null;
  lifecycle_transitioned_at: string | null;
  property_management_company: string | null;
  lease_end_date: string | null;
  monthly_rent: number | null;
  landlord_name: string | null;
  lease_status: string | null;
  employment_type: string | null;
  supervisor_name: string | null;
  work_location: string | null;
  has_written_contract: boolean | null;
  profile_complete_celebrated?: boolean | null;
};

export function CaseOverviewHeader({
  caseRow,
  isPaid,
  onConsumed,
  onLimitHit,
}: {
  caseRow: CaseRow;
  isPaid: boolean;
  onConsumed?: (used: number) => void;
  onLimitHit?: () => void;
}) {
  const caseId = caseRow.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const analyze = useServerFn(analyzeDocument);

  const { data: incidents } = useQuery({
    queryKey: ["incidents", caseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("incidents")
        .select("id, clarifying_questions, created_at")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: docs } = useQuery({
    queryKey: ["documents", caseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, file_name, detected_type, ai_summary, extracted_data")
        .eq("case_id", caseId);
      return data ?? [];
    },
  });

  const { data: insights } = useQuery({
    queryKey: ["case-insights", caseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_insights")
        .select("*")
        .eq("case_id", caseId)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false });
      return (data ?? []) as InsightRow[];
    },
  });

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [activeInsight, setActiveInsight] = useState<InsightRow | null>(null);
  const [showCelebrate, setShowCelebrate] = useState(false);

  // Module-specific required-fields completeness check.
  const isRentingCase = caseRow.module === "landlord_tenant";
  const isEmploymentCase = caseRow.module === "employer_employee";
  const profileComplete = useMemo(() => {
    if (isRentingCase) {
      return Boolean(
        caseRow.landlord_name &&
          caseRow.property_management_company &&
          caseRow.monthly_rent != null &&
          caseRow.lease_end_date &&
          caseRow.lease_status,
      );
    }
    if (isEmploymentCase) {
      return Boolean(
        caseRow.employment_type &&
          caseRow.supervisor_name &&
          caseRow.work_location &&
          caseRow.has_written_contract !== null,
      );
    }
    return false;
  }, [caseRow, isRentingCase, isEmploymentCase]);

  // First-time celebration: fires once when all required fields are filled.
  useEffect(() => {
    if (!profileComplete) return;
    if (caseRow.profile_complete_celebrated) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase
        .from("cases")
        .update({ profile_complete_celebrated: true } as any)
        .eq("id", caseId)
        .eq("profile_complete_celebrated", false);
      if (cancelled) return;
      if (!error) {
        setShowCelebrate(true);
        qc.invalidateQueries({ queryKey: ["case", caseId] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileComplete, caseRow.profile_complete_celebrated, caseId, qc]);


  async function transitionToOngoing() {
    setTransitioning(true);
    try {
      // Look for a verified date on a relevant uploaded document
      const relevant = (docs ?? []).find((d) => {
        const t = (d.detected_type || "").toLowerCase();
        const n = (d.file_name || "").toLowerCase();
        if (isRenting) return t.includes("lease") || n.includes("lease");
        if (isEmployment)
          return (
            t.includes("offer") ||
            t.includes("contract") ||
            t.includes("employment") ||
            n.includes("offer") ||
            n.includes("contract")
          );
        return false;
      });
      const ex = (relevant?.extracted_data ?? null) as Record<string, unknown> | null;
      const candidate =
        (ex?.signed_date as string | undefined) ??
        (ex?.effective_date as string | undefined) ??
        (ex?.start_date as string | undefined) ??
        (ex?.lease_start_date as string | undefined) ??
        (ex?.date as string | undefined) ??
        null;
      let transitionedAt = new Date().toISOString();
      if (candidate) {
        const parsed = new Date(candidate);
        if (!Number.isNaN(+parsed)) transitionedAt = parsed.toISOString();
      }
      const { error } = await supabase
        .from("cases")
        .update({ lifecycle_stage: "ongoing", lifecycle_transitioned_at: transitionedAt } as any)
        .eq("id", caseId);
      if (error) throw error;
      toast.success("Marked as ongoing");
      showAchievement("lifecycle-ongoing", `${caseRow.title} is now tracking ongoing.`);
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["cases"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update");
    } finally {
      setTransitioning(false);
    }
  }

  // ----- Lifecycle pill -----
  const stage = (caseRow.lifecycle_stage || "").toLowerCase();
  const isOngoing = stage === "ongoing";
  const isPre = stage === "pre";
  const sinceLabel = fmtSince(caseRow.lifecycle_transitioned_at);

  // ----- Next step priority -----
  const liveClarifying = useMemo(() => {
    if (!incidents) return null;
    for (const i of incidents) {
      const qs = toQuestions(i.clarifying_questions);
      if (qs.length) return { incidentId: i.id, question: qs[0] };
    }
    return null;
  }, [incidents]);

  const isRenting = caseRow.module === "landlord_tenant";
  const isEmployment = caseRow.module === "employer_employee";

  const hasLease = useMemo(() => {
    if (!docs) return true;
    return docs.some((d) => {
      const t = (d.detected_type || "").toLowerCase();
      const n = (d.file_name || "").toLowerCase();
      return t.includes("lease") || n.includes("lease");
    });
  }, [docs]);

  const hasOffer = useMemo(() => {
    if (!docs) return true;
    return docs.some((d) => {
      const t = (d.detected_type || "").toLowerCase();
      const n = (d.file_name || "").toLowerCase();
      return (
        t.includes("offer") ||
        t.includes("contract") ||
        t.includes("employment") ||
        n.includes("offer") ||
        n.includes("contract")
      );
    });
  }, [docs]);

  const missingField = useMemo<{ label: string; key: string } | null>(() => {
    if (isRenting) {
      if (!caseRow.landlord_name) return { label: "landlord name", key: "landlord_name" };
      if (!caseRow.property_management_company)
        return { label: "property management company", key: "property_management_company" };
      if (!caseRow.monthly_rent) return { label: "monthly rent", key: "monthly_rent" };
      if (!caseRow.lease_end_date) return { label: "lease end date", key: "lease_end_date" };
      if (!caseRow.lease_status) return { label: "lease status", key: "lease_status" };
    } else if (isEmployment) {
      if (!caseRow.employment_type) return { label: "employment type", key: "employment_type" };
      if (!caseRow.supervisor_name) return { label: "supervisor name", key: "supervisor_name" };
      if (!caseRow.work_location) return { label: "work location", key: "work_location" };
      if (caseRow.has_written_contract === null)
        return { label: "whether you have a written contract", key: "has_written_contract" };
    }
    return null;
  }, [caseRow, isRenting, isEmployment]);

  const firstInsight = insights?.[0] ?? null;

  function goAi(ask?: string) {
    navigate({
      to: "/cases/$caseId",
      params: { caseId },
      search: ask ? ({ tab: "ai", ask } as any) : ({ tab: "ai" } as any),
      replace: true,
    } as any);
  }
  function goActivity(newEvent?: boolean) {
    navigate({
      to: "/cases/$caseId",
      params: { caseId },
      search: newEvent ? ({ tab: "incidents", action: "new" } as any) : ({ tab: "incidents" } as any),
      replace: true,
    } as any);
  }
  function goDocs(upload?: boolean) {
    navigate({
      to: "/cases/$caseId",
      params: { caseId },
      search: upload ? ({ tab: "documents", action: "upload" } as any) : ({ tab: "documents" } as any),
      replace: true,
    } as any);
  }

  // Next-step descriptor
  const nextStep = useMemo(() => {
    if (liveClarifying) {
      return {
        label: `Answer: ${liveClarifying.question}`,
        onClick: () => goActivity(),
      };
    }
    if (isRenting && !hasLease) {
      return {
        label: "Upload your lease so the companion can keep an eye on it",
        onClick: () => setUploadOpen(true),
      };
    }
    if (isEmployment && !hasOffer) {
      return {
        label: "Upload your offer letter so the companion can keep an eye on it",
        onClick: () => setUploadOpen(true),
      };
    }
    if (firstInsight) {
      return {
        label: `Review insight: ${firstInsight.insight_title}`,
        onClick: () => setActiveInsight(firstInsight),
      };
    }
    if (missingField) {
      return {
        label: `Add your ${missingField.label} to this file's profile`,
        onClick: () => goAi(`collect:${missingField.key}`),
      };
    }
    return {
      label: "Anything new since you last checked in?",
      onClick: () => goAi(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveClarifying, isRenting, isEmployment, hasLease, hasOffer, firstInsight, missingField]);

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const inserted = await uploadEvidence({ file, caseId });
      if (inserted) {
        toast.success("Uploaded — analyzing…");
        qc.invalidateQueries({ queryKey: ["documents", caseId] });
        analyze({ data: { documentId: inserted.id } })
          .then(() => {
            qc.invalidateQueries({ queryKey: ["documents", caseId] });
            qc.invalidateQueries({ queryKey: ["case-insights", caseId] });
          })
          .catch((err) => console.warn("analyze failed", err));
      }
    } finally {
      setUploading(false);
      setUploadOpen(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {/* Lifecycle pill */}
      {(isOngoing || isPre) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge
            className={
              isOngoing
                ? "border-transparent bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15"
                : "border-transparent bg-muted text-muted-foreground hover:bg-muted"
            }
          >
            {isOngoing ? "ongoing" : "pre"}
          </Badge>
          {sinceLabel && (
            <span className="text-muted-foreground">
              {isOngoing ? "ongoing since" : "noted since"} {sinceLabel}
            </span>
          )}
          {isPre && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 border-emerald-500/40 px-2 text-[11px] text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-400"
              onClick={transitionToOngoing}
              disabled={transitioning}
            >
              {transitioning
                ? "Updating…"
                : isRenting
                  ? "I signed the lease"
                  : isEmployment
                    ? "I accepted the offer"
                    : "This is now active"}
            </Button>
          )}
        </div>
      )}


      {/* Next step line */}
      <button
        type="button"
        onClick={nextStep.onClick}
        className="group flex w-full items-center gap-2 rounded-md border border-dashed border-border bg-card/40 px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-card"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="flex-1 truncate">{nextStep.label}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>

      {/* Companion banner */}
      <Card
        role="button"
        tabIndex={0}
        onClick={() => goAi()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            goAi();
          }
        }}
        className="cursor-pointer border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-4 transition-shadow hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/15 p-2.5">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Talk to your companion</div>
            <div className="text-xs text-muted-foreground">
              opens already knowing this is {caseRow.title}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-primary" />
        </div>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          onClick={() => goActivity(true)}
          className="h-auto flex-col gap-1 py-3"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span className="text-xs">Log an event</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => setUploadOpen(true)}
          className="h-auto flex-col gap-1 py-3"
          disabled={uploading}
        >
          <Camera className="h-4 w-4" />
          <span className="text-xs">{uploading ? "Uploading…" : "Add evidence"}</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => goDocs()}
          className="h-auto flex-col gap-1 py-3"
        >
          <FolderOpen className="h-4 w-4" />
          <span className="text-xs">View files</span>
        </Button>
      </div>

      {/* Insights carousel */}
      {insights && insights.length > 0 && (
        <div className="-mx-1 overflow-x-auto">
          <div className="flex gap-2 px-1 pb-1">
            {insights.map((ins) => (
              <button
                key={ins.id}
                type="button"
                onClick={() => setActiveInsight(ins)}
                className="w-64 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-left transition-colors hover:bg-amber-500/10"
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                  <Lightbulb className="h-3 w-3" />
                  Insight
                </div>
                <div className="line-clamp-1 text-sm font-medium">{ins.insight_title}</div>
                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {ins.brief_description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        hidden
        accept="image/*"
        capture="environment"
        onChange={(e) => handleUpload(e.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        hidden
        accept={EVIDENCE_ACCEPT}
        onChange={(e) => handleUpload(e.target.files?.[0])}
      />

      {/* Upload picker dialog (camera default) */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add evidence</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              className="w-full justify-start"
              onClick={() => cameraRef.current?.click()}
              disabled={uploading}
            >
              <Camera className="mr-2 h-4 w-4" /> Take a photo
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-2 h-4 w-4" /> Choose a file
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InsightModal
        insight={activeInsight}
        open={!!activeInsight}
        onOpenChange={(o) => !o && setActiveInsight(null)}
        isPaid={isPaid}
        onConsumed={onConsumed}
        onLimitHit={onLimitHit}
        onDismissed={() => {
          qc.invalidateQueries({ queryKey: ["case-insights", caseId] });
          setActiveInsight(null);
        }}
      />

      <Dialog open={showCelebrate} onOpenChange={setShowCelebrate}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
              <Award className="h-8 w-8 text-emerald-400" />
            </div>
            <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              achievement unlocked
            </div>
            <DialogTitle className="mt-1 text-center text-2xl">Profile complete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You filled in everything we know to ask about {caseRow.title} — your companion now has the full picture.
          </p>
          <p className="text-xs text-muted-foreground/70 italic">reward coming soon</p>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => setShowCelebrate(false)}
              className="bg-emerald-500 text-white hover:bg-emerald-500/90"
            >
              Nice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
