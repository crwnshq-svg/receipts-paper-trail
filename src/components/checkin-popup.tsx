import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";

type CheckIn =
  | { kind: "urgent"; caseId: string; caseLabel: string; issue: string }
  | { kind: "nudge"; caseId: string; caseLabel: string }
  | null;

const SHOWN_KEY = "receipts:checkin-shown";

export function CheckInPopup() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SHOWN_KEY) === "1") return;
    // Wait a beat so the dashboard mounts first.
    const t = setTimeout(() => setEligible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const { data: checkIn } = useQuery<CheckIn>({
    queryKey: ["checkin-data"],
    enabled: eligible,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: cases } = await supabase
        .from("cases")
        .select("id,title,opposing_party,status,updated_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false });
      const active = cases ?? [];
      if (active.length === 0) return null;

      const caseIds = active.map((c) => c.id);
      const { data: flags } = await supabase
        .from("passive_ai_flags")
        .select("case_id,flag_title,severity,is_dismissed")
        .in("case_id", caseIds)
        .eq("is_dismissed", false)
        .eq("severity", "high")
        .limit(1);
      if (flags && flags.length > 0) {
        const f = flags[0];
        const c = active.find((x) => x.id === f.case_id) ?? active[0];
        const label =
          c.opposing_party && c.opposing_party.trim().length > 0
            ? c.opposing_party
            : c.title;
        return { kind: "urgent", caseId: c.id, caseLabel: label, issue: f.flag_title };
      }

      const top = active[0];
      const label =
        top.opposing_party && top.opposing_party.trim().length > 0
          ? top.opposing_party
          : top.title;
      return { kind: "nudge", caseId: top.id, caseLabel: label };
    },
  });

  if (!eligible || dismissed || !checkIn) return null;

  function dismiss() {
    sessionStorage.setItem(SHOWN_KEY, "1");
    setDismissed(true);
  }

  function primary() {
    sessionStorage.setItem(SHOWN_KEY, "1");
    setDismissed(true);
    if (checkIn!.kind === "urgent") {
      navigate({
        to: "/cases/$caseId",
        params: { caseId: checkIn!.caseId },
        search: { tab: "ai", ask: `urgent:${checkIn!.caseId}` } as any,
      });
    } else {
      navigate({
        to: "/cases/$caseId",
        params: { caseId: checkIn!.caseId },
        search: { tab: "incidents", action: "new" } as any,
      });
    }
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-40 rounded-2xl border bg-card shadow-xl p-4 animate-in slide-in-from-bottom-2 fade-in">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-accent/10 p-1.5 shrink-0">
          <Sparkles className="h-4 w-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-accent">
            RECEIPTS AI
          </div>
          {checkIn.kind === "urgent" ? (
            <p className="mt-1 text-sm">
              Heads up — on <strong>{checkIn.caseLabel}</strong>: {checkIn.issue}. Want to dig
              in?
            </p>
          ) : (
            <p className="mt-1 text-sm">
              Welcome back. Anything new on <strong>{checkIn.caseLabel}</strong> you want
              to log?
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={primary} className="bg-primary text-primary-foreground">
              {checkIn.kind === "urgent" ? "Tell me more" : "Log an event"}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="rounded p-1 text-muted-foreground hover:bg-secondary"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
