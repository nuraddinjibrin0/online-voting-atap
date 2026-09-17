import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ListChecks, Users, Vote } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { electionsQuery, formatDateTime, isLiveNow, statusLabel } from "@/lib/voting";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin overview — Online Voting System" },
      { name: "description", content: "Totals for voters, candidates, votes and election status." },
      { property: "og:title", content: "Admin overview — Online Voting System" },
      {
        property: "og:description",
        content: "Totals for voters, candidates, votes and election status.",
      },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [voters, candidates, votes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("candidates").select("id", { count: "exact", head: true }),
        supabase.from("votes").select("id", { count: "exact", head: true }),
      ]);
      return {
        voters: voters.count ?? 0,
        candidates: candidates.count ?? 0,
        votes: votes.count ?? 0,
      };
    },
  });

  const elections = useQuery(electionsQuery);
  const tally = useQuery({
    queryKey: ["tally"],
    queryFn: async () => {
      const [{ data: votes, error }, { data: candidates }] = await Promise.all([
        supabase.from("votes").select("candidate_id"),
        supabase.from("candidates").select("id, full_name, position"),
      ]);
      if (error) throw error;
      const counts = new Map<string, number>();
      (votes ?? []).forEach((v) => counts.set(v.candidate_id, (counts.get(v.candidate_id) ?? 0) + 1));
      return (candidates ?? [])
        .map((c) => ({ ...c, votes: counts.get(c.id) ?? 0 }))
        .sort((a, b) => b.votes - a.votes);
    },
  });

  const current = elections.data?.find((e) => isLiveNow(e)) ?? elections.data?.[0] ?? null;

  if (stats.isPending || elections.isPending) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total voters" value={stats.data?.voters ?? 0} />
        <StatCard icon={ListChecks} label="Total candidates" value={stats.data?.candidates ?? 0} />
        <StatCard icon={Vote} label="Total votes cast" value={stats.data?.votes ?? 0} />
        <StatCard
          icon={CalendarClock}
          label="Elections"
          value={elections.data?.length ?? 0}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{current ? current.title : "No election created"}</CardTitle>
              <CardDescription>
                {current
                  ? `${formatDateTime(current.start_time)} → ${formatDateTime(current.end_time)}`
                  : "Create an election to start collecting votes."}
              </CardDescription>
            </div>
            {current ? (
              <Badge variant={isLiveNow(current) ? "default" : "secondary"}>
                {statusLabel(current)}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results so far</CardTitle>
          <CardDescription>
            Vote counts only. Individual ballots are never linked to a voter here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tally.data && tally.data.length > 0 ? (
            <ul className="grid gap-3">
              {tally.data.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-4 text-sm">
                  <span>
                    <span className="font-medium">{row.full_name}</span>
                    <span className="text-muted-foreground"> · {row.position}</span>
                  </span>
                  <span className="font-semibold">{row.votes}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No candidates yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
