import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Scale, FolderOpen, LayoutDashboard, LogOut, BookOpen, UserCircle, Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { touchLastActive } from "@/lib/activity.functions";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const touch = useServerFn(touchLastActive);
  const touched = useRef(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Unread notification count (live)
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { count } = await supabase
        .from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("is_read", false);
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  // Touch last_active_at once per session + register SW for push
  useEffect(() => {
    if (touched.current) return;
    touched.current = true;
    touch().catch(() => {});
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // realtime: refresh unread on insert
    let channel: any;
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      const ch = supabase.channel(`notif-${user.id}-${Math.random().toString(36).slice(2, 8)}`);
      ch.on("postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => qc.invalidateQueries({ queryKey: ["notifications-unread"] }));
      ch.subscribe();
      channel = ch;
      if (cancelled) supabase.removeChannel(ch);
    });
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [qc, touch]);

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, badge: 0 },
    { to: "/cases", label: "Cases", icon: FolderOpen, badge: 0 },
    { to: "/notifications", label: "Alerts", icon: Bell, badge: unreadCount },
    { to: "/resources", label: "Resources", icon: BookOpen, badge: 0 },
    { to: "/account", label: "Account", icon: UserCircle, badge: 0 },
  ] as const;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Scale className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-serif text-lg font-semibold">Receipts</span>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {nav.map((n) => (
              <Link key={n.to} to={n.to}
                className={cn("relative rounded-md px-3 py-1.5 text-sm",
                  pathname.startsWith(n.to) ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {n.label}
                {n.badge > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground px-1">
                    {n.badge > 99 ? "99+" : n.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Sign out</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>

      {/* mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card md:hidden">
        <div className="grid grid-cols-5">
          {nav.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to}
                className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[10px]",
                  active ? "text-accent" : "text-muted-foreground")}>
                <div className="relative">
                  <n.icon className="h-5 w-5" />
                  {n.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground px-1">
                      {n.badge > 99 ? "99+" : n.badge}
                    </span>
                  )}
                </div>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <PushPermissionPrompt />
    </div>
  );
}

function PushPermissionPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (sessionStorage.getItem("receipts:push-asked") === "1") return;
    const t = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;

  async function enable() {
    sessionStorage.setItem("receipts:push-asked", "1");
    setShow(false);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      // Subscription requires a VAPID public key. Skip if not yet configured.
      const vapid = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!vapid) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const json: any = sub.toJSON();
      const { savePushSubscription } = await import("@/lib/notifications.functions");
      await savePushSubscription({ data: {
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      }});
    } catch (err) {
      console.warn("push enable failed", err);
    }
  }
  function dismiss() { sessionStorage.setItem("receipts:push-asked", "1"); setShow(false); }

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-40 rounded-lg border bg-card shadow-lg p-4">
      <div className="flex items-start gap-3">
        <Bell className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-medium text-sm">Stay updated</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get notified when new insights appear on your documents.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={enable} className="bg-primary text-primary-foreground">Enable</Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export const DISPUTE_LABELS: Record<string, string> = {
  landlord_tenant: "Landlord / Tenant",
  employer_employee: "Employer / Employee",
  neighbor: "Neighbor",
  other: "Other",
  other_general: "Other / General",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  resolved: "Resolved",
  archived: "Archived",
};

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] leading-relaxed text-muted-foreground", className)}>
      Receipts does not provide legal advice. Nothing in this product creates an attorney-client relationship.
      For legal advice, consult a licensed attorney in your jurisdiction.
    </p>
  );
}
