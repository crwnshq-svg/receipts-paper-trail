import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, DISPUTE_LABELS, Disclaimer } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Plus, FolderOpen, FileText, Clock } from "lucide-react";

const FREE_LIMIT_BYTES = 50 * 1024 * 1024;

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Receipts" }] }),
  component: Dashboard,
});

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function Dashboard() {
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: cases } = useQuery({
    queryKey: ["cases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: storage } = useQuery({
    queryKey: ["storage-usage"],
    queryFn: async () => {
      const { data } = await supabase.from("documents").select("file_size");
      return (data ?? []).reduce((s, d) => s + (d.file_size ?? 0), 0);
    },
  });

  const used = storage ?? 0;
  const pct = Math.min(100, (used / FREE_LIMIT_BYTES) * 100);
  const tier = profile?.subscription_tier ?? "free";

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-semibold">
              {profile?.full_name ? `Welcome, ${profile.full_name.split(" ")[0]}` : "Your dashboard"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Your record, organized.</p>
          </div>
          <Link to="/cases/new">
            <Button className="bg-primary text-primary-foreground hover:bg-accent">
              <Plus className="mr-1 h-4 w-4" /> New case
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <FolderOpen className="h-3.5 w-3.5" /> Cases
            </div>
            <div className="mt-2 font-serif text-3xl font-semibold">{cases?.length ?? 0}</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Plan
            </div>
            <div className="mt-2 font-serif text-3xl font-semibold capitalize">{tier}</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> Storage
            </div>
            <div className="mt-2 font-serif text-xl font-semibold">
              {formatBytes(used)} <span className="text-sm font-normal text-muted-foreground">/ 50 MB</span>
            </div>
            <Progress value={pct} className="mt-2 h-1.5" />
          </Card>
        </div>

        <div>
          <h2 className="font-serif text-xl font-semibold">Recent cases</h2>
          {!cases || cases.length === 0 ? (
            <Card className="mt-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">No cases yet. Start by creating one.</p>
              <Link to="/cases/new"><Button className="mt-4 bg-primary text-primary-foreground">Create your first case</Button></Link>
            </Card>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {cases.slice(0, 6).map((c) => (
                <Link key={c.id} to="/cases/$caseId" params={{ caseId: c.id }}>
                  <Card className="p-4 transition-colors hover:bg-secondary">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{c.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {DISPUTE_LABELS[c.dispute_type]} · Updated {new Date(c.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {c.status}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <Disclaimer className="pt-4" />
      </div>
    </AppShell>
  );
}
