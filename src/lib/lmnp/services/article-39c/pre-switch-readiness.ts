/**
 * INT-4 — READINESS PRÉ-SWITCH (dormant) : « ce dossier est-il prêt pour le moteur 39 C exact ? » — sans l'utiliser.
 *
 * Étend le readiness exact INT-3 (F013 v2 définitif, F012 réconcilié, F011, F010, F014, qualifications, stocks, scope,
 * déduplication, moteur exact pour la matérialité) avec les conditions propres au futur switch :
 *  - stocks d'ouverture DÉMONTRÉS (autorité `opening-stocks`) ;
 *  - bilan F013 exact : créance ET avance de clôture VALIDÉES pour chaque bien (UNKNOWN / PROPOSED → pas prêt), sans
 *    contradiction avec une source bilan concurrente ;
 *  - ACTIVITY globale supportée (jamais de charge commune B / non résolue) ;
 *  - snapshot compatible (schéma ≥ v3 dès que le draft porte des données F013 v2 / qualifications) ;
 *  - domaine multi : l'ADR-011 productif bloque encore ARD historique / déficits / charges communes (garde INTACTE, listée
 *    dans `activationBlockers` — levée réservée à INT-5).
 *
 * READY ≠ ACTIVATION : un dossier peut être `readyForExact39c` alors que F006 productif utilise encore le proxy historique.
 * Aucun appelant productif, aucun calcul fiscal ici (la capacité C reste celle du moteur exact, appelé une seule fois).
 */
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { workspaceSnapshotSchemaVersion, WORKSPACE_SNAPSHOT_RENT_V2_SCHEMA_VERSION } from "@/lib/lmnp/store/workspace-snapshot";
import { resolveEffectiveBilanWithRentInventory, type RentBilanStatus } from "@/lib/lmnp/services/f013/v2/f013-v2-bilan-wiring";
import { projectRentalInventoryToBilan } from "@/lib/lmnp/services/f013/v2/f013-v2-rental-inventory";
import type { RentReconciliationV2State } from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";
import {
  buildConsolidatedArticle39cFromWorkspace,
  evaluateArticle39cReadiness,
  type Article39cOpeningStocks,
  type Article39cReadiness,
} from "./consolidation";
import { resolveWorkspaceIdentity } from "./workspace-sources";

export type PreSwitchStatus = "READY" | "READY_WITH_IMMATERIAL_UNCERTAINTY" | "NEEDS_QUALIFICATION" | "INVALID" | "OUT_OF_DOMAIN" | "RECONCILIATION_FAILURE";

export type PreSwitchCheck = { readonly id: string; readonly ok: boolean; readonly detail?: string };

export type PreSwitchReadiness = {
  readonly status: PreSwitchStatus;
  /** Vrai seulement pour READY / READY_WITH_IMMATERIAL_UNCERTAINTY. Ne signifie JAMAIS que F006 productif utilise le moteur exact. */
  readonly readyForExact39c: boolean;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly checks: readonly PreSwitchCheck[];
  readonly exact: Article39cReadiness;
  readonly bilan: { readonly status: RentBilanStatus | "NO_PROPERTY"; readonly conflicts: readonly string[]; readonly superseded: number };
  /** Garde productive ADR-011 encore en vigueur pour un dossier multi (levée = INT-5). */
  readonly activationBlockers: readonly string[];
  readonly consumption: "DORMANT";
  readonly productiveF006: "OLD_PROXY";
};

const has = (codes: readonly string[], ...wanted: string[]): boolean => wanted.some((w) => codes.includes(w));

