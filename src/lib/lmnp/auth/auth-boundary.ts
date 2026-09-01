import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { clearDossierSessionForAuthReset } from "@/lib/lmnp/dossier/current-dossier";
import { supabase } from "@/lib/supabase";

const BOUND_AUTH_USER_KEY = "fiscal-ai-bound-auth-user-id";

export type AuthBoundaryPayload = {
  event: AuthChangeEvent;
  session: Session | null;
  userId: string | null;
  previousUserId: string | null;
  userChanged: boolean;
};

type AuthBoundaryListener = (payload: AuthBoundaryPayload) => void | Promise<void>;

let boundAuthUserId: string | null = null;
let subscriptionStarted = false;
let lastPayload: AuthBoundaryPayload | null = null;
const listeners = new Set<AuthBoundaryListener>();

function readStoredBoundAuthUserId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(BOUND_AUTH_USER_KEY);
}

export function getBoundAuthUserId(): string | null {
  if (boundAuthUserId) return boundAuthUserId;
  const stored = readStoredBoundAuthUserId();
  if (stored) boundAuthUserId = stored;
  return boundAuthUserId;
}

export function syncBoundAuthUserId(userId: string | null) {
  boundAuthUserId = userId;
  if (typeof window === "undefined") return;
  if (userId) {
    sessionStorage.setItem(BOUND_AUTH_USER_KEY, userId);
  } else {
    sessionStorage.removeItem(BOUND_AUTH_USER_KEY);
  }
}

async function emitAuthBoundary(event: AuthChangeEvent, session: Session | null) {
  const nextUserId = session?.user?.id ?? null;
  const previousUserId = getBoundAuthUserId() ?? readStoredBoundAuthUserId();
  const userChanged = previousUserId !== nextUserId;

  if (userChanged) {
    console.log("[auth] user boundary changed", {
      event,
      previousUserId,
      nextUserId,
    });
    clearDossierSessionForAuthReset();
  }

  syncBoundAuthUserId(nextUserId);

  const payload: AuthBoundaryPayload = {
    event,
    session,
    userId: nextUserId,
    previousUserId,
    userChanged,
  };

  lastPayload = payload;

  await Promise.all([...listeners].map((listener) => listener(payload)));
}

function ensureAuthBoundarySubscription() {
  if (subscriptionStarted) return;
  subscriptionStarted = true;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    void emitAuthBoundary(event, session);
  });

  return subscription;
}

/** Single auth listener for dossier + workflow isolation across account switches. */
export function subscribeAuthBoundary(listener: AuthBoundaryListener): () => void {
  listeners.add(listener);
  ensureAuthBoundarySubscription();

  if (lastPayload) {
    void Promise.resolve(listener(lastPayload));
  }

  return () => listeners.delete(listener);
}
