/**
 * MB-MULTI-DOMAIN-GUARD-1 — GARDE DE DOMAINE du multi-bien MVP (ADR-011). Module PUR, sans I/O, sans calcul fiscal.
 *
 * UNE source de vérité pour répondre à : « ce dossier multi-bien appartient-il au domaine supporté ? »
 *
 *   SUPPORTED                       — le domaine ADR-011 est respecté pour tout ce qui a pu être vérifié ;
 *   UNSUPPORTED(reasons[])          — au moins un motif STABLE (`MultiPropertyDomainReasonCode`), jamais de best effort ;
 *   NOT_MULTI                       — moins de 2 biens : hors du périmètre de cette garde (chemin mono historique).
 *
 * Domaine fiscal ≠ activation produit : la garde ne lit aucune capacité d'activation (`multi-property-activation.ts`).
 * Elle est consommée par la génération (workspace), la route Cerfa et la route aide 2042-C-PRO — jamais redéfinie ailleurs.
 *
 * Elle ne recalcule RIEN : elle lit des FAITS déjà établis (workspace, résultat F-006 déjà produit, RFS déjà assemblée) et les
 * motifs de blocage déjà produits par les seams existants (consolidation par bien). Un fait absent n'est PAS évalué
 * (`undefined`) : l'appelant déclare explicitement ce qu'il n'a pas pu établir (`unverifiable`), qui bloque lui aussi.
 */
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { PersistedWorkspace } from "../store/persistence";
import type { FiscalYear } from "../types/domain";
import { resolveDocumentScope } from "./property-scope";
import {
  resolveAllMultiPropertyAttestations,
  type MultiPropertyAttestationKind,
  type MultiPropertyAttestationState,
} from "./multi-property-attestations";
import { isMultiPropertyCapabilityOpen, isMultiPropertyRfs, type MultiPropertyCapabilities } from "./multi-property-activation";

// ---------------------------------------------------------------------------
// Codes de motif — STABLES (contrat produit, tests, support)
// ---------------------------------------------------------------------------

/** Les deux premiers conservent la valeur historique déjà émise par le moteur R2C.3b (G21/G22) : jamais renommés. */
export const MULTI_PROPERTY_39C_ALLOCATION_NOT_SUPPORTED = "multi_property_39c_allocation_not_supported" as const;
export const MULTI_PROPERTY_HISTORICAL_ARD_NOT_SUPPORTED = "multi_property_historical_ard_not_supported" as const;

export const MULTI_PROPERTY_DOMAIN_REASON_CODES = {
  /** Moins de 2 biens alors que le marqueur multi est posé (RFS incohérente) : fail-closed. */
  fewerThanTwoProperties: "multi_property_fewer_than_two_properties",
  regimeNotSupported: "multi_property_regime_not_supported",
  lmpNotSupported: "multi_property_lmp_not_supported",
  ssiNotSupported: "multi_property_ssi_not_supported",
  indirectHoldingNotSupported: "multi_property_indirect_holding_not_supported",
  notFirstYear: "multi_property_not_first_year",
  takeoverNotSupported: "multi_property_takeover_not_supported",
  openingNotSupported: "multi_property_opening_not_supported",
  priorDeficitNotSupported: "multi_property_prior_deficit_not_supported",
  historicalArdNotSupported: MULTI_PROPERTY_HISTORICAL_ARD_NOT_SUPPORTED,
  /** Dotation non intégralement déductible : ARD généré, allocation 39 C entre biens requise (TRF-0035 non établi). */
  allocation39cNotSupported: MULTI_PROPERTY_39C_ALLOCATION_NOT_SUPPORTED,
  commonChargesNotSupported: "multi_property_common_charges_not_supported",
  sharedLoanNotSupported: "multi_property_shared_loan_not_supported",
  serviceDateMissing: "multi_property_service_date_missing",
  unattributedDocument: "multi_property_unattributed_document",
  /** Attestation d'activité absente (ADR-011 §6) : jamais assimilée à une confirmation. */
  ssiAttestationMissing: "multi_property_ssi_attestation_missing",
  directHoldingAttestationMissing: "multi_property_direct_holding_attestation_missing",
  commonChargesAttestationMissing: "multi_property_common_charges_attestation_missing",
  /** Un fait requis par le domaine n'a pas pu être établi par l'appelant : jamais présumé favorable. */
  domainUnverifiable: "multi_property_domain_unverifiable",
} as const;

