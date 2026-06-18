import { toast } from "sonner";
import { Pencil, FileUp, ArrowRightCircle, FolderPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AchievementKind = "first-event" | "lease-uploaded" | "offer-uploaded" | "lifecycle-ongoing" | "first-file";

const STYLES: Record<AchievementKind, { icon: LucideIcon; tone: string }> = {
  "first-event":        { icon: Pencil,           tone: "bg-amber-500 text-white" },
  "lease-uploaded":     { icon: FileUp,           tone: "bg-blue-500 text-white" },
  "offer-uploaded":     { icon: FileUp,           tone: "bg-blue-500 text-white" },
  "lifecycle-ongoing":  { icon: ArrowRightCircle, tone: "bg-emerald-500 text-white" },
  "first-file":         { icon: FolderPlus,       tone: "bg-violet-500 text-white" },
};

export function showAchievement(kind: AchievementKind, text: string) {
  const { icon: Icon, tone } = STYLES[kind];
  toast.custom(
    (id) => (
      <div
        onClick={() => toast.dismiss(id)}
        className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-card px-3 py-2 pr-4 shadow-lg animate-fade-in"
      >
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm leading-tight">{text}</div>
      </div>
    ),
    { duration: 4000, position: "top-center" },
  );
}
