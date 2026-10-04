/**
 * MB-MULTI-SERVER-TRUST-2 — révision à envoyer comme `expectedRevision` aux routes de livraison.
 *
 * Exercice ACTIF : la révision serveur CONFIRMÉE après vidage de l'autosave (fournie par le provider, jamais devinée ni lue « en
 * direct » : adopter la révision vivante masquerait un changement fait dans un autre onglet).
 * Exercice ARCHIVÉ : son snapshot est clos, donc immuable — sa révision persistée ne peut plus bouger et peut être lue telle quelle.
 *
 * Sans révision établie : échec (la livraison n'est pas demandée), jamais d'envoi sans `expectedRevision`.
 */
import { listWorkspaceSnapshots } from "@/lib/lmnp/store/workspace-snapshot-client";

export type DeliveryRevisionResult = { status: "ok"; revision: number } | { status: "failed"; message: string };

export const DELIVERY_REVISION_UNAVAILABLE_MESSAGE =
  "Votre dossier n'a pas pu être synchronisé avec le serveur. Vérifiez votre connexion puis réessayez.";

export function describeDeliveryRevisionFailure(): string {
  return DELIVERY_REVISION_UNAVAILABLE_MESSAGE;
}

export async function resolveArchivedDeliveryRevision(
  dossierId: string | undefined,
  fiscalYear: number,
  list: typeof listWorkspaceSnapshots = listWorkspaceSnapshots,
): Promise<DeliveryRevisionResult> {
  if (!dossierId) return { status: "failed", message: DELIVERY_REVISION_UNAVAILABLE_MESSAGE };
  const listed = await list(dossierId);
  if (listed.status !== "ok") return { status: "failed", message: DELIVERY_REVISION_UNAVAILABLE_MESSAGE };
  const row = listed.snapshots.find((snapshot) => snapshot.fiscalYear === fiscalYear && snapshot.closedAt);
  return row && Number.isInteger(row.revision) && row.revision >= 1
    ? { status: "ok", revision: row.revision }
    : { status: "failed", message: DELIVERY_REVISION_UNAVAILABLE_MESSAGE };
}
