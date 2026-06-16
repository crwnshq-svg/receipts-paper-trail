import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Bell, Lightbulb, Megaphone, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Alerts — Pull Up Receipts" }] }),
  component: NotificationsPage,
});

type Filter = "all" | "unread" | "read";

function relTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function NotificationsPage() {
  const [filter, setFilter] = useState<Filter>("all");

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("notifications").select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => !n.is_read);
    if (filter === "read") return notifications.filter((n) => n.is_read);
    return notifications;
  }, [filter, notifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const readCount = notifications.length - unreadCount;

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Updates from your files and broadcasts from Pull Up Receipts.
          </p>
        </div>

        <div className="inline-flex rounded-lg border bg-card p-1 text-sm">
          {([
            { k: "all", label: `All (${notifications.length})` },
            { k: "unread", label: `Unread (${unreadCount})` },
            { k: "read", label: `Read (${readCount})` },
          ] as { k: Filter; label: string }[]).map((opt) => (
            <button
              key={opt.k}
              onClick={() => setFilter(opt.k)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === opt.k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-3 opacity-40" />
            {filter === "unread"
              ? "No unread alerts."
              : filter === "read"
                ? "No alerts marked read yet."
                : "No alerts yet."}
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((n) =>
              n.is_read ? (
                <ReadRow key={n.id} n={n} />
              ) : (
                <UnreadRow key={n.id} n={n} />
              ),
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function UnreadRow({ n }: { n: any }) {
  return (
    <Link
      to="/notifications/$notificationId"
      params={{ notificationId: n.id }}
      className="block rounded-lg border bg-card p-4 transition hover:border-accent border-l-4 border-l-accent"
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "rounded-full p-1.5 shrink-0",
          n.type === "insight" ? "bg-amber-100" : "bg-blue-100",
        )}>
          {n.type === "insight"
            ? <Lightbulb className="h-4 w-4 text-amber-600" />
            : <Megaphone className="h-4 w-4 text-blue-600" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-sm truncate">{n.title}</div>
            <div className="text-[11px] text-muted-foreground shrink-0">
              {relTime(n.created_at)}
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2">{n.body}</p>
        </div>
      </div>
    </Link>
  );
}

function ReadRow({ n }: { n: any }) {
  return (
    <Link
      to="/notifications/$notificationId"
      params={{ notificationId: n.id }}
      className="flex items-center justify-between gap-3 rounded-md border bg-card/40 px-3 py-2 text-sm transition hover:bg-card"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Check className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="truncate text-muted-foreground">{n.title}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60 shrink-0">read</span>
      </div>
      <span className="text-[11px] text-muted-foreground shrink-0">{relTime(n.created_at)}</span>
    </Link>
  );
}
