/**
 * Payment V1 — côté navigateur : lecture de l'entitlement serveur, démarrage du
 * Checkout, contexte d'accès aux livraisons.
 *
 * L'état local (`fiscalYear.paidAt`) n'est qu'un cache d'affichage : l'autorité
 * est la ligne serveur `lmnp_declaration_payments`. Lecture protégée par RLS
 * (propriétaire du dossier uniquement) ; jamais d'écriture depuis le client.
 */
import type { PriorHistoryDeclarationStatus } from "@/lib/lmnp/types/domain";
import type { ClientContinuityFacts } from "./server-prior-history";

type SupabaseLike = {
  auth: { getSession(): Promise<{ data: { session: { access_token?: string } | null } }> };
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): { maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }> };
      };
    };
  };
};

async function defaultClient(): Promise<SupabaseLike> {
  const mod = await import("@/lib/supabase");
  return mod.supabase as unknown as SupabaseLike;
}

async function defaultDossierId(): Promise<string | null> {
  const mod = await import("@/lib/lmnp/dossier/current-dossier");
  return mod.getCurrentDossierId();
}

export class PaymentClientError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "PaymentClientError";
    this.code = code;
    this.status = status;
  }
}

export type ServerEntitlement = { paid: boolean; paidAt?: string };

/** Lit l'entitlement serveur du dossier/exercice. Erreur réseau/RLS → lève (jamais « payé » par défaut). */
export async function fetchPaymentEntitlement(
  fiscalYear: number,
  deps: { client?: SupabaseLike; dossierId?: string | null } = {},
): Promise<ServerEntitlement> {
  const client = deps.client ?? (await defaultClient());
  const dossierId = deps.dossierId !== undefined ? deps.dossierId : await defaultDossierId();
  if (!dossierId) throw new PaymentClientError("Dossier introuvable.", "no_dossier", 0);

  const { data, error } = await client
    .from("lmnp_declaration_payments")
    .select("status, paid_at")
    .eq("dossier_id", dossierId)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();
  if (error) throw new PaymentClientError("Vérification du paiement impossible.", "lookup_failed", 0);

  const row = data as { status?: string; paid_at?: string | null } | null;
  return row?.status === "paid" ? { paid: true, paidAt: row.paid_at ?? undefined } : { paid: false };
}

export type DeliveryAccessContext = { authToken: string; dossierId: string; fiscalYear: number };

/** Contexte envoyé aux routes de livraison : même convention que la suppression de document (`authToken` dans le corps). */
export async function resolveDeliveryContext(
  fiscalYear: number,
  deps: { client?: SupabaseLike; dossierId?: string | null } = {},
): Promise<DeliveryAccessContext> {
  const client = deps.client ?? (await defaultClient());
  const dossierId = deps.dossierId !== undefined ? deps.dossierId : await defaultDossierId();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.access_token) throw new PaymentClientError("Session expirée. Reconnectez-vous.", "unauthenticated", 401);
  if (!dossierId) throw new PaymentClientError("Dossier introuvable.", "no_dossier", 0);
  return { authToken: session.access_token, dossierId, fiscalYear };
}

async function postJson<T>(url: string, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok) {
    throw new PaymentClientError(
      payload.error ?? "Le paiement n'a pas pu être démarré. Réessayez dans quelques instants.",
      payload.code ?? "unknown",
      response.status,
    );
  }
  return payload as T;
}

/** Enregistre côté serveur la réponse P0 courante (horodatée) — jamais une simple mémoire locale. */
export async function declarePriorHistoryOnServer(
  fiscalYear: number,
  status: PriorHistoryDeclarationStatus,
  deps: { context?: DeliveryAccessContext; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const context = deps.context ?? (await resolveDeliveryContext(fiscalYear));
  await postJson("/api/lmnp/payment/prior-history", { ...context, status }, deps.fetchImpl ?? fetch);
}

export type CheckoutOutcome =
  | { status: "checkout"; url: string }
  | { status: "already_paid" }
  | { status: "payment_processing" };

export async function requestCheckout(
  fiscalYear: number,
  continuity: ClientContinuityFacts | undefined,
  deps: { context?: DeliveryAccessContext; fetchImpl?: typeof fetch } = {},
): Promise<CheckoutOutcome> {
  const context = deps.context ?? (await resolveDeliveryContext(fiscalYear));
  // Le prix n'est JAMAIS envoyé : le serveur le détermine.
  return postJson<CheckoutOutcome>(
    "/api/lmnp/payment/checkout",
    { ...context, continuity },
    deps.fetchImpl ?? fetch,
  );
}

/** Interroge `check` jusqu'à `true` (borné). `false` = pas confirmé à temps : l'appelant propose « Vérifier à nouveau ». */
export async function pollUntil(
  check: () => Promise<boolean>,
  options: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  const attempts = options.attempts ?? 15;
  const intervalMs = options.intervalMs ?? 2000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let i = 0; i < attempts; i += 1) {
    try {
      if (await check()) return true;
    } catch {
      // Erreur passagère : on réessaie, jamais « payé » par défaut.
    }
    if (i < attempts - 1) await sleep(intervalMs);
  }
  return false;
}
