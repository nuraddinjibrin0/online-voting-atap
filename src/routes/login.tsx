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
import { friendlyError, logAudit, sessionQuery } from "@/lib/voting";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — Online Voting System" },
      { name: "description", content: "Sign in to view the election and cast your vote." },
      { property: "og:title", content: "Log in — Online Voting System" },
      { property: "og:description", content: "Sign in to view the election and cast your vote." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setBusy(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError || !data.user) {
      setBusy(false);
      setError(
        signInError?.message.includes("Invalid login")
          ? "Incorrect email or password."
          : friendlyError(signInError, "Could not sign you in."),
      );
      return;
    }

    await logAudit("LOGIN", data.user.id);
    await queryClient.invalidateQueries();
    const session = await queryClient.fetchQuery(sessionQuery);
    toast.success("Signed in successfully.");
    navigate({ to: session?.isAdmin ? "/admin" : "/dashboard", replace: true });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md py-6">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in with your registered email address.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Log in
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              No account yet?{" "}
              <Link to="/register" className="font-medium text-accent underline-offset-4 hover:underline">
                Register as a voter
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
