/**
 * Test-only backend access. Runs in Node (never in the browser bundle) and uses
 * the service-role key so tests can seed elections/candidates, promote a test
 * account to administrator, assert database rows, and clean up afterwards.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!url || !serviceKey) {
  throw new Error(
    "E2E tests need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.",
  );
}

export const backend = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type TestUser = {
  id: string;
  email: string;
  password: string;
  fullName: string;
  voterId: string;
};

const createdUserIds: string[] = [];
const createdElectionIds: string[] = [];
const createdCandidateIds: string[] = [];

export function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
}

export function newVoterDetails(label = "voter") {
  const suffix = uniqueSuffix();
  return {
    email: `e2e-${label}-${suffix.toLowerCase()}@example.com`,
    password: "E2e-Password-123",
    fullName: `E2E ${label} ${suffix}`,
    voterId: `E2E-${suffix}`.slice(0, 20),
  };
}

export function trackUser(id: string) {
  if (id && !createdUserIds.includes(id)) createdUserIds.push(id);
}

export async function findUserIdByEmail(email: string) {
  const { data, error } = await backend
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function grantAdmin(userId: string) {
  const { error } = await backend
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  if (error) throw error;
}

export async function createElection(options: {
  title: string;
  status?: "draft" | "open" | "closed";
  startOffsetMinutes?: number;
  endOffsetMinutes?: number;
  description?: string;
}) {
  const start = new Date(Date.now() + (options.startOffsetMinutes ?? -60) * 60_000);
  const end = new Date(Date.now() + (options.endOffsetMinutes ?? 60) * 60_000);
  const { data, error } = await backend
    .from("elections")
    .insert({
      title: options.title,
      description: options.description ?? "Created by the automated test suite.",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: options.status ?? "open",
    })
    .select("*")
    .single();
  if (error) throw error;
  createdElectionIds.push(data.id);
  return data;
}

export async function createCandidate(options: {
  fullName: string;
  position: string;
  manifesto?: string;
}) {
  const { data, error } = await backend
    .from("candidates")
    .insert({
      full_name: options.fullName,
      position: options.position,
      manifesto: options.manifesto ?? "Automated test manifesto.",
    })
    .select("*")
    .single();
  if (error) throw error;
  createdCandidateIds.push(data.id);
  return data;
}

export async function trackCandidateByName(fullName: string) {
  const { data } = await backend
    .from("candidates")
    .select("id")
    .eq("full_name", fullName)
    .maybeSingle();
  if (data?.id && !createdCandidateIds.includes(data.id)) createdCandidateIds.push(data.id);
  return data?.id ?? null;
}

export async function trackElectionByTitle(title: string) {
  const { data } = await backend.from("elections").select("id").eq("title", title).maybeSingle();
  if (data?.id && !createdElectionIds.includes(data.id)) createdElectionIds.push(data.id);
  return data?.id ?? null;
}

export async function setElectionStatus(id: string, status: "draft" | "open" | "closed") {
  const { error } = await backend.from("elections").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Closes every election this test run created, except the given one. */
export async function closeOtherTestElections(keepId?: string) {
  const ids = createdElectionIds.filter((id) => id !== keepId);
  if (!ids.length) return;
  const { error } = await backend.from("elections").update({ status: "closed" }).in("id", ids);
  if (error) throw error;
}

export async function votesFor(electionId: string) {
  const { data, error } = await backend
    .from("votes")
    .select("id, voter_id, candidate_id")
    .eq("election_id", electionId);
  if (error) throw error;
  return data ?? [];
}

export async function auditActionsFor(userId: string) {
  const { data, error } = await backend
    .from("audit_logs")
    .select("action, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.action);
}

/** Removes everything the suite created, in dependency order. */
export async function cleanupTestData() {
  for (const electionId of createdElectionIds) {
    await backend.from("votes").delete().eq("election_id", electionId);
  }
  for (const userId of createdUserIds) {
    await backend.from("votes").delete().eq("voter_id", userId);
  }
  if (createdCandidateIds.length) {
    const { data: photos } = await backend
      .from("candidates")
      .select("photo_url")
      .in("id", createdCandidateIds);
    const paths = (photos ?? [])
      .map((row) => row.photo_url)
      .filter((path): path is string => Boolean(path) && !path!.startsWith("http"));
    if (paths.length) {
      await backend.storage.from("candidate-photos").remove(paths);
    }
    await backend.from("candidates").delete().in("id", createdCandidateIds);
  }
  if (createdElectionIds.length) {
    await backend.from("elections").delete().in("id", createdElectionIds);
  }
  for (const userId of createdUserIds) {
    await backend.from("audit_logs").delete().eq("user_id", userId);
    await backend.auth.admin.deleteUser(userId).catch(() => undefined);
  }
  createdUserIds.length = 0;
  createdElectionIds.length = 0;
  createdCandidateIds.length = 0;
}
