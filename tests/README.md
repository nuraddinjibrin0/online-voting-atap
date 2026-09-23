# End-to-end tests

These tests drive the real application in a real browser against the real backend.
No mock data is used: accounts are created through the registration form, votes go
through the database rules, and every row created by a test is deleted afterwards.

## Running

```bash
bun run test:e2e            # all suites
bun run test:e2e -- voting  # one suite
```

Requirements:

- the app running locally (default `http://localhost:8080`, override with `E2E_BASE_URL`)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment — used **only** by
  the test harness (`tests/e2e/support/backend.ts`) to seed data, promote a test account
  to administrator, verify database rows and clean up. Never used by the app itself.
- `PLAYWRIGHT_CHROMIUM_PATH` if Chromium is installed outside Playwright's cache.

## What is covered

| Suite | Covers |
| --- | --- |
| `auth.spec.ts` | registration (profile + voter ID created), form validation, login, logout, wrong password, `REGISTRATION`/`LOGIN`/`LOGOUT` audit entries |
| `access-control.spec.ts` | protected routes redirect signed-out visitors, voters have no admin access, database rules hide other voters' profiles and audit rows, voters cannot grant themselves admin, administrators see the admin area |
| `voting.spec.ts` | viewing the open election and candidates, casting one vote, confirmation dialog and message, interface locked after voting, duplicate vote rejected server-side, draft/closed elections reject votes, votes cannot be edited or deleted, audit log never stores the candidate chosen |
| `admin.spec.ts` | candidate add/edit/delete with photo upload, election create/open/close with validation, overview totals and results, voter list with grant/revoke administrator, audit log page |

Tests run serially with a single worker because they share one database.
