import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Vote } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logAudit, sessionQuery } from "@/lib/voting";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQuery);

  async function handleSignOut() {
    await logAudit("LOGOUT");
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Vote className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">Online Voting System</span>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
            {session ? (
              <>
                <Link
                  to="/dashboard"
                  className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  activeProps={{ className: "bg-secondary text-foreground" }}
                >
                  Voting
                </Link>
                {session.isAdmin ? (
                  <Link
                    to="/admin"
                    className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    activeProps={{ className: "bg-secondary text-foreground" }}
                  >
                    Administration
                  </Link>
                ) : null}
              </>
            ) : null}
          </nav>

          {session ? (
            <div className="flex items-center gap-3">
              <div className="hidden text-right text-xs leading-tight sm:block">
                <p className="font-medium">{session.profile?.full_name ?? session.email}</p>
                <p className="text-muted-foreground">
                  {session.isAdmin ? "Administrator" : "Voter"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Sign out
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/register">Register</Link>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Online Voting System — secure, one person one vote.
      </footer>
    </div>
  );
}
