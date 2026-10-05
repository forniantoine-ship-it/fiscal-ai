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
import { describeRentalBilanOwnership, resolveEffectiveBilanWithRentInventory, type RentalBilanOwnership, type RentBilanStatus } from "@/lib/lmnp/services/f013/v2/f013-v2-bilan-wiring";
import { resolveNoAllocationChargesAttestation, type NoAllocationChargesState } from "@/lib/lmnp/dossier/multi-property-attestations";
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
  readonly bilan: {
    readonly status: RentBilanStatus | "NO_PROPERTY";
    readonly conflicts: readonly string[];
    readonly superseded: number;
    /** Propriétaire des faits locatifs (F013 v2), sources concurrentes identifiées, plan de switch du bucket (jamais exécuté). */
    readonly ownership: RentalBilanOwnership;
  };
  /** Domaine exact multi (INT-4.1) : stocks globaux, ARD générée, attestation « aucune charge à répartir ». */
  readonly multi: { readonly applicable: boolean; readonly attestation: NoAllocationChargesState | "NOT_APPLICABLE" };
  /**
   * Éléments propres au SWITCH (INT-5), jamais des défauts du dossier : le calcul productif est encore le proxy historique,
   * son garde de domaine ADR-011 et le libellé productif de l'attestation restent en vigueur jusqu'au switch.
   */
  readonly switchBoundItems: readonly string[];
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
  let ownership: RentalBilanOwnership = { owner: "NOT_APPLICABLE", ownedNatures: [], competing: [], switchPlans: [] };
  if (propertyIds.length > 0) {
    const bilanInputs = workspace.declarationDraft?.bilanPatrimonial;
    if (bilanInputs !== undefined) {
      const effective = resolveEffectiveBilanWithRentInventory({ bilan: bilanInputs, fiscalYear, propertyIds, states });
      bilanStatus = effective.status;
      bilanConflicts = effective.conflicts.map((c) => c.code);
      superseded = effective.superseded.length;
      ownership = describeRentalBilanOwnership({ bilan: bilanInputs, fiscalYear, propertyIds, states });
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

  // --- Domaine exact multi (INT-4.1) : stocks globaux, pas d'ARD générée à répartir, attestation ----------------------------
  const multi = propertyIds.length > 1;
  const stocksNow = consolidated.openingStocks;
  const stockNonZero = stocksNow?.kind === "PROVIDED" && (stocksNow.historicalArdStock > 0 || stocksNow.priorDeficits.length > 0);
  const stocksGlobalOk = !multi || !stockNonZero || (stocksNow?.kind === "PROVIDED" && stocksNow.scope === "ACTIVITY_GLOBAL");
  const generatedArd = (exact.engine?.figures?.ardNouvelle ?? 0) > 0;
  const noAllocationOk = !multi || !generatedArd;
  const attestation: NoAllocationChargesState | "NOT_APPLICABLE" = multi ? resolveNoAllocationChargesAttestation(workspace.declarationDraft?.multiPropertyAttestations) : "NOT_APPLICABLE";

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
    { id: "MULTI_STOCKS_GLOBAL", ok: stocksGlobalOk, detail: multi ? "ARD et déficits d'ouverture : stocks de l'activité consolidée, jamais répartis" : "mono" },
    { id: "MULTI_NO_GENERATED_ARD_ALLOCATION", ok: noAllocationOk, detail: multi ? "TRF-0035 non établi : une ARD générée exigerait un suivi par bien" : "mono" },
    { id: "MULTI_NO_ALLOCATION_ATTESTATION", ok: !multi || attestation === "confirmed", detail: attestation },
  ];

  // Statut : on part du readiness exact ; bilan, snapshot et domaine multi ne peuvent que le dégrader.
  // Sévérité : OUT_OF_DOMAIN > INVALID > NEEDS_QUALIFICATION.
  let status: PreSwitchStatus;
  const reasons: string[] = [...exact.reasons];
  if (exact.status === "READY") {
    const degradations: Array<{ status: "OUT_OF_DOMAIN" | "INVALID" | "NEEDS_QUALIFICATION"; reasons: string[] }> = [];
    if (!bilanOk) degradations.push(bilanStatus === "CONFLICT" ? { status: "NEEDS_QUALIFICATION", reasons: ["BILAN_RENTAL_CONFLICT", ...bilanConflicts] } : { status: "INVALID", reasons: ["BILAN_RENTAL_INVENTORY_NOT_DEFINITIVE"] });
    if (!snapshotOk) degradations.push({ status: "INVALID", reasons: ["SNAPSHOT_SCHEMA_TOO_OLD"] });
    if (!stocksGlobalOk) degradations.push({ status: "OUT_OF_DOMAIN", reasons: ["OPENING_STOCK_REQUIRES_PROPERTY_ALLOCATION"] });
    if (!noAllocationOk) degradations.push({ status: "OUT_OF_DOMAIN", reasons: ["GENERATED_ARD_REQUIRES_PROPERTY_ALLOCATION"] });
    if (multi && attestation === "absent") degradations.push({ status: "INVALID", reasons: ["NO_ALLOCATION_ATTESTATION_MISSING"] });
    if (multi && attestation === "legacy_declared_common") degradations.push({ status: "NEEDS_QUALIFICATION", reasons: ["NO_ALLOCATION_ATTESTATION_TO_REANSWER"] });
    if (multi && attestation === "declared_requires_allocation") degradations.push({ status: "OUT_OF_DOMAIN", reasons: ["CHARGES_REQUIRE_ALLOCATION_DECLARED"] });
    const rank = { OUT_OF_DOMAIN: 3, INVALID: 2, NEEDS_QUALIFICATION: 1 } as const;
    const worst = degradations.reduce<(typeof degradations)[number] | undefined>((a, d) => (a === undefined || rank[d.status] > rank[a.status] ? d : a), undefined);
    for (const d of degradations) reasons.push(...d.reasons);
    status = worst !== undefined ? worst.status : exact.warnings.length > 0 ? "READY_WITH_IMMATERIAL_UNCERTAINTY" : "READY";
  } else {
    status = exact.status;
    if (bilanStatus === "CONFLICT") reasons.push("BILAN_RENTAL_CONFLICT", ...bilanConflicts);
  }

  const switchBoundItems: string[] = ["PRODUCTIVE_F006_STILL_OLD_PROXY", "F013_V2_GLOBAL_FLAG_OFF"];
  if (multi) switchBoundItems.push("ADR011_PRODUCTIVE_MULTI_DOMAIN_GUARD_TO_EVOLVE_AT_SWITCH", "PRODUCTIVE_NO_COMMON_CHARGES_WORDING_TO_REPLACE_AT_SWITCH");
  if (ownership.switchPlans.length > 0) switchBoundItems.push("TIERS_BUCKET_REPLACEMENT_PLAN_APPLIES_AT_SWITCH");

  return {
    status,
    readyForExact39c: status === "READY" || status === "READY_WITH_IMMATERIAL_UNCERTAINTY",
    reasons: [...new Set(reasons)],
    warnings: exact.warnings,
    checks,
    exact,
    bilan: { status: bilanStatus, conflicts: bilanConflicts, superseded, ownership },
    multi: { applicable: multi, attestation },
    switchBoundItems,
    consumption: "DORMANT",
    productiveF006: "OLD_PROXY",
  };
}
