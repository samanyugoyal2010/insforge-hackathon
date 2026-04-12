"use client";

import { createClient, type Provider } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

const supabase = createClient(supabaseUrl, supabasePublishableKey);

let cachedHasSession = false;
let cachedUserId: string | null = null;

export async function hydrateAuthSession() {
  const { data } = await supabase.auth.getSession();
  cachedHasSession = Boolean(data.session);
  cachedUserId = data.session?.user.id ?? null;
  return data.session;
}

export function hasAuthSession() {
  return cachedHasSession;
}

export function getCachedAuthUserId() {
  return cachedUserId;
}

export function subscribeAuthSession(onStoreChange: () => void) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    cachedHasSession = Boolean(session);
    cachedUserId = session?.user.id ?? null;
    onStoreChange();
  });

  return () => subscription.unsubscribe();
}

export async function signInWithProvider(provider: Provider, next = "/dashboard") {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });

  if (error) throw error;
}

export async function signOutAuth() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  cachedHasSession = Boolean(data.session);
  cachedUserId = data.session?.user.id ?? null;
  return data.session;
}

/** Refresh access token before server calls that validate JWT (e.g. AR handoff mint). */
export async function refreshAuthSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return null;
  cachedHasSession = true;
  cachedUserId = data.session.user.id;
  return data.session;
}
