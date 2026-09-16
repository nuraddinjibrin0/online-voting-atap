import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/voting";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Voter registration — Online Voting System" },
      {
        name: "description",
        content: "Create a voter account with your name, voter ID and email address.",
      },
      { property: "og:title", content: "Voter registration — Online Voting System" },
      {
        property: "og:description",
        content: "Create a voter account with your name, voter ID and email address.",
      },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    fullName: "",
    voterId: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate() {
    if (form.fullName.trim().length < 3) return "Enter your full name.";
    if (!/^[A-Za-z0-9-]{4,20}$/.test(form.voterId.trim()))
      return "Voter ID must be 4-20 letters, numbers or hyphens.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return "Enter a valid email address.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (form.password !== form.confirm) return "Passwords do not match.";
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;

    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: form.fullName.trim(),
          voter_id: form.voterId.trim().toUpperCase(),
        },
      },
    });

    if (signUpError) {
      setBusy(false);
      setError(
        signUpError.message.includes("already registered")
          ? "That email is already registered. Try logging in."
          : friendlyError(signUpError, "Could not create your account."),
      );
      return;
    }

    if (!data.session) {
      setBusy(false);
      toast.success("Account created. Check your email to confirm, then log in.");
      navigate({ to: "/login" });
      return;
    }

    await queryClient.invalidateQueries();
    toast.success("Registration complete. Welcome!");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg py-6">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-2xl">Voter registration</CardTitle>
            <CardDescription>
              Your details are used to identify you at the ballot. Your password is never stored in
              the application database.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
              <div className="grid gap-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  placeholder="Amina Bello"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="voterId">Voter ID</Label>
                <Input
                  id="voterId"
                  value={form.voterId}
                  onChange={(e) => update("voterId", e.target.value)}
                  placeholder="HND-2026-014"
                />
                <p className="text-xs text-muted-foreground">
                  Your student or registration number. Must be unique.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirm}
                    onChange={(e) => update("confirm", e.target.value)}
                  />
                </div>
              </div>

              {error ? (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create my voter account
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already registered?{" "}
              <Link to="/login" className="font-medium text-accent underline-offset-4 hover:underline">
                Log in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
