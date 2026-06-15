import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Bell, Lightbulb, Megaphone } from "lucide-react";
import { markNotificationsRead } from "@/lib/notifications.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Pull Up Receipts" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const markRead = useServerFn(markNotificationsRead);

  const { data: notifications } = useQuery({
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

  // Mark all unread as read on first view
  useEffect(() => {
    const unread = (notifications ?? []).filter((n) => !n.is_read).map((n) => n.id);
    if (unread.length === 0) return;
    markRead({ data: { ids: unread } })
      .then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications?.length]);

  function handleTap(n: any) {
    if (n.related_case_id) {
      navigate({
        to: "/cases/$caseId",
        params: { caseId: n.related_case_id },
        search: n.related_document_id ? { tab: "documents" } : undefined,
      } as any);
    }
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Updates from your files and broadcasts from Pull Up Receipts.
          </p>
        </div>

        {!notifications || notifications.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-3 opacity-40" />
            No notifications yet.
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <button key={n.id} onClick={() => handleTap(n)}
                className={cn(
                  "w-full text-left rounded-lg border bg-card p-4 transition hover:border-accent",
                  !n.is_read && "border-l-4 border-l-accent",
                )}>
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
                        {new Date(n.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{n.body}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
