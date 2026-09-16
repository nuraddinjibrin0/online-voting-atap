import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "voter";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  voter_id: string;
  created_at: string;
};

export type Candidate = {
  id: string;
  full_name: string;
  position: string;
  manifesto: string | null;
  photo_url: string | null;
  created_at: string;
};

export type Election = {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  status: "draft" | "open" | "closed";
  created_at: string;
};

export type SessionInfo = {
  userId: string;
  email: string;
  profile: Profile | null;
  roles: Role[];
  isAdmin: boolean;
  isVoter: boolean;
} | null;

/** Records a security-relevant action. Never records a candidate choice. */
export async function logAudit(action: string, userId?: string) {
  try {
    let id = userId;
    if (!id) {
      const { data } = await supabase.auth.getUser();
      id = data.user?.id;
    }
    if (!id) return;
    await supabase.from("audit_logs").insert({ user_id: id, action });
  } catch {
    // auditing must never block the user's action
  }
}

export const sessionQuery = {
  queryKey: ["session"] as const,
  queryFn: async (): Promise<SessionInfo> => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return null;

    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);

    const roles = (roleRows ?? []).map((r) => r.role as Role);
    return {
      userId: user.id,
      email: user.email ?? "",
      profile: (profile as Profile | null) ?? null,
      roles,
      isAdmin: roles.includes("admin"),
      isVoter: roles.includes("voter"),
    };
  },
  staleTime: 30_000,
};

export const candidatesQuery = {
  queryKey: ["candidates"] as const,
  queryFn: async (): Promise<Candidate[]> => {
    const { data, error } = await supabase
      .from("candidates")
      .select("*")
      .order("position", { ascending: true })
      .order("full_name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Candidate[];
  },
};

export const electionsQuery = {
  queryKey: ["elections"] as const,
  queryFn: async (): Promise<Election[]> => {
    const { data, error } = await supabase
      .from("elections")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Election[];
  },
};

export function isLiveNow(e: Election) {
  const now = Date.now();
  return (
    e.status === "open" &&
    now >= new Date(e.start_time).getTime() &&
    now <= new Date(e.end_time).getTime()
  );
}

export function statusLabel(e: Election) {
  if (e.status === "draft") return "Not started";
  if (e.status === "closed") return "Closed";
  return isLiveNow(e) ? "Open for voting" : "Open (outside voting window)";
}

/** Candidate photos live in a private bucket, so we resolve short-lived signed URLs. */
export async function resolvePhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("candidate-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function friendlyError(error: unknown, fallback = "Something went wrong.") {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes("votes_one_per_election") || message.includes("already voted")) {
      return "You have already voted in this election.";
    }
    if (message.includes("not open")) return "This election is not open for voting.";
    if (message.includes("row-level security")) {
      return "You are not allowed to perform this action.";
    }
    if (message.includes("duplicate key") && message.includes("voter_id")) {
      return "That voter ID is already registered.";
    }
    return message;
  }
  return fallback;
}
