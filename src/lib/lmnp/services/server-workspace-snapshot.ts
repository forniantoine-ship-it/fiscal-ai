/**
 * R2C.3c1 — lecture SERVEUR du snapshot de workspace pour les barrières multi-bien (checkout, transition).
 *
 * Aucune confiance accordée au client : le mode multi est déduit de `lmnp_workspace_snapshots`. Absence de ligne =
 * jamais bloquante (mono historique). Erreur de lecture = l'erreur remonte (échec fermé : on ne peut pas prouver
 * que le dossier n'est pas multi). Aucune écriture.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isMultiPropertyPayload,
  isMultiPropertySnapshotRow,
  isMultiPropertyCapabilityOpen,
  type MultiPropertyCapabilities,
  type MultiPropertyCapability,
} from "@/lib/lmnp/dossier/multi-property-activation";

/**
 * `revision` : révision persistée de la ligne (colonne `revision`). Optionnelle pour les lecteurs historiques (barrières multi qui ne
 * lisent que le mode) ; la frontière de LIVRAISON l'exige (`expectedRevision` comparé à elle) et échoue fermée si elle manque.
 */
export type ServerSnapshotRow = { schemaVersion: number; payload: unknown; revision?: number };
export type ReadServerSnapshot = (dossierId: string, fiscalYear: number) => Promise<ServerSnapshotRow | null>;

export function createSupabaseSnapshotReader(client: SupabaseClient): ReadServerSnapshot {
  return async (dossierId, fiscalYear) => {
    const { data, error } = await client
      .from("lmnp_workspace_snapshots")
      .select("schema_version, payload, revision")
      .eq("dossier_id", dossierId)
      .eq("fiscal_year", fiscalYear)
      .maybeSingle();
    if (error) throw new Error(`workspace snapshot lookup failed: ${error.message}`);
    if (!data) return null;
    const revision = Number((data as { revision?: unknown }).revision);
    return {
      schemaVersion: Number((data as { schema_version: unknown }).schema_version),
      payload: (data as { payload: unknown }).payload,
      ...(Number.isInteger(revision) && revision >= 1 ? { revision } : {}),
    };
  };
}

/**
 * `true` : la barrière multi-bien de CETTE capacité doit refuser (snapshot serveur multi, et/ou payloads transmis multi).
 * La capacité est explicite : le paiement ne s'ouvre jamais par la génération, ni la transition N+1 par le paiement.
 */
export async function isMultiPropertyBarrierActive(
  read: ReadServerSnapshot,
  input: { dossierId: string; fiscalYear: number; transmittedPayloads?: readonly unknown[] },
  capability: MultiPropertyCapability,
  capabilities?: MultiPropertyCapabilities,
): Promise<boolean> {
  if (isMultiPropertyCapabilityOpen(capability, capabilities)) return false;
  if (isMultiPropertySnapshotRow(await read(input.dossierId, input.fiscalYear))) return true;
  return (input.transmittedPayloads ?? []).some(isMultiPropertyPayload);
}
