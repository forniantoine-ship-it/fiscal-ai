/**
 * F013 v2 — garde de continuité N→N+1 (fail-closed).
 *
 * La continuité F013 v2 (CC N → CO N+1, AC N → AO N+1) n'est pas encore définie : le constructeur de N+1 n'emporte
 * volontairement aucune donnée v2 (liste blanche). Clôturer un exercice portant `rentReconciliationV2` ferait donc
 * disparaître silencieusement la continuité de N+1. Tant que cette tranche fiscale n'existe pas, toute transition d'un
 * workspace portant F013 v2 est refusée — y compris à soldes nuls : un zéro transporté sans règle de continuité serait
 * un faux marqueur. Module pur, sans dépendance runtime.
 */
import { draftCarriesRentReconciliationV2 } from "./f013-v2-state";

export const F013_V2_CONTINUITY_NOT_SUPPORTED_CODE = "f013_v2_continuity_not_supported" as const;
export const F013_V2_CONTINUITY_NOT_SUPPORTED_MESSAGE =
  "Ce dossier contient un rapprochement des loyers (F013 v2) dont le report sur l'exercice suivant n'est pas encore pris en charge : la clôture est impossible pour l'instant. Aucune donnée n'a été modifiée.";

/** Workspace (ou toute forme portant `declarationDraft`) contenant une donnée F013 v2, à plat ou par bien. */
export function isF013V2ContinuityBlocked(
  workspace: { declarationDraft?: Parameters<typeof draftCarriesRentReconciliationV2>[0] } | null | undefined,
): boolean {
  return draftCarriesRentReconciliationV2(workspace?.declarationDraft);
}

/** Payload de snapshot transmis ou stocké (enveloppe `{ workspace }` ou workspace nu). Tolérant : forme illisible → faux. */
export function isF013V2ContinuityPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as { workspace?: unknown };
  const workspace = candidate.workspace && typeof candidate.workspace === "object" ? candidate.workspace : payload;
  return isF013V2ContinuityBlocked(workspace as { declarationDraft?: never });
}