export function evaluateArticle39cPreSwitchReadiness(input: {
  workspace: PersistedWorkspace;
  expectedDossierId: string;
  openingStocks?: Article39cOpeningStocks;
  /** Charges d'activité globales fournies hors store (structure dormante INT-3, jamais allouées). */
  activityLines?: readonly LigneCharge[];
}): PreSwitchReadiness {
  const { workspace } = input;
  const consolidated = buildConsolidatedArticle39cFromWorkspace({
    workspace,
    expectedDossierId: input.expectedDossierId,
    ...(input.openingStocks !== undefined ? { openingStocks: input.openingStocks } : {}),
    ...(input.activityLines !== undefined ? { activityLines: input.activityLines } : {}),
  });
  const exact = evaluateArticle39cReadiness(consolidated);
  const codes = [...consolidated.blockers.map((b) => b.code as string), ...consolidated.violations.map((v) => v.code as string)];

  // --- Bilan F013 : inventaire de clôture exact, sans conflit ---------------------------------------------------------
  const identity = resolveWorkspaceIdentity(workspace, input.expectedDossierId);
  const fiscalYear = workspace.fiscalYear.year;
  const propertyIds = identity.ok ? identity.propertyIds : [];
  const states: RentReconciliationV2State[] = identity.ok
    ? propertyIds.flatMap((id) => {
        const state = identity.biens[id]?.rentReconciliationV2;
        return state === undefined ? [] : [state];
      })
    : [];
  let bilanStatus: PreSwitchReadiness["bilan"]["status"] = "NO_PROPERTY";
  let bilanConflicts: string[] = [];
  let superseded = 0;
  if (propertyIds.length > 0) {
    const bilanInputs = workspace.declarationDraft?.bilanPatrimonial;
    if (bilanInputs !== undefined) {
      const effective = resolveEffectiveBilanWithRentInventory({ bilan: bilanInputs, fiscalYear, propertyIds, states });
      bilanStatus = effective.status;
      bilanConflicts = effective.conflicts.map((c) => c.code);
      superseded = effective.superseded.length;
    } else {
      // Pas de saisie bilan concurrente : seule la complétude de l'inventaire compte.
      const projection = projectRentalInventoryToBilan({ fiscalYear, propertyIds, states });
      bilanStatus = states.length === 0 ? "NOT_APPLICABLE" : projection.providedNatures.length === 2 ? "READY" : "INVENTORY_INCOMPLETE";
    }
  }
  const bilanOk = bilanStatus === "READY";

  const snapshotVersion = workspaceSnapshotSchemaVersion(workspace);
  const carriesV3Data = states.length > 0 || workspace.declarationDraft?.article39cActivityQualifications !== undefined || Object.values(identity.ok ? identity.biens : {}).some((b) => b.article39cQualifications !== undefined);
  const snapshotOk = !carriesV3Data || snapshotVersion >= WORKSPACE_SNAPSHOT_RENT_V2_SCHEMA_VERSION;

  const checks: PreSwitchCheck[] = [
    { id: "F013_V2_DEFINITIVE", ok: !has(codes, "F013_V2_NOT_PRESENT", "F013_V2_NOT_DEFINITIVE", "F013_V2_OUT_OF_DOMAIN", "F013_V2_CONFIRMATION_MISSING", "F013_V2_CONFIRMATION_STALE", "F013_V2_SCOPE_MISMATCH", "F013_V2_LEGACY_CONTRACT") && consolidated.byClassCents.L > 0 },
    { id: "F012_RECONCILED", ok: !has(codes, "F012_RECONCILIATION_MISMATCH", "F012_SOURCE_MISSING", "F012_NOT_CONFIRMED", "F012_DATE_MISE_EN_SERVICE_MISSING") },
    { id: "F011_VALID", ok: !has(codes, "F011_SOURCE_MISSING") },
    { id: "F010_COMPATIBLE", ok: !has(codes, "F010_SOURCE_MISSING") },
    { id: "F014_VALIDATED", ok: !has(codes, "F014_NOT_VALIDATED") },
    { id: "QUALIFICATIONS_FRESH", ok: !has(codes, "CFE_DIVERS_CONFLICT", "CHARGES_NATURE_NEEDS_REVIEW", "QUALIFICATION_WRONG_SCOPE") && exact.status !== "NEEDS_QUALIFICATION" },
    { id: "OPENING_STOCKS_KNOWN", ok: consolidated.openingStocks !== undefined && !has(codes, "OPENING_STOCKS_UNKNOWN", "OPENING_STOCKS_NOT_PROVIDED") },
    { id: "BILAN_F013_EXACT", ok: bilanOk, detail: bilanStatus },
    { id: "ACTIVITY_GLOBAL_SUPPORTED", ok: !has(codes, "COMMON_CHARGE_NOT_SUPPORTED") },
    { id: "NO_DUPLICATION", ok: !has(codes, "CFE_DIVERS_CONFLICT", "ACTIVITY_CHARGE_DUPLICATE_SUSPECTED", "DUPLICATE_PROPERTY") },
    { id: "NO_OUT_OF_DOMAIN", ok: exact.status !== "OUT_OF_DOMAIN" },
    { id: "SCOPE_CORRECT", ok: !has(codes, "CONSOLIDATION_SCOPE_VIOLATION", "QUALIFICATION_WRONG_SCOPE") && consolidated.violations.length === 0 },
    { id: "SNAPSHOT_COMPATIBLE", ok: snapshotOk, detail: `schema v${snapshotVersion}` },
  ];

  // Statut : on part du readiness exact ; le bilan et les stocks ne peuvent que le dégrader.
  let status: PreSwitchStatus;
  const reasons: string[] = [...exact.reasons];
  if (exact.status === "READY") {
    if (!bilanOk) {
      status = bilanStatus === "CONFLICT" ? "NEEDS_QUALIFICATION" : "INVALID";
      reasons.push(bilanStatus === "CONFLICT" ? "BILAN_RENTAL_CONFLICT" : "BILAN_RENTAL_INVENTORY_NOT_DEFINITIVE", ...bilanConflicts);
    } else if (!snapshotOk) {
      status = "INVALID";
      reasons.push("SNAPSHOT_SCHEMA_TOO_OLD");
    } else {
      status = exact.warnings.length > 0 ? "READY_WITH_IMMATERIAL_UNCERTAINTY" : "READY";
    }
  } else {
    status = exact.status;
    if (bilanStatus === "CONFLICT") reasons.push("BILAN_RENTAL_CONFLICT", ...bilanConflicts);
  }

  const activationBlockers: string[] = [];
  if (propertyIds.length > 1) {
    const stocks = consolidated.openingStocks;
    if (stocks?.kind === "PROVIDED") activationBlockers.push("ADR011_MULTI_BLOCKS_OPENING_STOCKS");
    if (consolidated.activityCents.ACTIVITY > 0) activationBlockers.push("ADR011_MULTI_BLOCKS_COMMON_CHARGES_UNTIL_GUARD_EVOLVES");
  }

  return {
    status,
    readyForExact39c: status === "READY" || status === "READY_WITH_IMMATERIAL_UNCERTAINTY",
    reasons: [...new Set(reasons)],
    warnings: exact.warnings,
    checks,
    exact,
    bilan: { status: bilanStatus, conflicts: bilanConflicts, superseded },
    activationBlockers,
    consumption: "DORMANT",
    productiveF006: "OLD_PROXY",
  };
}
