/** Payment V1 — helpers HTTP partagés par les handlers (aucune logique métier). */
import { OwnershipError, UnauthorizedError } from "@/lib/supabase-server";
import { PaymentConfigError } from "./payment-server";

export function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Exercice fiscal valide (entier, 2000–2100) ou null. */
export function parseFiscalYear(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 2000 && value <= 2100 ? value : null;
}

/** Convention du projet : 401 non authentifié, 403 non propriétaire ; 503 configuration de paiement absente. */
export function mapPaymentError(scope: string, err: unknown): Response {
  if (err instanceof UnauthorizedError) return jsonResponse(401, { error: err.message, code: "unauthenticated" });
  if (err instanceof OwnershipError) return jsonResponse(403, { error: err.message, code: "not_owner" });
  if (err instanceof PaymentConfigError) {
    console.error(`[${scope}] configuration`, err.message);
    return jsonResponse(503, {
      error: "Le paiement n'est pas disponible pour le moment. Réessayez plus tard.",
      code: "payment_not_configured",
    });
  }
  console.error(`[${scope}]`, err);
  return jsonResponse(500, { error: "Erreur serveur." });
}
