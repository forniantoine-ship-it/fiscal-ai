import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { Property } from "@/lib/lmnp/types";
import { isAvailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import {
  resolveExternalOpeningProofFromFiscalYear, resolvePriorHistoryEligibility,
} from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { propertyScopeFor } from "./correction-scope";

/**
 * R15.6 — résolution COMMUNE du bien pour les read models V3 de domaines du bien (Logement, Revenus, futurs Charges /
 * Amortissements). Extraite telle quelle de R15.5 (Logement), sans changement de comportement.
 *
 * Contrat R15.4 : `propertyId` explicite OBLIGATOIRE ; jamais de repli sur le premier bien de la liste. Les sorties
 * d'assistants actuelles n'ont pas de `propertyId` : elles ne sont attribuables au bien que s'il est le seul de l'exercice.
 */
export type V3PropertyScopeReason = "no_property_id" | "unknown_property" | "not_in_fiscal_year" | "ambiguous" | "no_property";

/** Situation d'entrée du bien — PROJECTION en lecture seule des données existantes, jamais persistée. */
export interface V3PropertyEntry {
  kind: "takeover" | "first_declaration" | "continuation" | "undetermined";
  /** Pourquoi « non déterminée » quand c'est le cas. */
  reason?: "not_attributable_to_property" | "answer_required" | "takeover_declared_not_validated" | "continuity_missing" | "claim_without_continuity";
  /** Reprise validée : actifs de l'Opening rattachés à CE bien / sans bien renseigné (jamais attribués). */
  openingAssets?: { attributed: number; unattributed: number };
}

export type V3PropertySupport = "full" | "facts_only";

/** Scope resolution, fail-closed. Never picks a property: it only verifies the one it is given. */
export function resolveV3PropertyScope(
  workspace: PersistedWorkspace,
  propertyId: string | null | undefined,
): { ok: true; property: Property } | { ok: false; reason: V3PropertyScopeReason } {
  if (typeof propertyId !== "string" || !propertyId.trim()) return { ok: false, reason: "no_property_id" };
  if (workspace.properties.length === 0) return { ok: false, reason: "no_property" };
  const matching = workspace.properties.filter(item => item.id === propertyId);
  const inYear = workspace.fiscalYear.propertyIds.filter(id => id === propertyId);
  if (matching.length > 1 || inYear.length > 1) return { ok: false, reason: "ambiguous" };
  if (matching.length === 0) return { ok: false, reason: "unknown_property" };
  if (inYear.length === 0) return { ok: false, reason: "not_in_fiscal_year" };
  return { ok: true, property: matching[0]! };
}

/** Projection en lecture seule de la situation d'entrée (existant : `resolvePriorHistoryEligibility`). */
export function projectV3PropertyEntry(workspace: PersistedWorkspace, propertyId: string, support: V3PropertySupport): V3PropertyEntry {
  if (support !== "full") return { kind: "undetermined", reason: "not_attributable_to_property" };
  const fiscalYear = workspace.fiscalYear;
  const eligibility = resolvePriorHistoryEligibility(fiscalYear, resolveExternalOpeningProofFromFiscalYear(fiscalYear));
  if (eligibility.eligible) {
    if (eligibility.status === "EXTERNAL_HISTORY") {
      const assets = fiscalYear.externalTakeoverOpening?.opening.assets;
      const list = assets && isAvailable(assets) ? assets.value : [];
      return {
        kind: "takeover",
        openingAssets: {
          attributed: list.filter(asset => asset.propertyId === propertyId).length,
          unattributed: list.filter(asset => !asset.propertyId).length,
        },
      };
    }
    return { kind: eligibility.status === "FIRST_REAL_YEAR" ? "first_declaration" : "continuation" };
  }
  switch (eligibility.reason) {
    case "ANSWER_REQUIRED": return { kind: "undetermined", reason: "answer_required" };
    case "EXTERNAL_HISTORY_DECLARED": return { kind: "undetermined", reason: "takeover_declared_not_validated" };
    case "FISCAL_AI_CLAIM_WITHOUT_CONTINUITY": return { kind: "undetermined", reason: "claim_without_continuity" };
    case "NATIVE_CONTINUITY_MISSING": return { kind: "undetermined", reason: "continuity_missing" };
  }
}

/** `full` : le bien vérifié est le seul de l'exercice (mêmes règles que `propertyScopeFor`). Sinon `facts_only`. */
export function resolveV3PropertySupport(workspace: PersistedWorkspace, propertyId: string): V3PropertySupport {
  const exerciseScope = propertyScopeFor(workspace.fiscalYear.propertyIds, workspace.properties);
  return exerciseScope?.kind === "required" && exerciseScope.propertyId === propertyId ? "full" : "facts_only";
}
