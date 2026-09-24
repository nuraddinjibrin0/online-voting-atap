import { expect, test } from "@playwright/test";

import {
  auditActionsFor,
  backend,
  cleanupTestData,
  createCandidate,
  createElection,
  grantAdmin,
  trackCandidateByName,
  trackElectionByTitle,
  uniqueSuffix,
  votesFor,
} from "./support/backend";
import { gotoHydrated, registerVoter, voteFor } from "./support/flows";

test.afterAll(async () => {
  await cleanupTestData();
});

test("an administrator can add, edit and delete a candidate with a photo", async ({ page }) => {
  const suffix = uniqueSuffix();
  const admin = await registerVoter(page, "admin-candidates");
  await grantAdmin(admin.id);

  await gotoHydrated(page, "/admin/candidates");
  await expect(page.getByRole("button", { name: "Add candidate" })).toBeVisible();

  // Create — with validation first.
  await page.getByRole("button", { name: "Add candidate" }).click();
  await page.getByRole("button", { name: "Save candidate" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter the candidate's full name.");

  const name = `E2E Managed ${suffix}`;
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Position").fill(`E2E President ${suffix}`);
  await page.getByLabel("Manifesto").fill("Transparent student governance.");
  await page.setInputFiles("#photo", "tests/e2e/support/photo.png");
  await page.getByRole("button", { name: "Save candidate" }).click();

  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible({ timeout: 30_000 });
  const candidateId = await trackCandidateByName(name);
  expect(candidateId).toBeTruthy();

  const { data: created } = await backend
    .from("candidates")
    .select("full_name, position, manifesto, photo_url")
    .eq("id", candidateId!)
    .single();
  expect(created!.manifesto).toBe("Transparent student governance.");
  expect(created!.photo_url).toContain("candidates/");

  // Edit.
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  await page.getByLabel("Position").fill(`E2E Vice President ${suffix}`);
  await page.getByRole("button", { name: "Save candidate" }).click();
  await expect(page.getByText(`E2E Vice President ${suffix}`)).toBeVisible({ timeout: 30_000 });

  // Delete.
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0, {
    timeout: 30_000,
  });

  // The candidate row is gone; confirm the database no longer holds it.
  await expect
    .poll(async () => {
      const { data } = await backend.from("candidates").select("id").eq("id", candidateId!);
      return (data ?? []).length;
    }, { timeout: 30_000 })
    .toBe(0);

  await expect
    .poll(() => auditActionsFor(admin.id), { timeout: 30_000 })
    .toEqual(
      expect.arrayContaining(["CANDIDATE_CREATED", "CANDIDATE_UPDATED", "CANDIDATE_DELETED"]),
    );
});

test("an administrator can create an election and open and close voting", async ({ page }) => {
  const suffix = uniqueSuffix();
  const admin = await registerVoter(page, "admin-elections");
  await grantAdmin(admin.id);

  await gotoHydrated(page, "/admin/elections");
  await page.getByRole("button", { name: "Create election" }).click();

  // Validation: end before start.
  const title = `E2E Managed Election ${suffix}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Starts").fill("2026-10-01T09:00");
  await page.getByLabel("Ends").fill("2026-09-01T09:00");
  await page.getByRole("button", { name: "Save election" }).click();
  await expect(page.getByRole("alert")).toContainText("end time must be after the start time");

  await page.getByLabel("Ends").fill("2026-10-02T09:00");
  await page.getByRole("button", { name: "Save election" }).click();

  const row = page.getByRole("row", { name: new RegExp(title) });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("Not started");

  const electionId = await trackElectionByTitle(title);
  expect(electionId).toBeTruthy();

  await row.getByRole("button", { name: "Open" }).click();
  await expect(row.getByRole("button", { name: "Close" })).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Close" }).click();
  await expect(row).toContainText("Closed", { timeout: 30_000 });

  const actions = await auditActionsFor(admin.id);
  expect(actions).toContain("ELECTION_CREATED");
  expect(actions).toContain("ELECTION_STATUS_OPEN");
  expect(actions).toContain("ELECTION_STATUS_CLOSED");
});

test("the overview totals and results reflect real votes", async ({ page }) => {
  const suffix = uniqueSuffix();
  const election = await createElection({ title: `E2E Stats Election ${suffix}`, status: "open" });
  const candidate = await createCandidate({
    fullName: `E2E Stats Candidate ${suffix}`,
    position: `E2E Stats Role ${suffix}`,
  });

  const voter = await registerVoter(page, "stats-voter");
  await voteFor(page, candidate.full_name);
  await expect(page.getByText("Your vote has been submitted")).toBeVisible({ timeout: 30_000 });
  expect(await votesFor(election.id)).toHaveLength(1);

  await grantAdmin(voter.id);
  await gotoHydrated(page, "/admin");

  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  await expect(page.getByText(candidate.full_name)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(election.title).first()).toBeVisible();
});

test("an administrator can review voters and grant or revoke administrator rights", async ({
  page,
}) => {
  // Register the target voter first: the last registration owns the browser session.
  const voter = await registerVoter(page, "target-voter");
  const admin = await registerVoter(page, "admin-voters");
  await grantAdmin(admin.id);

  await gotoHydrated(page, "/admin/voters");
  const row = page.getByRole("row", { name: new RegExp(voter.voterId) });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(voter.email);
  await expect(row).toContainText("Voter");

  await row.getByRole("button", { name: "Make admin" }).click();
  await expect(row).toContainText("Administrator", { timeout: 30_000 });

  const granted = await backend
    .from("user_roles")
    .select("role")
    .eq("user_id", voter.id)
    .eq("role", "admin");
  expect(granted.data ?? []).toHaveLength(1);

  await row.getByRole("button", { name: "Revoke admin" }).click();
  await expect(row.getByRole("button", { name: "Make admin" })).toBeVisible({ timeout: 30_000 });

  const revoked = await backend
    .from("user_roles")
    .select("role")
    .eq("user_id", voter.id)
    .eq("role", "admin");
  expect(revoked.data ?? []).toHaveLength(0);

  // An administrator cannot remove their own administrator rights.
  const ownRow = page.getByRole("row", { name: new RegExp(admin.voterId) });
  await expect(ownRow.getByRole("button", { name: "Revoke admin" })).toBeDisabled();
});

test("the audit log shows activity without revealing any candidate choice", async ({ page }) => {
  const suffix = uniqueSuffix();
  await createElection({ title: `E2E Audit Election ${suffix}`, status: "open" });
  const candidate = await createCandidate({
    fullName: `E2E Audit Candidate ${suffix}`,
    position: `E2E Audit Role ${suffix}`,
  });

  const voter = await registerVoter(page, "audit-voter");
  await voteFor(page, candidate.full_name);
  await expect(page.getByText("Your vote has been submitted")).toBeVisible({ timeout: 30_000 });

  await grantAdmin(voter.id);
  await gotoHydrated(page, "/admin/audit");

  await expect(page.getByText("Audit logs", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Vote submitted").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Registration").first()).toBeVisible();
  await expect(page.getByText(candidate.full_name)).toHaveCount(0);

  const { data: rows } = await backend.from("audit_logs").select("action").limit(200);
  for (const row of rows ?? []) {
    expect(row.action).not.toContain(candidate.id);
    expect(row.action.toLowerCase()).not.toContain("candidate_chosen");
  }
});
