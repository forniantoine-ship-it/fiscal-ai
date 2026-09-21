/**
 * Lot 3 — POST /api/lmnp/fiscal-year/transition
 *
 * Auth + owner check, then service-role RPC (or injectable store for tests).
 * Fiscal payloads are prepared by the client from Lot 1 builder; this handler
 * never rebuilds N+1 and never reseeds an existing successor.
 */
import {
  assertDossierOwnership,
  getServerSupabaseForUser,
  getServerSupabaseUnscoped,
  OwnershipError,
  UnauthorizedError,
} from "@/lib/supabase-server";
import { commitFiscalYearTransition } from "./commit-transition";
import { commitFiscalYearTransitionViaRpc } from "./supabase-rpc";
import {
  TransitionCommitError,
  type FiscalYearTransitionStore,
  type TransitionCommitResult,
} from "./types";

export type TransitionHandlerDeps = {
  authenticate: (authToken: string | undefined) => Promise<{ userId: string }>;
  assertOwnership: (dossierId: string, userId: string) => Promise<void>;
  commit: (input: {
    dossierId: string;
    userId: string;
    fromYear: number;
    expectedRevision: number;
    closedNPayload: unknown;
    closedNSchemaVersion: number;
    nextYear: number;
    nextPayload: unknown;
    nextSchemaVersion: number;
    now: string;
  }) => Promise<TransitionCommitResult>;
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseYear(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 2000 && value <= 2100
    ? value
    : null;
}

function parseRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

function mapError(err: unknown): Response {
  if (err instanceof UnauthorizedError) {
    return jsonResponse(401, { error: err.message, code: "unauthenticated" });
  }
  if (err instanceof OwnershipError) {
    return jsonResponse(403, { error: err.message, code: "not_owner" });
  }
  if (err instanceof TransitionCommitError) {
    const status =
      err.code === "not_owner"
        ? 403
        : err.code === "revision_conflict" || err.code === "snapshot_closed"
          ? 409
          : err.code === "source_missing" || err.code === "dossier_not_found"
            ? 404
            : 400;
    return jsonResponse(status, { error: err.message, code: err.code });
  }
  console.error("[fiscal-year/transition]", err);
  return jsonResponse(500, { error: "Erreur serveur.", code: "server_error" });
}

export function createDefaultTransitionHandlerDeps(): TransitionHandlerDeps {
  return {
    authenticate: (authToken) => getServerSupabaseForUser(authToken),
    assertOwnership: async (dossierId, userId) => {
      const supabase = getServerSupabaseUnscoped();
      await assertDossierOwnership(supabase, dossierId, userId);
    },
    commit: async (input) => {
      const supabase = getServerSupabaseUnscoped();
      return commitFiscalYearTransitionViaRpc(supabase, input);
    },
  };
}

/** Test helper: wire handler to an in-memory store (no Supabase). */
export function createStoreBackedTransitionHandlerDeps(
  store: FiscalYearTransitionStore,
  options?: { userIdByToken?: Record<string, string> },
): TransitionHandlerDeps {
  const userIdByToken = options?.userIdByToken ?? { "tok-owner": "user-owner" };
  return {
    authenticate: async (authToken) => {
      if (!authToken || !userIdByToken[authToken]) throw new UnauthorizedError();
      return { userId: userIdByToken[authToken] };
    },
    assertOwnership: async (dossierId, userId) => {
      const dossier = await store.getDossier(dossierId);
      if (!dossier || dossier.userId !== userId) throw new OwnershipError();
    },
    commit: (input) => commitFiscalYearTransition(store, input),
  };
}

export async function handleFiscalYearTransitionRequest(
  request: Request,
  depsFactory: () => TransitionHandlerDeps = createDefaultTransitionHandlerDeps,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: "Corps de requête JSON invalide.", code: "invalid_request" });
  }
  if (!body || typeof body !== "object") {
    return jsonResponse(400, { error: "Corps de requête JSON invalide.", code: "invalid_request" });
  }

  try {
    const deps = depsFactory();
    const { userId } = await deps.authenticate(
      typeof body.authToken === "string" ? body.authToken : undefined,
    );

    const dossierId = isNonEmptyString(body.dossierId) ? body.dossierId.trim() : null;
    const fromYear = parseYear(body.fromYear);
    const nextYear = parseYear(body.nextYear);
    const expectedRevision = parseRevision(body.expectedRevision);
    const closedNSchemaVersion = parseRevision(body.closedNSchemaVersion);
    const nextSchemaVersion = parseRevision(body.nextSchemaVersion);
    const closedNPayload = body.closedNPayload;
    const nextPayload = body.nextPayload;
    const now =
      typeof body.now === "string" && body.now.length > 0 ? body.now : new Date().toISOString();

    if (
      !dossierId ||
      fromYear == null ||
      nextYear == null ||
      expectedRevision == null ||
      closedNSchemaVersion == null ||
      nextSchemaVersion == null ||
      closedNPayload == null ||
      nextPayload == null
    ) {
      return jsonResponse(400, {
        error: "Paramètres de transition incomplets ou invalides.",
        code: "invalid_request",
      });
    }

    await deps.assertOwnership(dossierId, userId);

    const result = await deps.commit({
      dossierId,
      userId,
      fromYear,
      expectedRevision,
      closedNPayload,
      closedNSchemaVersion,
      nextYear,
      nextPayload,
      nextSchemaVersion,
      now,
    });

    return jsonResponse(200, { ok: true, ...result });
  } catch (err) {
    return mapError(err);
  }
}