export type MultiPropertyDomainReasonCode = (typeof MULTI_PROPERTY_DOMAIN_REASON_CODES)[keyof typeof MULTI_PROPERTY_DOMAIN_REASON_CODES];

export type MultiPropertyDomainReason = { code: MultiPropertyDomainReasonCode; propertyId?: string; detail?: string };

export type MultiPropertyDomainVerdict =
  | { status: "NOT_MULTI" }
  | { status: "SUPPORTED" }
  | { status: "UNSUPPORTED"; reasons: MultiPropertyDomainReason[] };

// ---------------------------------------------------------------------------
// Faits
// ---------------------------------------------------------------------------

/** Motif de blocage déjà produit par un seam existant (consolidation par bien, génération). */
export type SeamBlock = { code: string; propertyId?: string };

/** Tous les champs sont optionnels : un fait non fourni n'est pas évalué ; `unverifiable` déclare ce qui n'a pas pu l'être. */
export type MultiPropertyDomainFacts = {
  propertyCount: number;
  regime?: string;
  activityType?: string;
  /** Indices POSITIFS d'antériorité (libellés d'indice) : prédécesseur, stocks d'ouverture, ouverture d'exercice, continuité… */
  priorYearIndicia?: readonly string[];
  /** Indices POSITIFS de reprise d'un historique externe. */
  takeoverIndicia?: readonly string[];
  /** Déficits antérieurs non encore imputés (stock d'OUVERTURE, jamais de clôture). */
  openingDeficits?: ReadonlyArray<{ millesime: number; montant: number }>;
  /** Stock d'amortissements réputés différés à l'OUVERTURE. */
  openingArd?: number;
  /** Déficit antérieur / ARD historique effectivement CONSOMMÉ dans le résultat F-006 déjà produit. */
  usedPriorDeficits?: number;
  usedHistoricalArd?: number;
  /** Amortissement non déduit de l'exercice (ARD généré) du résultat F-006 déjà produit. */
  generatedArd?: number;
  /** Motifs déjà produits par les seams (consolidation par bien) — traduits en motifs de domaine. */
  seamBlocks?: readonly SeamBlock[];
  /** Situations connues par ailleurs que les attestations (ex. indivision déclarée dans F009). */
  declared?: { lmp?: boolean; ssi?: boolean; indirectHolding?: boolean };
  /**
   * Attestations d'activité (ADR-011 §6). `absent` ⇒ refus (jamais une confirmation) ; `declared_out_of_domain` ⇒ situation hors
   * domaine. Non fournies (RFS : elle ne les porte pas) ⇒ non évaluées ici : la génération les a déjà exigées.
   */
  attestations?: Record<MultiPropertyAttestationKind, MultiPropertyAttestationState>;
  /** Faits requis non établis par l'appelant. */
  unverifiable?: readonly string[];
};

/** Traduction des motifs de blocage des seams existants vers les motifs de domaine (seuls ceux qui relèvent du domaine). */
const SEAM_BLOCK_TO_DOMAIN: Readonly<Record<string, MultiPropertyDomainReasonCode>> = {
  common_charges_not_supported: MULTI_PROPERTY_DOMAIN_REASON_CODES.commonChargesNotSupported,
  unsupported_shared_loan: MULTI_PROPERTY_DOMAIN_REASON_CODES.sharedLoanNotSupported,
  duplicate_loan_key: MULTI_PROPERTY_DOMAIN_REASON_CODES.sharedLoanNotSupported,
  service_date_missing: MULTI_PROPERTY_DOMAIN_REASON_CODES.serviceDateMissing,
  service_date_before_activity_start: MULTI_PROPERTY_DOMAIN_REASON_CODES.serviceDateMissing,
  unattributed_documents: MULTI_PROPERTY_DOMAIN_REASON_CODES.unattributedDocument,
  exercise_opening_not_attributable: MULTI_PROPERTY_DOMAIN_REASON_CODES.openingNotSupported,
  entry_mode_unknown: MULTI_PROPERTY_DOMAIN_REASON_CODES.takeoverNotSupported,
  [MULTI_PROPERTY_HISTORICAL_ARD_NOT_SUPPORTED]: MULTI_PROPERTY_DOMAIN_REASON_CODES.historicalArdNotSupported,
  [MULTI_PROPERTY_39C_ALLOCATION_NOT_SUPPORTED]: MULTI_PROPERTY_DOMAIN_REASON_CODES.allocation39cNotSupported,
};

