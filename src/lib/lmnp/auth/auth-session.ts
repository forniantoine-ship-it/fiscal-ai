import type { Session, User } from "@supabase/supabase-js";

import {
  createLmnpDossier,
  ensureActiveDossier,
  setCurrentDossierId,
} from "@/lib/lmnp/dossier";
import { supabase } from "@/lib/supabase";

export type AuthSessionResult =
  | { ok: true; userId: string; mode: "signup" | "signin" }
  | { ok: false; error: string };

type AuthPayload = {
  session: Session | null;
  user: User | null;
};

function isExistingUserSignup(data: AuthPayload): boolean {
  const identities = data.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}

function isExistingUserSignupError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("user already exists") ||
    normalized.includes("already exists")
  );
}

async function prepareAuthenticatedSession(
  userId: string,
  mode: "signup" | "signin",
): Promise<AuthSessionResult> {
  if (mode === "signup") {
    const dossier = await createLmnpDossier(userId);
    if (!dossier) {
      return { ok: false, error: "Impossible de créer votre dossier LMNP." };
    }
    setCurrentDossierId(dossier.id, userId);
    console.log("[auth] signup success", { userId, dossierId: dossier.id });
    return { ok: true, userId, mode: "signup" };
  }

  const dossier = await ensureActiveDossier(userId);
  if (!dossier) {
    return { ok: false, error: "Impossible de restaurer votre dossier LMNP." };
  }

  setCurrentDossierId(dossier.id, userId);
  console.log("[auth] signin success", { userId, dossierId: dossier.id });
  return { ok: true, userId, mode: "signin" };
}

function resolveAuthUser(response: AuthPayload) {
  return response.session?.user ?? response.user ?? null;
}

export async function signUpWithSession(
  email: string,
  password: string,
): Promise<AuthSessionResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error && isExistingUserSignupError(error.message)) {
    console.log("[auth] signup existing user fallback to signin", { email });
    return signInWithSession(email, password);
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  if (isExistingUserSignup(data)) {
    console.log("[auth] signup existing user fallback to signin", { email });
    return signInWithSession(email, password);
  }

  const user = resolveAuthUser(data);
  if (!user) {
    return {
      ok: false,
      error: "Compte créé. Vérifiez votre email pour activer votre session, puis connectez-vous.",
    };
  }

  return prepareAuthenticatedSession(user.id, "signup");
}

export async function signInWithSession(
  email: string,
  password: string,
): Promise<AuthSessionResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, error: error.message };
  }

  const user = resolveAuthUser(data);
  if (!user) {
    return { ok: false, error: "Connexion impossible : session utilisateur introuvable." };
  }

  return prepareAuthenticatedSession(user.id, "signin");
}

export function logAuthRedirectDashboard() {
  console.log("[auth] redirect dashboard");
}

export async function signOutWithSession(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("[auth] signOut failed", error.message);
    throw error;
  }
  console.log("[auth] signOut success");
}
