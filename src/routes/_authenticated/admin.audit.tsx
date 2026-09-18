import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/voting";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit logs — Online Voting System" },
      {
        name: "description",
        content: "Security trail of logins, registrations, candidate changes and vote submissions.",
      },
      { property: "og:title", content: "Audit logs — Online Voting System" },
      {
        property: "og:description",
        content: "Security trail of logins, registrations, candidate changes and vote submissions.",
      },
    ],
  }),
  component: AuditLogs,
});

function prettyAction(action: string) {
  return action
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function AuditLogs() {
  const logs = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const [{ data: rows, error }, { data: profiles }] = await Promise.all([
        supabase
          .from("audit_logs")
          .select("id, user_id, action, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("profiles").select("id, full_name, voter_id"),
      ]);
      if (error) throw error;
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (rows ?? []).map((row) => ({
        ...row,
        who: row.user_id ? byId.get(row.user_id) : undefined,
      }));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit logs</CardTitle>
        <CardDescription>
          The 200 most recent security events. Vote submissions are recorded without the candidate
          chosen, so ballots stay secret.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : logs.data && logs.data.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.data.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">{prettyAction(log.action)}</TableCell>
                    <TableCell>
                      {log.who ? `${log.who.full_name} (${log.who.voter_id})` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
