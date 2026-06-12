import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Home, Briefcase, Users, FileText } from "lucide-react";

export const Route = createFileRoute("/get-started")({
  head: () => ({
    meta: [
      { title: "Get started — Receipts" },
      {
        name: "description",
        content:
          "Pick the kind of dispute you're dealing with and create your free Receipts account.",
      },
    ],
  }),
  component: GetStarted,
});

const modules = [
  {
    key: "landlord_tenant",
    icon: Home,
    title: "Landlord / Tenant",
    body: "Disputes with your landlord or property manager.",
  },
  {
    key: "employer_employee",
    icon: Briefcase,
    title: "Employer / Employee",
    body: "Workplace issues, wages, discrimination, wrongful termination.",
  },
  {
    key: "other_general",
    icon: Users,
    title: "Other / General",
    body: "Contractors, neighbors, HOA, personal agreements, consumer disputes.",
  },
];

function GetStarted() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold tracking-tight">
              Pull Up Receipts
            </span>
          </Link>
          <Link to="/auth">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">
            What kind of situation are you in?
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Pick the one that fits best. You can change or add more later.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.key}
                to="/auth"
                search={{ mode: "signup", module: m.key }}
                className="group rounded-xl border border-border bg-card p-6 text-left transition hover:border-accent hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary group-hover:bg-accent/10">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">{m.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{m.body}</p>
              </Link>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link to="/auth" search={{ mode: "signup" }}>
            <Button
              size="lg"
              className="h-12 bg-primary px-8 text-base text-primary-foreground hover:bg-primary/90"
            >
              Create Your Free Account
            </Button>
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            No credit card required.
          </p>
        </div>
      </main>
    </div>
  );
}
