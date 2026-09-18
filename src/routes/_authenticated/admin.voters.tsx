import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, friendlyError, logAudit, sessionQuery, type Profile } from "@/lib/voting";

export const Route = createFileRoute("/_authenticated/admin/voters")({
  head: () => ({
    meta: [
      { title: "Manage voters — Online Voting System" },
      { name: "description", content: "Registered voters, their voter IDs and roles." },
      { property: "og:title", content: "Manage voters — Online Voting System" },
      { property: "og:description", content: "Registered voters, their voter IDs and roles." },
    ],
  }),
  component: ManageVoters,
});

function ManageVoters() {
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQuery);

  const voters = useQuery({
    queryKey: ["voters"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      const roleMap = new Map<string, string[]>();
      (roles ?? []).forEach((r) => {
        roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role as string]);
      });
      const votes = await supabase.from("votes").select("voter_id");
      const voted = new Set((votes.data ?? []).map((v) => v.voter_id));
      return ((profiles ?? []) as Profile[]).map((p) => ({
        ...p,
        roles: roleMap.get(p.id) ?? [],
        hasVoted: voted.has(p.id),
      }));
    },
  });

  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      if (makeAdmin) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
        if (error) throw error;
        await logAudit("ADMIN_ROLE_GRANTED");
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");
        if (error) throw error;
        await logAudit("ADMIN_ROLE_REVOKED");
      }
    },
    onSuccess: () => {
      toast.success("Roles updated.");
      queryClient.invalidateQueries();
    },
    onError: (err) => toast.error(friendlyError(err, "Could not update the role.")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registered voters</CardTitle>
        <CardDescription>
          Voters register themselves. Passwords are handled by the authentication service and are
          never stored here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {voters.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : voters.data && voters.data.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Voter ID</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead>Voted</TableHead>
                  <TableHead className="hidden lg:table-cell">Registered</TableHead>
                  <TableHead className="text-right">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {voters.data.map((voter) => {
                  const isAdmin = voter.roles.includes("admin");
                  const isSelf = voter.id === session?.userId;
                  return (
                    <TableRow key={voter.id}>
                      <TableCell className="font-medium">{voter.full_name}</TableCell>
                      <TableCell>{voter.voter_id}</TableCell>
                      <TableCell className="hidden md:table-cell">{voter.email}</TableCell>
                      <TableCell>
                        <Badge variant={voter.hasVoted ? "default" : "secondary"}>
                          {voter.hasVoted ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {formatDateTime(voter.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Badge variant={isAdmin ? "default" : "outline"}>
                            {isAdmin ? "Administrator" : "Voter"}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSelf || toggleAdmin.isPending}
                            onClick={() =>
                              toggleAdmin.mutate({ userId: voter.id, makeAdmin: !isAdmin })
                            }
                          >
                            {isAdmin ? "Revoke admin" : "Make admin"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No voters have registered yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
