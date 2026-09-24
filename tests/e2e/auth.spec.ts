import { expect, test } from "@playwright/test";

import { auditActionsFor, cleanupTestData } from "./support/backend";
import { gotoHydrated, login, registerVoter, signOut } from "./support/flows";

test.afterAll(async () => {
  await cleanupTestData();
});

test("a new voter can register, is given a profile, and lands on the voter dashboard", async ({
  page,
}) => {
  const voter = await registerVoter(page, "register");

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(voter.fullName);
  await expect(page.getByText(voter.voterId)).toBeVisible();
  await expect(page.getByText(voter.email)).toBeVisible();

  expect(await auditActionsFor(voter.id)).toContain("REGISTRATION");
});

test("registration rejects invalid input before touching the backend", async ({ page }) => {
  await gotoHydrated(page, "/register");
  await page.getByLabel("Full name").fill("A");
  await page.getByRole("button", { name: "Create my voter account" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter your full name.");

  await page.getByLabel("Full name").fill("Valid Test Name");
  await page.getByLabel("Voter ID").fill("ab");
  await page.getByRole("button", { name: "Create my voter account" }).click();
  await expect(page.getByRole("alert")).toContainText("Voter ID must be");

  await page.getByLabel("Voter ID").fill("E2E-VALID-1");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Create my voter account" }).click();
  await expect(page.getByRole("alert")).toContainText("valid email");

  await page.getByLabel("Email").fill("e2e-validation@example.com");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("short");
  await page.getByRole("button", { name: "Create my voter account" }).click();
  await expect(page.getByRole("alert")).toContainText("at least 8 characters");

  await page.getByLabel("Password", { exact: true }).fill("Long-Enough-123");
  await page.getByLabel("Confirm password").fill("Different-123");
  await page.getByRole("button", { name: "Create my voter account" }).click();
  await expect(page.getByRole("alert")).toContainText("do not match");

  await expect(page).toHaveURL(/\/register/);
});

test("login, logout and login again are recorded in the audit trail", async ({ page }) => {
  const voter = await registerVoter(page, "login");

  await signOut(page);
  await login(page, voter);
  await expect(page).toHaveURL(/\/dashboard/);

  const actions = await auditActionsFor(voter.id);
  expect(actions).toContain("LOGIN");
  expect(actions).toContain("LOGOUT");
});

test("wrong credentials are refused with a clear message", async ({ page }) => {
  const voter = await registerVoter(page, "badpass");
  await signOut(page);

  await gotoHydrated(page, "/login");
  await page.getByLabel("Email").fill(voter.email);
  await page.getByLabel("Password").fill("Totally-Wrong-123");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("alert")).toContainText("Incorrect email or password.");
  await expect(page).toHaveURL(/\/login/);
});