/** Motif de domaine d'un motif de seam, ou `undefined` si ce motif n'est pas une question de domaine (donnée incomplète…). */
export function multiPropertyDomainReasonOfSeamBlock(code: string): MultiPropertyDomainReasonCode | undefined {
  return SEAM_BLOCK_TO_DOMAIN[code];
}

// ---------------------------------------------------------------------------
// Évaluateur — l'UNIQUE définition du domaine
// ---------------------------------------------------------------------------

const positive = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) && value > 0.005;

export function evaluateMultiPropertyDomain(facts: MultiPropertyDomainFacts): MultiPropertyDomainVerdict {
  if (facts.propertyCount < 2) return { status: "NOT_MULTI" };
  const reasons: MultiPropertyDomainReason[] = [];
  const push = (code: MultiPropertyDomainReasonCode, extra: { propertyId?: string; detail?: string } = {}) => {
    if (!reasons.some((reason) => reason.code === code && reason.propertyId === extra.propertyId && reason.detail === extra.detail)) {
      reasons.push({ code, ...extra });
    }
  };
  const C = MULTI_PROPERTY_DOMAIN_REASON_CODES;

  if (facts.regime !== undefined && facts.regime !== "reel") push(C.regimeNotSupported, { detail: facts.regime });
  if (facts.activityType !== undefined && facts.activityType !== "LMNP") push(C.lmpNotSupported, { detail: facts.activityType });
  if (facts.declared?.lmp) push(C.lmpNotSupported);
  if (facts.declared?.ssi) push(C.ssiNotSupported);
  if (facts.declared?.indirectHolding) push(C.indirectHoldingNotSupported);
  if (facts.attestations) {
    const { ssi, directHolding, noCommonCharges } = facts.attestations;
    if (ssi === "absent") push(C.ssiAttestationMissing);
    else if (ssi === "declared_out_of_domain") push(C.ssiNotSupported, { detail: "attestation" });
    if (directHolding === "absent") push(C.directHoldingAttestationMissing);
    else if (directHolding === "declared_out_of_domain") push(C.indirectHoldingNotSupported, { detail: "attestation" });
    if (noCommonCharges === "absent") push(C.commonChargesAttestationMissing);
    else if (noCommonCharges === "declared_out_of_domain") push(C.commonChargesNotSupported, { detail: "attestation" });
  }

  for (const indicium of facts.priorYearIndicia ?? []) push(C.notFirstYear, { detail: indicium });
  for (const indicium of facts.takeoverIndicia ?? []) push(C.takeoverNotSupported, { detail: indicium });

  if ((facts.openingDeficits ?? []).some((deficit) => positive(deficit.montant))) push(C.priorDeficitNotSupported, { detail: "opening" });
  if (positive(facts.usedPriorDeficits)) push(C.priorDeficitNotSupported, { detail: "imputed" });
  if (positive(facts.openingArd)) push(C.historicalArdNotSupported, { detail: "opening" });
  if (positive(facts.usedHistoricalArd)) push(C.historicalArdNotSupported, { detail: "used" });
  if (positive(facts.generatedArd)) push(C.allocation39cNotSupported);

  for (const block of facts.seamBlocks ?? []) {
    const code = SEAM_BLOCK_TO_DOMAIN[block.code];
    if (code !== undefined) push(code, block.propertyId !== undefined ? { propertyId: block.propertyId } : {});
  }
  for (const fact of facts.unverifiable ?? []) push(C.domainUnverifiable, { detail: fact });

  return reasons.length === 0 ? { status: "SUPPORTED" } : { status: "UNSUPPORTED", reasons };
}

// ---------------------------------------------------------------------------
// Extraction de faits — workspace (avant génération)
// ---------------------------------------------------------------------------

type DomainWorkspace = Pick<PersistedWorkspace, "properties" | "fiscalYear" | "documents" | "declarationDraft">;

/** Entrées d'ouverture transmises par l'appelant de génération (même vocabulaire que `WorkspaceGenerationOptions`). */
export type MultiPropertyOpeningInputs = {
  stocksOuverture?: { deficits?: ReadonlyArray<{ millesime: number; montant: number }>; amortissementsReportes?: number };
  continuity?: { immobilisationsOuverture?: unknown; repriseHistoriqueEnContinuite?: unknown; previousFiscalYearId?: unknown; continuiteNativeVerifiee?: unknown };
  fiscalYearOpening?: unknown;
};

