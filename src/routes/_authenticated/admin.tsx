import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionQuery } from "@/lib/voting";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const tabs: { to: string; label: string; exact: boolean }[] = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/candidates", label: "Candidates", exact: false },
  { to: "/admin/elections", label: "Elections", exact: false },
  { to: "/admin/voters", label: "Voters", exact: false },
  { to: "/admin/audit", label: "Audit logs", exact: false },
];

function AdminLayout() {
  const { data: session, isPending } = useQuery(sessionQuery);

  if (isPending) {
    return (
      <AppShell>
        <Skeleton className="h-64 w-full rounded-xl" />
      </AppShell>
    );
  }

  if (!session?.isAdmin) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-xl font-semibold">Administrator access only</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account does not have administrator permissions.
            </p>
            <Button className="mt-6" asChild>
              <Link to="/dashboard">Back to voting</Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-bold">Administration</h1>
          <p className="mt-1 text-muted-foreground">
            Manage candidates, elections, voters and review the audit trail.
          </p>
        </div>

        <nav className="flex flex-wrap gap-2 rounded-xl bg-secondary p-1.5">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: tab.exact ?? false }}
              className="rounded-lg px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:bg-card"
              activeProps={{ className: "bg-card font-medium shadow-sm" }}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <Outlet />
      </div>
    </AppShell>
  );
}
