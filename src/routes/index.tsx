import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FileText, Clock, Shield, Scale } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Receipts — Your Personal Paper Trail" },
      { name: "description", content: "Document disputes with landlords, employers, or neighbors. Secure vault, incident log, and case summaries — your record, organized." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Scale className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-serif text-xl font-semibold tracking-tight">Receipts</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/auth" search={{ mode: "signup" }}>
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-accent">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-4 pt-16 pb-12 text-center sm:pt-24">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-gold"></span>
            Free forever — 50MB secure storage
          </div>
          <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Build your record.<br />
            <span className="text-accent">Keep your receipts.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            A calm, secure place to document disputes with landlords, employers, or neighbors.
            Timestamped incidents, organized files, ready when you need them.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/auth" search={{ mode: "signup" }}>
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-accent">
                Start your case — free
              </Button>
            </Link>
            <Link to="/auth"><Button size="lg" variant="outline">I have an account</Button></Link>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Shield, title: "Secure document vault", body: "Upload contracts, emails, photos, and screenshots. Encrypted and private to you." },
              { icon: Clock, title: "Timestamped incident log", body: "Capture who, what, when, and notes. Every entry is dated and immutable to you." },
              { icon: FileText, title: "Organized by case", body: "Separate landlord, employer, and neighbor disputes. Find anything in seconds." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-lg border border-border bg-card p-6">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-secondary">
                  <Icon className="h-4 w-4 text-accent" />
                </div>
                <h3 className="font-serif text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-card/40">
          <div className="mx-auto max-w-3xl px-4 py-12 text-center">
            <h2 className="font-serif text-2xl font-semibold">Plans</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                { name: "Free", price: "$0", features: ["50MB vault", "Incident log", "Case organization"] },
                { name: "Monthly", price: "$10/mo", features: ["Unlimited storage", "AI document explainer", "Demand letter drafts"] },
                { name: "Annual", price: "$110/yr", features: ["Everything in Monthly", "Save $10/yr", "Priority support"] },
              ].map((p) => (
                <div key={p.name} className="rounded-lg border border-border bg-background p-5 text-left">
                  <div className="text-sm font-medium text-muted-foreground">{p.name}</div>
                  <div className="mt-1 font-serif text-2xl font-semibold">{p.price}</div>
                  <ul className="mt-3 space-y-1 text-sm text-foreground">
                    {p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-gold">•</span>{f}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Receipts does not provide legal advice. Nothing in this product creates an attorney-client relationship.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Receipts. Your record, your rights.
      </footer>
    </div>
  );
}