function priorYearIndicia(fiscalYear: FiscalYear, inputs: MultiPropertyOpeningInputs): string[] {
  const indicia: string[] = [];
  if (fiscalYear.previousFiscalYearId) indicia.push("previousFiscalYearId");
  if (fiscalYear.stocksOuverture !== undefined) indicia.push("fiscalYear.stocksOuverture");
  if (fiscalYear.immobilisationsOuverture !== undefined) indicia.push("fiscalYear.immobilisationsOuverture");
  if (fiscalYear.continuiteNativeVerifiee) indicia.push("fiscalYear.continuiteNativeVerifiee");
  if (fiscalYear.priorHistoryDeclaration?.status === "FISCAL_AI_PREVIOUS") indicia.push("priorHistoryDeclaration=FISCAL_AI_PREVIOUS");
  if (inputs.stocksOuverture !== undefined) indicia.push("options.stocksOuverture");
  if (inputs.continuity?.previousFiscalYearId) indicia.push("options.continuity.previousFiscalYearId");
  if (inputs.continuity?.continuiteNativeVerifiee) indicia.push("options.continuity.continuiteNativeVerifiee");
  if (inputs.continuity?.immobilisationsOuverture) indicia.push("options.continuity.immobilisationsOuverture");
  return indicia;
}

function takeoverIndicia(fiscalYear: FiscalYear, inputs: MultiPropertyOpeningInputs): string[] {
  const indicia: string[] = [];
  if (fiscalYear.externalTakeoverOpening) indicia.push("fiscalYear.externalTakeoverOpening");
  if (fiscalYear.repriseHistoriqueEnContinuite) indicia.push("fiscalYear.repriseHistoriqueEnContinuite");
  if (fiscalYear.priorHistoryDeclaration?.status === "EXTERNAL_HISTORY") indicia.push("priorHistoryDeclaration=EXTERNAL_HISTORY");
  if (inputs.fiscalYearOpening !== undefined) indicia.push("options.fiscalYearOpening");
  if (inputs.continuity?.repriseHistoriqueEnContinuite) indicia.push("options.continuity.repriseHistoriqueEnContinuite");
  return indicia;
}

/**
 * Faits du domaine lisibles AVANT tout calcul, depuis le workspace et les ouvertures fournies à la génération. Le stock
 * d'ouverture évalué est celui qui alimenterait F-006 (`inputs.stocksOuverture` prioritaire, sinon celui de l'exercice) :
 * il n'est ni reconstruit ni déduit d'une clôture. Les faits que seuls les seams de consolidation savent établir
 * (charges communes, prêt partagé, dates de mise en service) arrivent par `seamBlocks`.
 */
export function multiPropertyDomainFactsFromWorkspace(
  workspace: DomainWorkspace,
  inputs: MultiPropertyOpeningInputs = {},
  extra: Pick<MultiPropertyDomainFacts, "seamBlocks" | "generatedArd" | "usedPriorDeficits" | "usedHistoricalArd"> = {},
): MultiPropertyDomainFacts {
  const fiscalYear = workspace.fiscalYear;
  const stocks = inputs.stocksOuverture ?? fiscalYear.stocksOuverture?.stocks;
  const propertyIds = new Set([...fiscalYear.propertyIds, ...Object.keys(workspace.declarationDraft?.biens ?? {})]);
  const unattributed = workspace.documents.some((document) => resolveDocumentScope(workspace, document).kind === "unresolved");
  return {
    propertyCount: propertyIds.size,
    regime: fiscalYear.regime,
    ...(workspace.declarationDraft?.activityType !== undefined ? { activityType: workspace.declarationDraft.activityType } : {}),
    priorYearIndicia: priorYearIndicia(fiscalYear, inputs),
    takeoverIndicia: takeoverIndicia(fiscalYear, inputs),
    openingDeficits: stocks?.deficits ?? [],
    openingArd: stocks?.amortissementsReportes ?? 0,
    seamBlocks: [...(extra.seamBlocks ?? []), ...(unattributed ? [{ code: "unattributed_documents" }] : [])],
    attestations: resolveAllMultiPropertyAttestations(workspace.declarationDraft?.multiPropertyAttestations),
    ...(workspace.declarationDraft?.indivision === true ? { declared: { indirectHolding: true } } : {}),
    ...(extra.generatedArd !== undefined ? { generatedArd: extra.generatedArd } : {}),
    ...(extra.usedPriorDeficits !== undefined ? { usedPriorDeficits: extra.usedPriorDeficits } : {}),
    ...(extra.usedHistoricalArd !== undefined ? { usedHistoricalArd: extra.usedHistoricalArd } : {}),
  };
}

