import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReceiptText } from "lucide-react";
import { toast } from "sonner";

const search = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  module: z.enum(["landlord_tenant", "employer_employee", "other_general"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in — Pull Up Receipts" },
      { name: "description", content: "Sign in or create your free Pull Up Receipts account." },
    ],
  }),
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const { mode, module: moduleParam } = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">(mode ?? "signin");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (mode) setTab(mode); }, [mode]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (tab === "signup" && !agreed) {
      toast.error("Please accept the terms to continue.");
      return;
    }
    setLoading(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
            data: {
              first_name: firstName,
              full_name: firstName,
              preferred_module: moduleParam ?? null,
            },
          },
        });
        if (error) throw error;
        toast.success("Account created. You're in.");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (result.error) {
      toast.error("Google sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <ReceiptText className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold tracking-tight">Pull Up Receipts</span>
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-center">Welcome to Pull Up Receipts</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">Your file. Your rights.</p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")} className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6 space-y-4">
              <Button onClick={handleGoogle} variant="outline" className="w-full h-10" disabled={loading}>
                Continue with Google
              </Button>
              <Divider />
              <form onSubmit={handleEmail} className="space-y-3">
                <Field label="Email" type="email" value={email} onChange={setEmail} required />
                <Field label="Password" type="password" value={password} onChange={setPassword} required />
                <Button type="submit" className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6 space-y-4">
              <Button onClick={handleGoogle} variant="outline" className="w-full h-10" disabled={loading}>
                Sign up with Google
              </Button>
              <Divider />
              <form onSubmit={handleEmail} className="space-y-3">
                <Field label="First name" value={firstName} onChange={setFirstName} required />
                <Field label="Email" type="email" value={email} onChange={setEmail} required />
                <Field label="Password" type="password" value={password} onChange={setPassword} required minLength={8} />
                <label className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
                  <Checkbox checked={agreed} onCheckedChange={(c) => setAgreed(c === true)} className="mt-0.5" />
                  <span>
                    I agree that Pull Up Receipts is a document preparation tool and does not provide legal advice.
                  </span>
                </label>
                <Button type="submit" className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading}>
                  {loading ? "Creating…" : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, minLength }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; minLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} minLength={minLength} className="h-10" />
    </div>
  );
}

function Divider() {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
      <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">or</span></div>
    </div>
  );
}
