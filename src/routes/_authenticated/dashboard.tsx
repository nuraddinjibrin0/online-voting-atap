import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { CandidatePhoto } from "@/components/CandidatePhoto";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  candidatesQuery,
  electionsQuery,
  formatDateTime,
  friendlyError,
  isLiveNow,
  logAudit,
  sessionQuery,
  statusLabel,
  type Candidate,
} from "@/lib/voting";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Voter dashboard — Online Voting System" },
      { name: "description", content: "View the current election, candidates and cast your vote." },
      { property: "og:title", content: "Voter dashboard — Online Voting System" },
      {
        property: "og:description",
        content: "View the current election, candidates and cast your vote.",
      },
    ],
  }),
  component: VoterDashboard,
});

function VoterDashboard() {
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQuery);
  const elections = useQuery(electionsQuery);
  const candidates = useQuery(candidatesQuery);
  const [pending, setPending] = useState<Candidate | null>(null);

  const myVotes = useQuery({
    queryKey: ["my-votes", session?.userId],
    enabled: Boolean(session?.userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("votes")
        .select("id, election_id, candidate_id, created_at")
        .eq("voter_id", session!.userId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const adminExists = useQuery({
    queryKey: ["admin-exists"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_exists");
      if (error) throw error;
      return Boolean(data);
    },
  });

  const activeElection =
    elections.data?.find((e) => isLiveNow(e)) ??
    elections.data?.find((e) => e.status === "open") ??
    elections.data?.[0] ??
    null;

  const myVote = activeElection
    ? myVotes.data?.find((v) => v.election_id === activeElection.id)
    : undefined;

  const castVote = useMutation({
    mutationFn: async (candidate: Candidate) => {
      if (!activeElection || !session) throw new Error("No election available.");
      const { error } = await supabase.from("votes").insert({
        election_id: activeElection.id,
        voter_id: session.userId,
        candidate_id: candidate.id,
      });
      if (error) throw error;
      await logAudit("VOTE_SUBMITTED", session.userId);
    },
    onSuccess: () => {
      toast.success("Your vote has been recorded. Thank you for voting!");
      queryClient.invalidateQueries({ queryKey: ["my-votes"] });
      setPending(null);
    },
    onError: (error) => {
      toast.error(friendlyError(error, "Your vote could not be recorded."));
      queryClient.invalidateQueries({ queryKey: ["my-votes"] });
      setPending(null);
    },
  });

  const claimAdmin = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_first_admin");
      if (error) throw error;
      return Boolean(data);
    },
    onSuccess: async (granted) => {
      await queryClient.invalidateQueries();
      toast[granted ? "success" : "error"](
        granted ? "You are now the administrator." : "An administrator already exists.",
      );
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const canVote = Boolean(activeElection && isLiveNow(activeElection) && !myVote && session?.isVoter);
  const loading = elections.isPending || candidates.isPending || myVotes.isPending;

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-3xl font-bold">
            Welcome, {session?.profile?.full_name ?? "voter"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Review the candidates carefully — you can only vote once per election.
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <InfoCard label="Voter ID" value={session?.profile?.voter_id ?? "—"} />
          <InfoCard label="Email" value={session?.email ?? "—"} />
          <InfoCard
            label="Your voting status"
            value={myVote ? "Vote submitted" : canVote ? "Not yet voted" : "Voting unavailable"}
          />
        </div>

        {adminExists.data === false ? (
          <Card className="border-warning/50 bg-warning/10">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="font-semibold">No administrator has been set up yet</p>
                <p className="text-sm text-muted-foreground">
                  The first person to claim it becomes the administrator. This option then disappears.
                </p>
              </div>
              <Button onClick={() => claimAdmin.mutate()} disabled={claimAdmin.isPending}>
                {claimAdmin.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Claim admin access
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{activeElection ? activeElection.title : "No election yet"}</CardTitle>
                <CardDescription>
                  {activeElection
                    ? (activeElection.description ??
                      "Cast your ballot before the election closes.")
                    : "An administrator has not created an election yet."}
                </CardDescription>
              </div>
              {activeElection ? (
                <Badge variant={isLiveNow(activeElection) ? "default" : "secondary"}>
                  {statusLabel(activeElection)}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          {activeElection ? (
            <CardContent className="flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4" aria-hidden="true" />
                Opens {formatDateTime(activeElection.start_time)}
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4" aria-hidden="true" />
                Closes {formatDateTime(activeElection.end_time)}
              </span>
            </CardContent>
          ) : null}
        </Card>

        {myVote ? (
          <Card className="border-success/40 bg-success/10">
            <CardContent className="flex items-center gap-3 p-5">
              <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
              <div>
                <p className="font-semibold">Your vote has been submitted</p>
                <p className="text-sm text-muted-foreground">
                  Recorded {formatDateTime(myVote.created_at)}. Voting is now closed for you in this
                  election, and your choice stays private.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <section>
          <h2 className="mb-4 text-xl font-semibold">Candidates</h2>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64 w-full rounded-xl" />
              ))}
            </div>
          ) : candidates.data && candidates.data.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {candidates.data.map((candidate) => (
                <Card key={candidate.id} className="flex flex-col shadow-[var(--shadow-card)]">
                  <CardHeader className="flex-row items-center gap-4">
                    <CandidatePhoto
                      path={candidate.photo_url}
                      name={candidate.full_name}
                      className="h-16 w-16 shrink-0"
                    />
                    <div>
                      <CardTitle className="text-base">{candidate.full_name}</CardTitle>
                      <CardDescription>{candidate.position}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <p className="flex-1 whitespace-pre-line text-sm text-muted-foreground">
                      {candidate.manifesto?.trim() || "No manifesto provided."}
                    </p>
                    <Button
                      className="mt-4"
                      disabled={!canVote || castVote.isPending}
                      onClick={() => setPending(candidate)}
                    >
                      {myVote ? "You have voted" : canVote ? "Vote" : "Voting closed"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState message="No candidates have been added yet. Please check back later." />
          )}
        </section>

        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Your ballot is protected by database rules — one vote per voter per election, and your
          candidate choice is never written to the audit trail.
        </p>
      </div>

      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your vote</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to vote for <strong>{pending?.full_name}</strong> as{" "}
              {pending?.position}. This cannot be undone or changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pending) castVote.mutate(pending);
              }}
              disabled={castVote.isPending}
            >
              {castVote.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm vote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 truncate font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-10 text-center text-sm text-muted-foreground">{message}</CardContent>
    </Card>
  );
}
