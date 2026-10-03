/**
 * MB-MULTI-PAYMENT-WIRING-1 — ADMISSION AU PAIEMENT d'un dossier multi-bien (checkout serveur). Même modèle que les admissions
 * génération et livraison : capacités + garde de domaine ADR-011 + aptitude à livrer, deux questions distinctes, aucune définition
 * parallèle.
 *
 * Le paiement reste au niveau (dossier, exercice) : cette admission ne crée AUCUN moteur, prix, ligne ni identité de paiement propre au
 * multi — elle décide seulement si le checkout MONO EXISTANT peut être atteint. Elle est évaluée sur le snapshot SERVEUR (jamais un
 * booléen client), AVANT toute ligne et toute session Stripe : on n'encaisse jamais un dossier déjà connu comme non livrable.
 *
 *   1. pas de snapshot multi (mono, scoped mono, absence de ligne) → autorisé, chemin historique inchangé ;
 *   2. capacités `payment` ET `generation` ET `delivery` toutes ouvertes, sinon `multi_property_not_enabled` ;
 *   3. snapshot lisible et de l'exercice demandé, sinon `multi_property_domain_unverifiable` (jamais présumé favorable) ;
 *   4. la GATE de génération (la définition unique : capacité génération ∧ domaine ADR-011 avant calcul ∧ preview réellement généré ∧
 *      readiness technique) admet la génération. Le preview est le moteur déterministe réel appliqué au snapshot — pas une prédiction :
 *      les motifs que seul le calcul établit (ARD généré / 39 C) sont donc connus AVANT le paiement.
 * Ouvrir `payment` n'est JAMAIS un entitlement : `paid` reste exigé par la livraison.
 */
import {
  MULTI_PROPERTY_CAPABILITIES,
  isMultiPropertyCapabilityOpen,
  isMultiPropertySnapshotRow,
  type MultiPropertyCapabilities,
} from "@/lib/lmnp/dossier/multi-property-activation";
import {
  MULTI_PROPERTY_DOMAIN_REASON_CODES,
  resolveMultiPropertyGenerationAdmission,
} from "@/lib/lmnp/dossier/multi-property-domain";
import { resolveDeclarationGenerationGate } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import {
  resolveExternalOpeningProofFromFiscalYear,
  resolvePersistedExternalTakeoverOpening,
  resolvePriorHistoryEligibility,
} from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import type { ReadServerSnapshot } from "../server-workspace-snapshot";

export type MultiPropertyPaymentAdmission =
  | { allowed: true }
  | { allowed: false; reason: "multi_property_not_enabled" }
  | { allowed: false; reason: "multi_property_domain_unsupported"; domainReasons: string[] }
  | { allowed: false; reason: "multi_property_not_payable"; blockingReasons: string[] };

type GateInput = Parameters<typeof resolveDeclarationGenerationGate>[0];
type SnapshotWorkspace = NonNullable<GateInput["workspace"]>;

function workspaceOfPayload(payload: unknown): SnapshotWorkspace | null {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as { workspace?: unknown };
  const candidate = (envelope.workspace && typeof envelope.workspace === "object" ? envelope.workspace : payload) as Partial<SnapshotWorkspace>;
  const fiscalYear = candidate.fiscalYear;
  if (!fiscalYear || typeof fiscalYear !== "object" || typeof fiscalYear.year !== "number") return null;
  if (!Array.isArray(candidate.properties) || !Array.isArray(candidate.documents)) return null;
  return candidate as SnapshotWorkspace;
}

const unverifiable = (detail: string): MultiPropertyPaymentAdmission => ({
  allowed: false,
  reason: "multi_property_domain_unsupported",
  domainReasons: [MULTI_PROPERTY_DOMAIN_REASON_CODES.domainUnverifiable, detail],
});

export async function resolveMultiPropertyPaymentAdmission(
  read: ReadServerSnapshot,
  input: { dossierId: string; fiscalYear: number },
  capabilities: MultiPropertyCapabilities = MULTI_PROPERTY_CAPABILITIES,
): Promise<MultiPropertyPaymentAdmission> {
  const row = await read(input.dossierId, input.fiscalYear);
  if (!isMultiPropertySnapshotRow(row)) return { allowed: true };

  for (const capability of ["payment", "generation", "delivery"] as const) {
    if (!isMultiPropertyCapabilityOpen(capability, capabilities)) return { allowed: false, reason: "multi_property_not_enabled" };
  }

  const workspace = row ? workspaceOfPayload(row.payload) : null;
  if (!workspace) return unverifiable("snapshot_unreadable");
  if (workspace.fiscalYear.year !== input.fiscalYear) return unverifiable("snapshot_other_fiscal_year");

  const { fiscalYear, properties, declarationDraft: draft } = workspace;
  const openingInputs = {
    stocksOuverture: fiscalYear.stocksOuverture?.stocks,
    continuity: resolveImmobilisationsContinuityForGeneration({
      draft,
      properties,
      propertyIds: fiscalYear.propertyIds ?? [],
      immobilisationsOuverture: fiscalYear.immobilisationsOuverture,
      repriseHistoriqueEnContinuite: fiscalYear.repriseHistoriqueEnContinuite,
      previousFiscalYearId: fiscalYear.previousFiscalYearId,
      continuiteNativeVerifiee: fiscalYear.continuiteNativeVerifiee,
    }),
    fiscalYearOpening: resolvePersistedExternalTakeoverOpening(fiscalYear),
  };

  // Même éligibilité d'antériorité que l'écran de validation : tout appelant de la porte qui décide d'un paiement DOIT la fournir
  // (jamais de fail-open). Le checkout applique ensuite SA propre éligibilité, établie côté serveur depuis les lignes de paiement.
  const priorHistory = resolvePriorHistoryEligibility(fiscalYear, resolveExternalOpeningProofFromFiscalYear(fiscalYear));
  const gate = resolveDeclarationGenerationGate({
    draft,
    properties,
    fiscalYear: fiscalYear.year,
    paid: false,
    generated: false,
    priorHistory,
    ...openingInputs,
    workspace,
    multiPropertyCapabilities: capabilities,
  });
  if (gate.canGenerate) return { allowed: true };

  const admission = resolveMultiPropertyGenerationAdmission(workspace, openingInputs, capabilities);
  if (!admission.allowed && admission.reason === "multi_property_domain_unsupported") {
    return { allowed: false, reason: "multi_property_domain_unsupported", domainReasons: [...new Set(admission.domainReasons.map((reason) => reason.code))] };
  }
  const blocking = [...new Set([
    ...(priorHistory.eligible ? [] : ["prior_history_not_eligible"]),
    ...(gate.workspaceReadiness?.blockingReasons ?? []).map((reason) => reason.code),
  ])];
  return { allowed: false, reason: "multi_property_not_payable", blockingReasons: blocking };
}
