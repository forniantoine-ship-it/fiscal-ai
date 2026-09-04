import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

/** Thrown when a request has no valid user identity. Routes must map this to HTTP 401. */
export class UnauthorizedError extends Error {
  constructor(message = "Authentification requise.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Thrown when an authenticated user does not own the resource being accessed. Routes must map this to HTTP 403. */
export class OwnershipError extends Error {
  constructor(message = "Ressource introuvable ou accès refusé.") {
    super(message);
    this.name = "OwnershipError";
  }
}

function getAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Configuration Supabase manquante.");
  }

  if (!anonClient) {
    anonClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return anonClient;
}

/**
 * Verifies a user access token server-side and returns the authenticated user id.
 *
 * This establishes IDENTITY only. It is not proof of ownership of any dossier,
 * document, or extraction row — callers must still verify ownership explicitly
 * (see assertDossierOwnership / assertDocumentOwnership / resolveExtractionDossierId)
 * before reading or writing a specific row. Never falls back to an unauthenticated
 * or service-role client: a missing or invalid token always throws.
 */
export async function getServerSupabaseForUser(authToken?: string): Promise<{ userId: string }> {
  if (!authToken) {
    throw new UnauthorizedError();
  }

  const { data, error } = await getAnonClient().auth.getUser(authToken);

  if (error || !data.user) {
    throw new UnauthorizedError();
  }

  return { userId: data.user.id };
}

/**
 * ⚠️ Unscoped server client (service role when configured) — bypasses Row Level
 * Security entirely. Never call this from a route before identity AND ownership
 * have been established. See knowledge/00 - Governance audit P1-2.1/P1-2.2.
 */
export function getServerSupabaseUnscoped(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || (!serviceRoleKey && !anonKey)) {
    throw new Error("Configuration Supabase manquante.");
  }

  if (serviceRoleKey) {
    if (!serverClient) {
      serverClient = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return serverClient;
  }

  return createClient(url, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Throws OwnershipError unless `dossierId` belongs to `userId`. */
export async function assertDossierOwnership(
  supabase: SupabaseClient,
  dossierId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("lmnp_dossiers")
    .select("id")
    .eq("id", dossierId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new OwnershipError();
  }
}

/** Throws OwnershipError unless `documentId` belongs to `dossierId` and `userId`. */
export async function assertDocumentOwnership(
  supabase: SupabaseClient,
  documentId: string,
  dossierId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("dossier_id", dossierId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new OwnershipError();
  }
}

/** Returns the dossier_id an extraction row belongs to, or null if the row doesn't exist. */
export async function resolveExtractionDossierId(
  supabase: SupabaseClient,
  extractionRowId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("extracted_document_data")
    .select("dossier_id")
    .eq("id", extractionRowId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.dossier_id as string;
}
