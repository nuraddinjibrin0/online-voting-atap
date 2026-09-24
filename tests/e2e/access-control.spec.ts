import { expect, test } from "@playwright/test";

import { backend, cleanupTestData, grantAdmin } from "./support/backend";
import { gotoHydrated, registerVoter } from "./support/flows";

test.afterAll(async () => {
  await cleanupTestData();
});

test("signed-out visitors are sent to the login page for protected routes", async ({ page }) => {
  for (const route of ["/dashboard", "/admin", "/admin/candidates", "/admin/audit"]) {
    await gotoHydrated(page, route);
    await expect(page, `${route} should require signing in`).toHaveURL(/\/login/, {
      timeout: 30_000,
    });
  }
});

test("a voter has no administration link and cannot open the admin area", async ({ page }) => {
  await registerVoter(page, "rbac");

  await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);

  await gotoHydrated(page, "/admin");
  await expect(page.getByText("Administrator access only")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to voting" })).toBeVisible();
});

test("database rules block a voter from reading other voters' data", async ({ page }) => {
  const voter = await registerVoter(page, "rls");
  const other = await registerVoter(page, "rls-other");

  const result = await page.evaluate(async () => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    const profiles = await supabase.from("profiles").select("id, email");
    const logs = await supabase.from("audit_logs").select("id");
    const roleWrite = await supabase
      .from("user_roles")
      .insert({ user_id: (await supabase.auth.getUser()).data.user!.id, role: "admin" });
    return {
      profileIds: (profiles.data ?? []).map((p: { id: string }) => p.id),
      auditCount: (logs.data ?? []).length,
      roleWriteBlocked: Boolean(roleWrite.error),
    };
  });

  // The signed-in voter is the second registration, so only that row is visible.
  expect(result.profileIds).toEqual([other.id]);
  expect(result.profileIds).not.toContain(voter.id);
  expect(result.auditCount).toBe(0);
  expect(result.roleWriteBlocked, "a voter must not be able to grant itself admin").toBe(true);
});

test("an administrator sees the admin area and its management tabs", async ({ page }) => {
  const admin = await registerVoter(page, "admin-access");
  await grantAdmin(admin.id);

  await gotoHydrated(page, "/admin");
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  for (const tab of ["Overview", "Candidates", "Elections", "Voters", "Audit logs"]) {
    await expect(page.getByRole("link", { name: tab })).toBeVisible();
  }

  const { error } = await backend.from("user_roles").select("id").eq("user_id", admin.id).limit(1);
  expect(error).toBeNull();
});
