import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  electionsQuery,
  formatDateTime,
  friendlyError,
  isLiveNow,
  logAudit,
  statusLabel,
  type Election,
} from "@/lib/voting";

export const Route = createFileRoute("/_authenticated/admin/elections")({
  head: () => ({
    meta: [
      { title: "Manage elections — Online Voting System" },
      { name: "description", content: "Create an election and open or close voting." },
      { property: "og:title", content: "Manage elections — Online Voting System" },
      { property: "og:description", content: "Create an election and open or close voting." },
    ],
  }),
  component: ManageElections,
});

function toInputValue(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ManageElections() {
  const queryClient = useQueryClient();
  const elections = useQuery(electionsQuery);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Election | null>(null);
  const [form, setForm] = useState({ title: "", description: "", start: "", end: "" });
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    const now = new Date();
    const later = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    setEditing(null);
    setForm({
      title: "",
      description: "",
      start: toInputValue(now.toISOString()),
      end: toInputValue(later.toISOString()),
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(election: Election) {
    setEditing(election);
    setForm({
      title: election.title,
      description: election.description ?? "",
      start: toInputValue(election.start_time),
      end: toInputValue(election.end_time),
    });
    setError(null);
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        start_time: new Date(form.start).toISOString(),
        end_time: new Date(form.end).toISOString(),
      };
      if (editing) {
        const { error: updateError } = await supabase
          .from("elections")
          .update(payload)
          .eq("id", editing.id);
        if (updateError) throw updateError;
        await logAudit("ELECTION_UPDATED");
      } else {
        const { error: insertError } = await supabase.from("elections").insert(payload);
        if (insertError) throw insertError;
        await logAudit("ELECTION_CREATED");
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Election updated." : "Election created.");
      queryClient.invalidateQueries();
      setOpen(false);
    },
    onError: (err) => setError(friendlyError(err, "Could not save the election.")),
  });

  const setStatus = useMutation({
    mutationFn: async ({
      election,
      status,
    }: {
      election: Election;
      status: Election["status"];
    }) => {
      const { error: updateError } = await supabase
        .from("elections")
        .update({ status })
        .eq("id", election.id);
      if (updateError) throw updateError;
      await logAudit(`ELECTION_STATUS_${status.toUpperCase()}`);
    },
    onSuccess: () => {
      toast.success("Election status updated.");
      queryClient.invalidateQueries();
    },
    onError: (err) => toast.error(friendlyError(err, "Could not update the status.")),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.title.trim().length < 2) return setError("Enter an election title.");
    if (!form.start || !form.end) return setError("Choose a start and end time.");
    if (new Date(form.end) <= new Date(form.start))
      return setError("The end time must be after the start time.");
    setError(null);
    save.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Elections</CardTitle>
            <CardDescription>
              Voting is only possible while an election is open and inside its time window.
            </CardDescription>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Create election
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {elections.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : elections.data && elections.data.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {elections.data.map((election) => (
                  <TableRow key={election.id}>
                    <TableCell className="font-medium">{election.title}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {formatDateTime(election.start_time)} → {formatDateTime(election.end_time)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isLiveNow(election) ? "default" : "secondary"}>
                        {statusLabel(election)}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(election)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Edit {election.title}</span>
                      </Button>
                      {election.status !== "open" ? (
                        <Button
                          size="sm"
                          disabled={setStatus.isPending}
                          onClick={() => setStatus.mutate({ election, status: "open" })}
                        >
                          Open
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={setStatus.isPending}
                          onClick={() => setStatus.mutate({ election, status: "closed" })}
                        >
                          Close
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No elections yet. Create one to begin.
          </p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit election" : "Create election"}</DialogTitle>
            <DialogDescription>
              New elections start as a draft. Open them when voting should begin.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Students' Union Election 2026"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="start">Starts</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end">Ends</Label>
                <Input
                  id="end"
                  type="datetime-local"
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                />
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save election
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
