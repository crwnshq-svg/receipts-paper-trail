import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lightbulb, Megaphone, MessageCircle, BookOpen, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications/$notificationId")({
  head: () => ({ meta: [{ title: "Alert — Pull Up Receipts" }] }),
  component: NotificationDetail,
});

const RESOURCE_BY_MODULE: Record<string, { name: string; url: string; description: string }> = {
  landlord_tenant: {
    name: "Tenant Protection Act (AB 1482)",
    url: "https://landlordtenant.dre.ca.gov/tenant/rent_caps.html",
    description: "Statewide rent cap and just cause for eviction protections in California.",
  },
  employer_employee: {
    name: "California Whistleblower Protections — Labor Code § 1102.5",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=LAB&sectionNum=1102.5",
    description: "Protects employees who report violations from retaliation.",
  },
  neighbor: {
    name: "Local Police Non-Emergency",
    url: "https://www.usa.gov/local-governments",
    description: "For neighbor disputes involving harassment or property damage.",
  },
  other: {
    name: "FTC Consumer Complaint",
    url: "https://reportfraud.ftc.gov/",
    description: "Report fraud, scams, and bad business practices.",
  },
};

function NotificationDetail() {
  const { notificationId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: notif, isLoading } = useQuery({
    queryKey: ["notification", notificationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("id", notificationId)
        .maybeSingle();
      return data;
    },
  });

  const { data: caseRow } = useQuery({
    queryKey: ["notif-case", notif?.related_case_id],
    enabled: !!notif?.related_case_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("cases")
        .select("id,title,opposing_party,dispute_type")
        .eq("id", notif!.related_case_id!)
        .maybeSingle();
      return data;
    },
  });

  // Mark this alert as read on view
  useEffect(() => {
    if (!notif || notif.is_read) return;
    (async () => {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notif.id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
      qc.invalidateQueries({ queryKey: ["notification", notif.id] });
    })().catch(() => {});
  }, [notif?.id, notif?.is_read, qc]);

  if (isLoading) {
    return (
      <AppShell>
        <Card className="p-8 text-sm text-muted-foreground">Loading…</Card>
      </AppShell>
    );
  }
  if (!notif) {
    return (
      <AppShell>
        <Card className="p-8 text-sm text-muted-foreground">Alert not found.</Card>
      </AppShell>
    );
  }

  const isInsight = notif.type === "insight";
  const moduleKey = caseRow?.dispute_type ?? "other";
  const resource = RESOURCE_BY_MODULE[moduleKey] ?? RESOURCE_BY_MODULE.other;
  const caseLabel = caseRow
    ? caseRow.opposing_party && caseRow.opposing_party.trim().length > 0
      ? caseRow.opposing_party
      : caseRow.title
    : null;

  function discussWithAi() {
    if (caseRow) {
      navigate({
        to: "/cases/$caseId",
        params: { caseId: caseRow.id },
        search: { tab: "ai", ask: `alert:${notif!.id}` } as any,
      });
    } else {
      navigate({ to: "/ai", search: { ask: `alert:${notif!.id}` } as any });
    }
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-3xl">
        <div>
          <Link
            to="/notifications"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to alerts
          </Link>
        </div>

        <Card className="p-6">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-full p-2 shrink-0 ${
                isInsight ? "bg-amber-100" : "bg-blue-100"
              }`}
            >
              {isInsight ? (
                <Lightbulb className="h-5 w-5 text-amber-600" />
              ) : (
                <Megaphone className="h-5 w-5 text-blue-600" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {isInsight ? "AI Insight" : "Update"}
                <span className="ml-2 font-normal normal-case">
                  · {new Date(notif.created_at).toLocaleString()}
                </span>
              </div>
              <h1 className="mt-1 font-serif text-2xl font-semibold">{notif.title}</h1>
              {caseLabel && caseRow && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Related to file:{" "}
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: caseRow.id }}
                    className="text-accent hover:underline"
                  >
                    {caseLabel}
                  </Link>
                </div>
              )}
              <p className="mt-4 text-sm whitespace-pre-wrap leading-relaxed">{notif.body}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-accent/5 border-accent/30">
          <div className="flex items-start gap-3">
            <MessageCircle className="h-5 w-5 text-accent shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm">Talk this through with RECEIPTS AI</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Open this alert in chat — RECEIPTS AI will react to what was detected and ask a
                follow-up if useful.
              </p>
              <Button
                size="sm"
                onClick={discussWithAi}
                className="mt-3 bg-primary text-primary-foreground"
              >
                Discuss with RECEIPTS AI
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Relevant resource
              </div>
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-start justify-between gap-3 group"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm group-hover:text-accent">
                    {resource.name}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {resource.description}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-accent shrink-0" />
              </a>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
