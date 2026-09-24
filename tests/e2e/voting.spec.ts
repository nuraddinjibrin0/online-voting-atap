import { expect, test } from "@playwright/test";

import {
  auditActionsFor,
  cleanupTestData,
  closeOtherTestElections,
  createCandidate,
  createElection,
  setElectionStatus,
  uniqueSuffix,
  votesFor,
} from "./support/backend";
import { candidateCard, registerVoter, voteFor } from "./support/flows";

test.afterAll(async () => {
  await cleanupTestData();
});

test("a voter can cast exactly one vote in an open election", async ({ page }) => {
  const suffix = uniqueSuffix();
  const election = await createElection({ title: `E2E Open Election ${suffix}`, status: "open" });
  const candidate = await createCandidate({
    fullName: `E2E Candidate ${suffix}`,
    position: `E2E Position ${suffix}`,
    manifesto: "Fair elections for everyone.",
  });

  const voter = await registerVoter(page, "vote");

  await expect(page.getByText(election.title)).toBeVisible();
  const card = candidateCard(page, candidate.full_name);
  await expect(card).toContainText(candidate.position);
  await expect(card).toContainText("Fair elections for everyone.");

  await voteFor(page, candidate.full_name);

  await expect(page.getByText("Your vote has been submitted")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Vote submitted")).toBeVisible();

  // The vote button is disabled everywhere after voting.
  const voted = page.getByRole("button", { name: "You have voted" });
  await expect(voted.first()).toBeDisabled();

  const rows = await votesFor(election.id);
  const mine = rows.filter((r) => r.voter_id === voter.id);
  expect(mine).toHaveLength(1);
  expect(mine[0]!.candidate_id).toBe(candidate.id);

  // Voting status survives a reload.
  await page.reload({ waitUntil: "load" });
  await expect(page.getByText("Your vote has been submitted")).toBeVisible({ timeout: 30_000 });
});

test("the database refuses a second vote from the same voter", async ({ page }) => {
  const suffix = uniqueSuffix();
  const election = await createElection({ title: `E2E One Vote ${suffix}`, status: "open" });
  const first = await createCandidate({
    fullName: `E2E First ${suffix}`,
    position: `E2E Chair ${suffix}`,
  });
  const second = await createCandidate({
    fullName: `E2E Second ${suffix}`,
    position: `E2E Chair ${suffix}`,
  });

  const voter = await registerVoter(page, "onevote");
  await voteFor(page, first.full_name);
  await expect(page.getByText("Your vote has been submitted")).toBeVisible({ timeout: 30_000 });

  // Bypass the UI entirely: the attempt must still be rejected server-side.
  const outcome = await page.evaluate(
    async ([electionId, candidateId]) => {
      const { supabase } = await import("/src/integrations/supabase/client.ts");
      const userId = (await supabase.auth.getUser()).data.user!.id;
      const { error } = await supabase
        .from("votes")
        .insert({ election_id: electionId, voter_id: userId, candidate_id: candidateId });
      return { blocked: Boolean(error), message: error?.message ?? "" };
    },
    [election.id, second.id] as const,
  );

  expect(outcome.blocked, "a duplicate vote must be rejected by the database").toBe(true);
  expect(outcome.message.toLowerCase()).toMatch(/already voted|duplicate|row-level/);

  const rows = await votesFor(election.id);
  expect(rows.filter((r) => r.voter_id === voter.id)).toHaveLength(1);
});

test("voting is impossible when the election is not open", async ({ page }) => {
  const suffix = uniqueSuffix();
  const election = await createElection({ title: `E2E Draft Election ${suffix}`, status: "draft" });
  const candidate = await createCandidate({
    fullName: `E2E Draft Candidate ${suffix}`,
    position: `E2E Secretary ${suffix}`,
  });

  await closeOtherTestElections(election.id);
  await registerVoter(page, "draft");

  // The dashboard never offers a draft election for voting.
  await expect(page.getByText("Open for voting")).toHaveCount(0);
  await expect(
    candidateCard(page, candidate.full_name).getByRole("button", { name: "Vote", exact: true }),
  ).toHaveCount(0);

  const outcome = await page.evaluate(
    async ([electionId, candidateId]) => {
      const { supabase } = await import("/src/integrations/supabase/client.ts");
      const userId = (await supabase.auth.getUser()).data.user!.id;
      const { error } = await supabase
        .from("votes")
        .insert({ election_id: electionId, voter_id: userId, candidate_id: candidateId });
      return { blocked: Boolean(error), message: error?.message ?? "" };
    },
    [election.id, candidate.id] as const,
  );
  expect(outcome.blocked, "a draft election must not accept votes").toBe(true);

  await setElectionStatus(election.id, "closed");
  const closedOutcome = await page.evaluate(
    async ([electionId, candidateId]) => {
      const { supabase } = await import("/src/integrations/supabase/client.ts");
      const userId = (await supabase.auth.getUser()).data.user!.id;
      const { error } = await supabase
        .from("votes")
        .insert({ election_id: electionId, voter_id: userId, candidate_id: candidateId });
      return { blocked: Boolean(error) };
    },
    [election.id, candidate.id] as const,
  );
  expect(closedOutcome.blocked, "a closed election must not accept votes").toBe(true);
});

test("a submitted vote cannot be changed or deleted, and the audit log keeps the choice secret", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const election = await createElection({ title: `E2E Immutable ${suffix}`, status: "open" });
  const candidate = await createCandidate({
    fullName: `E2E Immutable Candidate ${suffix}`,
    position: `E2E Treasurer ${suffix}`,
  });
  const other = await createCandidate({
    fullName: `E2E Other Candidate ${suffix}`,
    position: `E2E Treasurer ${suffix}`,
  });

  const voter = await registerVoter(page, "immutable");
  await voteFor(page, candidate.full_name);
  await expect(page.getByText("Your vote has been submitted")).toBeVisible({ timeout: 30_000 });

  const tamper = await page.evaluate(
    async ([electionId, otherCandidateId]) => {
      const { supabase } = await import("/src/integrations/supabase/client.ts");
      const userId = (await supabase.auth.getUser()).data.user!.id;
      const update = await supabase
        .from("votes")
        .update({ candidate_id: otherCandidateId })
        .eq("election_id", electionId)
        .eq("voter_id", userId)
        .select("id");
      const del = await supabase
        .from("votes")
        .delete()
        .eq("election_id", electionId)
        .eq("voter_id", userId)
        .select("id");
      return {
        updatedRows: (update.data ?? []).length,
        deletedRows: (del.data ?? []).length,
      };
    },
    [election.id, other.id] as const,
  );

  expect(tamper.updatedRows).toBe(0);
  expect(tamper.deletedRows).toBe(0);

  const rows = await votesFor(election.id);
  const mine = rows.filter((r) => r.voter_id === voter.id);
  expect(mine).toHaveLength(1);
  expect(mine[0]!.candidate_id).toBe(candidate.id);

  const actions = await auditActionsFor(voter.id);
  expect(actions).toContain("VOTE_SUBMITTED");
  for (const action of actions) {
    expect(action).not.toContain(candidate.id);
    expect(action.toLowerCase()).not.toContain(candidate.full_name.toLowerCase());
  }
});
