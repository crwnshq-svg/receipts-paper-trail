import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { deleteCase } from "@/lib/cases.functions";

export function DeleteCaseDialog({
  open,
  onOpenChange,
  caseId,
  caseLabel,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  caseLabel: string;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const del = useServerFn(deleteCase);
  const [cascade, setCascade] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    try {
      // Per spec: even unchecked, cascade to avoid orphans (no orphan view exists).
      await del({ data: { caseId, cascadeAll: true } });
      toast.success("File deleted");
      // Invalidate every list that referenced this case
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["incidents-all"] });
      qc.invalidateQueries({ queryKey: ["documents-all"] });
      qc.invalidateQueries({ queryKey: ["insights-all"] });
      qc.invalidateQueries({ queryKey: ["generated-all"] });
      qc.invalidateQueries({ queryKey: ["storage-usage"] });
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this file</DialogTitle>
          <DialogDescription>
            You're about to delete <span className="font-medium text-foreground">{caseLabel}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
            <p className="text-foreground/80">
              This action cannot be undone.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={cascade}
            onCheckedChange={(c) => setCascade(c === true)}
            className="mt-0.5"
          />
          <span>Also delete all evidence, events, and notes associated with this file.</span>
        </label>

        {!cascade && (
          <p className="text-xs text-muted-foreground">
            Note: any evidence stored in the Evidence Vault tied to this file would become
            orphaned. To keep your data clean, related evidence, events, notes, generated
            documents, and AI history will be removed alongside the file.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
