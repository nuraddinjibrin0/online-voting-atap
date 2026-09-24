import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy, Globe, ListChecks, ShieldCheck, UserCog, Vote } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { sessionQuery } from "@/lib/voting";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Online Voting System — Secure Electronic Ballot" },
      {
        name: "description",
        content:
          "Register as a voter, review candidate manifestos and cast a single verified vote in open elections.",
      },
      { property: "og:title", content: "Online Voting System — Secure Electronic Ballot" },
      {
        property: "og:description",
        content:
          "Register as a voter, review candidate manifestos and cast a single verified vote in open elections.",
      },
    ],
  }),
  component: Home,
});

const features = [
  {
    icon: ShieldCheck,
    title: "One person, one vote",
    body: "Duplicate ballots are blocked by the database itself, not just the screen.",
  },
  {
    icon: ListChecks,
    title: "Informed choices",
    body: "Every candidate has a photo, a position and a manifesto before you decide.",
  },
  {
    icon: CheckCircle2,
    title: "Full audit trail",
    body: "Logins, registrations and submissions are recorded — never who you voted for.",
  },
];

function Home() {
  const { data: session, isPending } = useQuery(sessionQuery);

  return (
    <AppShell>
      <section className="grid gap-10 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-accent">
            Electronic ballot
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">
            A secure, simple way to run an election online.
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Voters register, sign in and cast a single ballot while it is open. Administrators
            manage candidates, control the election window and review the audit trail.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {isPending ? null : session ? (
              <Button size="lg" asChild>
                <Link to="/dashboard">Go to my dashboard</Link>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild>
                  <Link to="/register">Register to vote</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/login">I already have an account</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          {features.map((f) => (
            <Card key={f.title} className="border-border shadow-[var(--shadow-card)]">
              <CardContent className="flex gap-4 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <f.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold">{f.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
