import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lightbulb, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { dismissInsight } from "@/lib/document-intelligence.functions";
import { consumeAiQuestion } from "@/lib/ai.functions";

export type InsightRow = {
  id: string;
  case_id: string;
  document_id: string;
  insight_type: string;
  insight_title: string;
  brief_description: string;
  full_guidance: string;
};

export function InsightModal({
  insight, open, onOpenChange, isPaid, onConsumed, onLimitHit, onDismissed,
}: {
  insight: InsightRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPaid: boolean;
  onConsumed?: (used: number) => void;
  onLimitHit?: () => void;
  onDismissed?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const consume = useServerFn(consumeAiQuestion);
  const dismiss = useServerFn(dismissInsight);
  const [busy, setBusy] = useState(false);

  if (!insight) return null;

  async function handleFollowUp() {
    if (!insight) return;
    setBusy(true);
    try {
      if (!isPaid) {
        if (!confirm("Use one of your 3 free questions to follow up on this insight?")) {
          setBusy(false);
          return;
        }
        try {
          const r = await consume();
          onConsumed?.(typeof r.used === "number" ? r.used : 0);
        } catch (err: any) {
          if (err?.message?.includes("FREE_LIMIT_REACHED")) {
            onLimitHit?.();
            setBusy(false);
            return;
          }
          throw err;
        }
      }
      onOpenChange(false);
      navigate({
        to: "/cases/$caseId",
        params: { caseId: insight.case_id },
        search: { tab: "ai", ask: `insight:${insight.id}` },
      } as any);

    } catch (err: any) {
      toast.error(err?.message ?? "Could not open chat");
    } finally {
      setBusy(false);
    }
  }

  async function handleDismiss() {
    if (!insight) return;
    setBusy(true);
    try {
      await dismiss({ data: { insightId: insight.id } });
      onDismissed?.(insight.id);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not dismiss");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            {insight.insight_title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm whitespace-pre-wrap">{insight.brief_description}</p>
        <p className="text-xs text-muted-foreground italic">
          This is not legal advice. Review with a qualified attorney for guidance specific to your situation.
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleDismiss} disabled={busy}>
            <X className="h-4 w-4 mr-1" /> Dismiss
          </Button>
          <Button onClick={handleFollowUp} disabled={busy}
            className="bg-primary text-primary-foreground hover:bg-accent">
            <MessageSquare className="h-4 w-4 mr-1" />
            {isPaid ? "Follow up in chat" : "Use a Question to Follow Up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
