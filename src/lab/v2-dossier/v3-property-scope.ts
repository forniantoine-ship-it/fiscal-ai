import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, Property } from "@/lib/lmnp/types";
import { isAvailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import {
  resolveExternalOpeningProofFromFiscalYear, resolvePriorHistoryEligibility,
} from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { resolveBienDraftForRead } from "@/lib/lmnp/dossier/bien-draft";
import { resolveExerciseScope } from "@/lib/lmnp/dossier/property-scope";

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

/**
 * SUPPORT PRODUIT (distinct de la capacité de lecture) : `full` seulement si le bien vérifié est le seul de l'exercice
 * ET que ses données sont lisibles par BienDraft (legacy mono projeté, ou scopé `draft.biens`). Multi-bien, conflit ou
 * scope incohérent : `facts_only` — le parcours multi-bien n'est pas encore supporté.
 */
export function resolveV3PropertySupport(workspace: PersistedWorkspace, propertyId: string): V3PropertySupport {
  return resolveExerciseScope(workspace).kind === "mono" && resolveBienDraftForRead(workspace, propertyId).status === "resolved"
    ? "full" : "facts_only";
}

/**
 * R2A — source des champs du bien pour un read model en support `full` : legacy mono → le draft lui-même ; scopé →
 * exercice + `draft.biens[propertyId]`. Jamais un repli vers les champs à plat d'un dossier scopé.
 */
export function v3BienDraft(workspace: PersistedWorkspace, propertyId: string): DeclarationDraft | undefined {
  const read = resolveBienDraftForRead(workspace, propertyId);
  return read.status === "resolved" ? read.view : undefined;
}

/**
 * R2A — source des domaines F010–F014 des read models mono sans `propertyId` explicite : le bien unique résolu ;
 * exercice sans aucun bien (forme historique) → le draft de l'exercice, qui ne porte alors aucune donnée de bien
 * attribuable ; tout autre cas (multi, incohérent, conflit) → non supporté. Jamais le premier bien.
 */
export type V3MonoBienSource =
  | { kind: "bien"; propertyId: string; draft: DeclarationDraft | undefined }
  | { kind: "no_property"; draft: DeclarationDraft | undefined }
  | { kind: "unsupported" };

export function resolveV3MonoBienSource(workspace: PersistedWorkspace): V3MonoBienSource {
  const read = resolveBienDraftForRead(workspace);
  if (read.status === "resolved") return { kind: "bien", propertyId: read.propertyId, draft: read.view };
  if (read.status === "no_property" && workspace.declarationDraft?.biens === undefined) {
    return { kind: "no_property", draft: workspace.declarationDraft };
  }
  return { kind: "unsupported" };
}

/**
 * MB-MULTI-V3-READMODEL-1 — source des domaines F010–F014 du bien ACTIF d'un dossier multi-bien. Mono : inchangé
 * (`resolveV3MonoBienSource`). Multi : le bien actif doit être fourni explicitement (URL → scope vérifié) ; il est relu par
 * `resolveBienDraftForRead` (connu de l'exercice, non ambigu, BienDraft scopé lisible). Sans bien actif : `selection_required`
 * (jamais « le premier bien ») ; bien inconnu / étranger / illisible : `unsupported`. Les données lues sont celles de CE bien seul.
 */
export type V3ActiveBienSource = V3MonoBienSource | { kind: "selection_required" };

export function isMultiPropertyExercise(workspace: Pick<PersistedWorkspace, "properties" | "fiscalYear">): boolean {
  return workspace.properties.length > 1 || workspace.fiscalYear.propertyIds.length > 1;
}

export function resolveV3ActiveBienSource(workspace: PersistedWorkspace, activePropertyId?: string | null): V3ActiveBienSource {
  if (!isMultiPropertyExercise(workspace)) return resolveV3MonoBienSource(workspace);
  if (typeof activePropertyId !== "string" || !activePropertyId.trim()) return { kind: "selection_required" };
  const read = resolveBienDraftForRead(workspace, activePropertyId);
  return read.status === "resolved" ? { kind: "bien", propertyId: read.propertyId, draft: read.view } : { kind: "unsupported" };
}
