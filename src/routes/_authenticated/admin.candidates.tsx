import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { CandidatePhoto } from "@/components/CandidatePhoto";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { candidatesQuery, friendlyError, logAudit, type Candidate } from "@/lib/voting";

export const Route = createFileRoute("/_authenticated/admin/candidates")({
  head: () => ({
    meta: [
      { title: "Manage candidates — Online Voting System" },
      { name: "description", content: "Add, edit and remove candidates and their manifestos." },
      { property: "og:title", content: "Manage candidates — Online Voting System" },
      {
        property: "og:description",
        content: "Add, edit and remove candidates and their manifestos.",
      },
    ],
  }),
  component: ManageCandidates;
});

type FormState = {
  full_name: string;
  position: string;
  manifesto: string;
};

const emptyForm: FormState = { full_name: "", position: "", manifesto: "" };

function ManageCandidates() {
  const queryClient = useQueryClient();
  const candidates = useQuery(candidatesQuery);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Candidate | null>(null);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setFile(null);
    setError(null);
    setOpen(true);
  }

  function openEdit(candidate: Candidate) {
    setEditing(candidate);
    setForm({
      full_name: candidate.full_name,
      position: candidate.position,
      manifesto: candidate.manifesto ?? "",
    });
    setFile(null);
    setError(null);
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      let photoPath = editing?.photo_url ?? null;

      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `candidates/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("candidate-photos")
          .upload(path, file, { upsert: false });
        if (uploadError) throw uploadError;
        photoPath = path;
      }

      const payload = {
        full_name: form.full_name.trim(),
        position: form.position.trim(),
        manifesto: form.manifesto.trim() || null,
        photo_url: photoPath,
      };

      if (editing) {
        const { error: updateError } = await supabase
          .from("candidates")
          .update(payload)
          .eq("id", editing.id);
        if (updateError) throw updateError;
        await logAudit("CANDIDATE_UPDATED");
      } else {
        const { error: insertError } = await supabase.from("candidates").insert(payload);
        if (insertError) throw insertError;
        await logAudit("CANDIDATE_CREATED");
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Candidate updated." : "Candidate added.");
      queryClient.invalidateQueries();
      setOpen(false);
    },
    onError: (err) => setError(friendlyError(err, "Could not save the candidate.")),
  });

  const remove = useMutation({
    mutationFn: async (candidate: Candidate) => {
      const { error: deleteError } = await supabase
        .from("candidates")
        .delete()
        .eq("id", candidate.id);
      if (deleteError) throw deleteError;
      await logAudit("CANDIDATE_DELETED");
    },
    onSuccess: () => {
      toast.success("Candidate deleted.");
      queryClient.invalidateQueries();
      setDeleting(null);
    },
    onError: (err) => {
      toast.error(
        friendlyError(err, "Could not delete the candidate.").includes("violates foreign key")
          ? "This candidate already has votes and cannot be deleted."
          : friendlyError(err, "Could not delete the candidate."),
      );
      setDeleting(null);
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.full_name.trim().length < 2) return setError("Enter the candidate's full name.");
    if (form.position.trim().length < 2) return setError("Enter the position being contested.");
    if (file && file.size > 5 * 1024 * 1024) return setError("Photo must be smaller than 5 MB.");
    if (file && !file.type.startsWith("image/")) return setError("The photo must be an image file.");
    setError(null);
    save.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Candidates</CardTitle>
            <CardDescription>Each candidate contests a single position.</CardDescription>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Add candidate
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {candidates.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : candidates.data && candidates.data.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Photo</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead className="hidden md:table-cell">Manifesto</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.data.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell>
                      <CandidatePhoto
                        path={candidate.photo_url}
                        name={candidate.full_name}
                        className="h-10 w-10"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{candidate.full_name}</TableCell>
                    <TableCell>{candidate.position}</TableCell>
                    <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                      {candidate.manifesto ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(candidate)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Edit {candidate.full_name}</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(candidate)}>
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                        <span className="sr-only">Delete {candidate.full_name}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No candidates yet. Add the first one to get started.
          </p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit candidate" : "Add candidate"}</DialogTitle>
            <DialogDescription>
              Name, position and manifesto are shown to voters on the ballot.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="position">Position</Label>
              <Input
                id="position"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="President"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manifesto">Manifesto</Label>
              <Textarea
                id="manifesto"
                rows={4}
                value={form.manifesto}
                onChange={(e) => setForm({ ...form, manifesto: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="photo">Photo (optional, max 5 MB)</Label>
              <Input
                id="photo"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
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
                Save candidate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.full_name} will be removed from the ballot. Candidates who already have
              votes cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove.mutate(deleting);
              }}
              disabled={remove.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
