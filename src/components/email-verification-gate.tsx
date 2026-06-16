import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mail, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function EmailVerificationGate({ email }: { email: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Auto-detect verification when Supabase fires USER_UPDATED
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "USER_UPDATED" || event === "SIGNED_IN") {
        router.invalidate();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  async function resend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin + "/dashboard" },
      });
      if (error) throw error;
      toast.success("Verification email sent. Check your inbox.");
      setCooldown(60);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend");
    } finally {
      setResending(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await supabase.auth.refreshSession();
      const { data } = await supabase.auth.getUser();
      if (data.user?.email_confirmed_at) {
        await qc.invalidateQueries();
        router.invalidate();
      } else {
        toast.info("Not verified yet — check your email for the link.");
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
          <Mail className="h-6 w-6 text-accent" />
        </div>
        <h1 className="mt-4 font-serif text-2xl font-semibold">Verify your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please check your email and verify your address to continue.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          We sent a link to <span className="font-medium text-foreground">{email}</span>. Click
          “Verify My Email” in that message, then return here.
        </p>
        <div className="mt-6 space-y-2">
          <Button
            onClick={refresh}
            disabled={refreshing}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            I've verified — continue
          </Button>
          <Button
            onClick={resend}
            disabled={cooldown > 0 || resending}
            variant="outline"
            className="w-full"
          >
            {cooldown > 0
              ? `Resend in ${cooldown}s`
              : resending
                ? "Sending…"
                : "Resend verification email"}
          </Button>
          <button
            onClick={signOut}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3 w-3" /> Sign out
          </button>
        </div>
      </Card>
    </div>
  );
}
