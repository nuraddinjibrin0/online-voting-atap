import { expect, type Page } from "@playwright/test";

import { findUserIdByEmail, newVoterDetails, trackUser, type TestUser } from "./backend";

/** Registers a brand new voter through the real registration form. */
export async function registerVoter(page: Page, label = "voter"): Promise<TestUser> {
  const details = newVoterDetails(label);

  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Full name").fill(details.fullName);
  await page.getByLabel("Voter ID").fill(details.voterId);
  await page.getByLabel("Email").fill(details.email);
  await page.getByLabel("Password", { exact: true }).fill(details.password);
  await page.getByLabel("Confirm password").fill(details.password);
  await page.getByRole("button", { name: "Create my voter account" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome", {
    timeout: 30_000,
  });

  const id = await findUserIdByEmail(details.email);
  expect(id, "the registration should create a profile row").toBeTruthy();
  trackUser(id!);
  return { ...details, id: id! };
}

export async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
}

/** Clicks Vote on a candidate card and confirms the dialog. */
export async function voteFor(page: Page, candidateName: string) {
  const card = page.locator("div", { has: page.getByText(candidateName, { exact: true }) });
  await page
    .getByRole("button", { name: "Vote", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alertdialog")).toContainText("Confirm your vote");
  await page.getByRole("button", { name: "Confirm vote" }).click();
  return card;
}
