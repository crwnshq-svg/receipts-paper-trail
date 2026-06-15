import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Pencil, FolderLock, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pull Up Receipts — Pull Up Your Receipts" },
      {
        name: "description",
        content:
          "Document disputes with landlords, employers, or neighbors. Build a clear, timestamped paper trail and hold them accountable.",
      },
      { property: "og:title", content: "Pull Up Receipts — Pull Up Your Receipts" },
      {
        property: "og:description",
        content:
          "Your personal legal paper trail and self-advocacy tool. Free forever — 75MB secure storage.",
      },
    ],
  }),
  component: Landing,
});

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
        <FileText className="h-4 w-4 text-primary-foreground" />
      </div>
      <span className="text-base font-semibold tracking-tight">
        Pull Up Receipts
      </span>
    </Link>
  );
}

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user) navigate({ to: "/dashboard", replace: true });
    });
    return () => { cancelled = true; };
  }, [navigate]);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Wordmark />
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/get-started">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-4 pt-16 pb-12 text-center sm:pt-24">
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            The paper trail they hoped you'd never build.&nbsp;
            <br />
            <span className="text-accent">Start documenting.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Your evidence, organized. Your rights, explained. Your case, ready.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Because the truth is stronger when it's documented.
          </p>
          <div className="mt-8">
            <Link to="/get-started">
              <Button
                size="lg"
                className="h-12 bg-primary px-8 text-base text-primary-foreground hover:bg-primary/90"
              >
                Pull Up Your Receipts
              </Button>
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">
              Create your free account in 30 seconds. 75MB secure storage to
              start.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-4xl px-4 py-16">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">
              How it works
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {[
              {
                  n: "1",
                  title: "Start a file",
                  body: "Pick what kind of dispute it is and name the other party. Done in a minute.",
                },
                  {
                    n: "2",
                    title: "Build your paper trail",
                    body: "Upload evidence, log events as they happen. We organize, timestamp it all, and provide insights.",
                  },
                  {
                    n: "3",
                    title: "Make them accountable",
                    body: "Generate documents, find resources, and decide your next move with confidence.\u00a0",
                  },
              ].map((s) => (
                <div key={s.n} className="text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {s.n}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-5xl px-4 py-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: FolderLock,
                title: "Store Everything",
                body: "Your Evidence Vault. Contracts, photos, videos, emails. Store everything, because everything matters.\u00a0",
              },
              {
                icon: Pencil,
                title: "Log Every Event",
                body: "Your running timeline. Every date, every detail, every ignored request captured so nothing gets forgotten.\u00a0",
              },
              {
                icon: FileText,
                title: "Generate Your Case",
                body: "Our tools turn everything you have documented into letters, complaints, requests, and case packages that demand a response.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">
              Simple pricing
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Start free. Upgrade when your file grows.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <PriceCard
                name="Free"
                price="$0"
                period=""
                features={[
                  "1 active file",
                  "75 MB Evidence Vault",
                  "Event log",
                  "3 AI questions",
                ]}
              />
              <PriceCard
                name="Monthly"
                price="$15"
                period="/month"
                features={[
                  "Unlimited cases",
                  "Unlimited storage",
                  "Unlimited AI chat",
                  "Document generation",
                  "Passive AI insights",
                ]}
              />
              <PriceCard
                name="Annual"
                price="$150"
                period="/year"
                highlighted
                badge="Most Popular"
                features={[
                  "Everything in Monthly",
                  "Save $30/year",
                  "Priority support",
                  "Early access to features",
                ]}
              />
            </div>
            <p className="mx-auto mt-6 max-w-xl text-center text-xs text-muted-foreground">
              $49 Case Package add-on available to paid subscribers — a
              court-ready PDF of your full case.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-8 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/" className="hover:text-foreground">
              Terms of Service
            </Link>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
            Receipts is a document preparation tool and does not provide legal
            advice. © {new Date().getFullYear()} Receipts.
          </p>
        </div>
      </footer>
    </div>
  );
}

function PriceCard({
  name,
  price,
  period,
  features,
  highlighted,
  badge,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={
        "relative rounded-xl border bg-background p-6 " +
        (highlighted
          ? "border-accent ring-2 ring-accent/30 shadow-lg"
          : "border-border")
      }
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
          {badge}
        </div>
      )}
      <div className="text-sm font-semibold">{name}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold">{price}</span>
        <span className="text-sm text-muted-foreground">{period}</span>
      </div>
      <ul className="mt-5 space-y-2">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 text-sm text-foreground"
          >
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