/** Faits issus d'un résultat F-006 DÉJÀ produit (lecture seule, aucun recalcul). */
export function multiPropertyDomainFactsOfFiscalResult(
  fiscalResult: Pick<FiscalResult, "amortNonDeduitExercice" | "amortReportesUtilises" | "deficitsImputes">,
): Pick<MultiPropertyDomainFacts, "generatedArd" | "usedHistoricalArd" | "usedPriorDeficits"> {
  return {
    generatedArd: fiscalResult.amortNonDeduitExercice,
    usedHistoricalArd: fiscalResult.amortReportesUtilises,
    usedPriorDeficits: fiscalResult.deficitsImputes,
  };
}

// ---------------------------------------------------------------------------
// Extraction de faits — RFS (livraison : Cerfa, aide 2042-C-PRO)
// ---------------------------------------------------------------------------

/** Marqueur intrinsèque multi d'une RFS (`isMultiPropertyRfs` : `immobilisationsParBien` défini, contrat R2C.3a/3b) — une seule définition. */
export function isMultiPropertyRfsShape(rfs: unknown): rfs is FiscalRepresentation {
  return isMultiPropertyRfs(rfs);
}

/**
 * Faits du domaine qu'une RFS peut établir par elle-même. Ce qu'une RFS ne porte pas (première année, reprise, charges communes,
 * dates de mise en service) est garanti par la génération (garde appliquée avant toute RFS multi) et par le snapshot serveur ;
 * la RFS ne rejoue donc que ce qu'elle expose, et déclare `unverifiable` ce qui lui manque pour établir le stock d'ouverture.
 */
export function multiPropertyDomainFactsFromRfs(rfs: FiscalRepresentation): MultiPropertyDomainFacts {
  const parBien = rfs.immobilisationsParBien ?? [];
  const opening = rfs.deficitsOuverture;
  const unverifiable: string[] = [];
  if (opening === undefined) unverifiable.push("rfs.deficitsOuverture");
  return {
    propertyCount: new Set(parBien.map((bloc) => bloc.propertyId)).size,
    openingDeficits: opening?.deficits ?? [],
    ...multiPropertyDomainFactsOfFiscalResult(rfs.fiscalResult),
    ...(opening !== undefined && opening.source !== "none" ? { priorYearIndicia: [`rfs.deficitsOuverture.source=${opening.source}`] } : {}),
    ...(unverifiable.length > 0 ? { unverifiable } : {}),
  };
}

// ---------------------------------------------------------------------------
// Admission à la LIVRAISON (Cerfa, aide 2042-C-PRO) — capacité + domaine, deux questions distinctes
// ---------------------------------------------------------------------------

export type MultiPropertyDeliveryAdmission =
  | { allowed: true }
  | { allowed: false; reason: "multi_property_not_enabled" }
  | { allowed: false; reason: "multi_property_domain_unsupported"; domainReasons: MultiPropertyDomainReason[] };

/**
 * Admission d'une RFS à la livraison (route Cerfa ET route aide 2042-C-PRO : MÊME fonction, MÊME garde de domaine).
 *   1. mono (pas de marqueur multi) → autorisé, chemin historique inchangé ;
 *   2. capacité de LIVRAISON multi fermée → `multi_property_not_enabled` (activation produit) ;
 *   3. capacité ouverte mais domaine non SUPPORTED → `multi_property_domain_unsupported` (+ motifs stables).
 * Fail-closed : une RFS à marqueur multi dont le nombre de biens est < 2 est refusée.
 */
export function resolveMultiPropertyDeliveryAdmission(
  rfs: unknown,
  capabilities?: MultiPropertyCapabilities,
): MultiPropertyDeliveryAdmission {
  if (!isMultiPropertyRfsShape(rfs)) return { allowed: true };
  if (!isMultiPropertyCapabilityOpen("delivery", capabilities)) return { allowed: false, reason: "multi_property_not_enabled" };
  const verdict = evaluateMultiPropertyDomain(multiPropertyDomainFactsFromRfs(rfs));
  if (verdict.status === "SUPPORTED") return { allowed: true };
  const domainReasons: MultiPropertyDomainReason[] =
    verdict.status === "UNSUPPORTED" ? verdict.reasons : [{ code: MULTI_PROPERTY_DOMAIN_REASON_CODES.fewerThanTwoProperties }];
  return { allowed: false, reason: "multi_property_domain_unsupported", domainReasons };
}
