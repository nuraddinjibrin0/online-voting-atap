import { expect, type Page } from "@playwright/test";

import { findUserIdByEmail, newVoterDetails, trackUser, type TestUser } from "./backend";

/**
 * Opens a page and waits until React has taken over the markup. Without this the
 * dev server can serve server-rendered HTML whose form submits natively.
 */
export async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(
    () => document.querySelector("#app, [data-hydrated], body")?.childElementCount !== 0,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1_500);
}

/** Registers a brand new voter through the real registration form. */
export async function registerVoter(page: Page, label = "voter"): Promise<TestUser> {
  const details = newVoterDetails(label);

  await gotoHydrated(page, "/register");
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
  await gotoHydrated(page, "/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
}

/** Returns the candidate card that contains the given candidate name. */
export function candidateCard(page: Page, candidateName: string) {
  return page.locator("div.grid > div").filter({ hasText: candidateName });
}

/** Clicks Vote on a candidate card and confirms the dialog. */
export async function voteFor(page: Page, candidateName: string) {
  const card = candidateCard(page, candidateName);
  await card.getByRole("button", { name: "Vote", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Confirm your vote");
  await page.getByRole("button", { name: "Confirm vote" }).click();
}
