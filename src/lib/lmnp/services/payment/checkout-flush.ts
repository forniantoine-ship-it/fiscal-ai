/**
 * MB-MULTI-CHECKOUT-FLUSH-1 — « vider avant toute action conséquente » pour le checkout.
 *
 * Le serveur évalue le checkout sur son snapshot persisté (fail-closed si absent ou périmé). Le client doit donc d'abord vider
 * l'autosave en attente et obtenir la confirmation de persistance — même primitive que la livraison (`resolveDeliveryRevision`
 * du provider), aucun second mécanisme d'autosave. En cas d'échec : `start` n'est pas appelé (aucune ligne de paiement, aucune
 * session Stripe) et l'erreur récupérable existante est levée.
 *
 * La révision confirmée est transmise à `start` à titre informatif seulement : le paiement reste lié au dossier et à l'exercice,
 * jamais à une révision (elle n'entre pas dans la requête de checkout).
 */
import {
  DELIVERY_REVISION_UNAVAILABLE_MESSAGE,
  type DeliveryRevisionResult,
} from "@/lib/lmnp/services/declaration/resolve-delivery-revision";

type FlushResult = { status: "ok"; revision: number } | { status: "failed"; reason: string };

export async function startCheckoutAfterFlush<T>(input: {
  resolveDeliveryRevision: () => Promise<FlushResult>;
  start: (confirmedRevision: number) => Promise<T>;
}): Promise<T> {
  let flushed: FlushResult | DeliveryRevisionResult;
  try {
    flushed = await input.resolveDeliveryRevision();
  } catch {
    throw new Error(DELIVERY_REVISION_UNAVAILABLE_MESSAGE);
  }
  if (flushed.status !== "ok" || !Number.isInteger(flushed.revision) || flushed.revision < 1) {
    throw new Error(DELIVERY_REVISION_UNAVAILABLE_MESSAGE);
  }
  return input.start(flushed.revision);
}
