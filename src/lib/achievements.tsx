import { toast } from "sonner";
import { Pencil, FileUp, ArrowRightCircle, FolderPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type AchievementKind = "first-event" | "lease-uploaded" | "offer-uploaded" | "lifecycle-ongoing" | "first-file";

const STYLES: Record<AchievementKind, { icon: LucideIcon; tone: string }> = {
  "first-event":        { icon: Pencil,           tone: "bg-amber-500 text-white" },
  "lease-uploaded":     { icon: FileUp,           tone: "bg-blue-500 text-white" },
  "offer-uploaded":     { icon: FileUp,           tone: "bg-blue-500 text-white" },
  "lifecycle-ongoing":  { icon: ArrowRightCircle, tone: "bg-emerald-500 text-white" },
  "first-file":         { icon: FolderPlus,       tone: "bg-violet-500 text-white" },
};

// Plain `toast(...)` instead of `toast.custom(...)` so the Sonner Toaster's
// own positioning/visibility logic is used. Custom toasts in Sonner v2 were
// rendering unstyled and inconsistently across routes, which is why these
// drops appeared not to fire at all even when their triggers ran.
export function showAchievement(kind: AchievementKind, text: string) {
  const { icon: Icon, tone } = STYLES[kind];
  toast(text, {
    duration: 4000,
    position: "top-center",
    icon: (
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
    ),
    className: "!rounded-full !py-2 !pr-4",
  });
}
