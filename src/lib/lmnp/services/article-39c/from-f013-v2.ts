/**
 * INT-1 — adapter PUR F013 v2 → contribution `L` (article 39 C).
 *
 * L'autorité de calcul reste `evaluateRentReconciliation` / `reconcileRentV2` (TRF-0036) : aucune formule ici. Une
 * contribution `L` n'est produite que si le moteur conclut `SUPPORTED` (faits requis VALIDATED, couverture validée,
 * exceptions revues, aucun hors-domaine, bien et exercice concordants) ET si la confirmation est présente et fraîche
 * (révision, empreinte des faits, total concordants). Montant : uniquement `loyersAcquisCents`.
 *
 * Jamais utilisés : encaissements bruts, transactions, observations OCR, loyers théoriques, calendrier, F013 v1,
 * `totalRecettes`. Un état non définitif ne produit JAMAIS `L = 0` : il retourne un état bloqué explicite.
 *
 * NON BRANCHÉ à F006 (INT-1).
 */
import {
  evaluateRentReconciliation,
  parseRentReconciliationState,
  factsDigest,
  type RentReconciliationV2State,
} from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import { classifyF013Contract, F013_V2_CONTRACT_VERSION } from "@/lib/lmnp/services/f013/v2/f013-v2-contract";
import {
  contributionId,
  type Article39cAdapterBlocker,
  type Article39cBlockerCode,
  type Article39cContribution,
} from "./contribution";

export type F013V2RentAdapterInput = {
  /** Dossier attendu par l'appelant. */
  dossierId: string;
  /** Dossier dont l'état a été chargé (fourni par le chargeur de workspace). Doit concorder. */
  stateDossierId: string;
  propertyId: string;
  fiscalYear: number;
  /** État brut (parse défensif) : `undefined` = absent ; une sortie F013 v1 n'est jamais acceptée. */
  state: unknown;
};

export type F013V2RentAdapterResult =
  | { status: "DEFINITIVE"; contribution: Article39cContribution; blockers: readonly [] }
  | { status: "NOT_DEFINITIVE" | "OUT_OF_DOMAIN" | "NOT_PRESENT"; contribution?: undefined; blockers: readonly Article39cAdapterBlocker[] };

function blocked(
  status: "NOT_DEFINITIVE" | "OUT_OF_DOMAIN" | "NOT_PRESENT",
  code: Article39cBlockerCode,
  sourceId: string,
  message: string,
): F013V2RentAdapterResult {
  return { status, blockers: [{ code, sourceId, message }] };
}

export function adaptF013V2ToArticle39cRent(input: F013V2RentAdapterInput): F013V2RentAdapterResult {
  const sourceId = `rentReconciliationV2:${input.propertyId}:${input.fiscalYear}`;

  if (input.dossierId !== input.stateDossierId) {
    return blocked("NOT_DEFINITIVE", "DOSSIER_MISMATCH", sourceId, "État F013 v2 chargé depuis un autre dossier : jamais utilisé.");
  }
  if (input.state === undefined || input.state === null) {
    return blocked("NOT_PRESENT", "F013_V2_NOT_PRESENT", sourceId, "Aucun rapprochement F013 v2 : L inconnu, jamais assimilé à zéro.");
  }
  // Une sortie F013 v1 (`totalRecettes`, `loyersEncaisses`) n'est jamais un L exact.
  if (classifyF013Contract((input.state as { facts?: unknown })?.facts ?? input.state) !== F013_V2_CONTRACT_VERSION) {
    return blocked("NOT_DEFINITIVE", "F013_V2_LEGACY_CONTRACT", sourceId, "Contrat F013 non v2 (encaissements) : pas un L exact.");
  }
  const state: RentReconciliationV2State | null = parseRentReconciliationState(input.state);
  if (state === null) {
    return blocked("NOT_DEFINITIVE", "F013_V2_LEGACY_CONTRACT", sourceId, "État F013 v2 illisible : jamais reconstruit.");
  }
  if (state.facts.fiscalYear !== input.fiscalYear) {
    return blocked("NOT_DEFINITIVE", "FISCAL_YEAR_MISMATCH", sourceId, `Exercice ${state.facts.fiscalYear} présenté pour ${input.fiscalYear}.`);
  }
  if (state.facts.propertyId !== input.propertyId) {
    return blocked("NOT_DEFINITIVE", "F013_V2_SCOPE_MISMATCH", sourceId, `Faits du bien « ${state.facts.propertyId} » présentés pour « ${input.propertyId} ».`);
  }

  const evaluation = evaluateRentReconciliation(state, { propertyId: input.propertyId, fiscalYear: input.fiscalYear });
  const { result } = evaluation;

  if (result.status === "OUT_OF_DOMAIN") {
    return {
      status: "OUT_OF_DOMAIN",
      blockers: [
        {
          code: "F013_V2_OUT_OF_DOMAIN",
          sourceId,
          message: `Hors domaine F013 v2 : ${result.reasons.map((r) => r.treatment ?? r.code).join(", ")}.`,
        },
      ],
    };
  }
  if (result.status !== "SUPPORTED") {
    return {
      status: "NOT_DEFINITIVE",
      blockers: [
        {
          code: "F013_V2_NOT_DEFINITIVE",
          sourceId,
          message: `Rapprochement non définitif : ${result.reasons.map((r) => r.code).join(", ")}. Aucun L (jamais 0).`,
        },
      ],
    };
  }
  if (state.confirmation === undefined) {
    return blocked("NOT_DEFINITIVE", "F013_V2_CONFIRMATION_MISSING", sourceId, "Rapprochement calculable mais non confirmé : aucun L définitif.");
  }
  if (!evaluation.confirmationFresh) {
    return blocked(
      "NOT_DEFINITIVE",
      "F013_V2_CONFIRMATION_STALE",
      sourceId,
      "Confirmation périmée (révision, empreinte ou total divergents) : aucun L définitif.",
    );
  }

  return {
    status: "DEFINITIVE",
    blockers: [],
    contribution: {
      contributionId: contributionId("F013_V2_RENT_RECONCILIATION", sourceId, "L"),
      source: "F013_V2_RENT_RECONCILIATION",
      sourceId,
      fiscalYear: input.fiscalYear,
      amountCents: result.loyersAcquisCents,
      class: "L",
      proofLevel: "DIRECT",
      provenance: `f013_v2:confirmed:r${state.facts.revision}`,
      ruleId: "SAV-034/TRF-0036:loyers_acquis",
      reason: "Loyers acquis N = E + CC − CO + AO − AC (moteur F013 v2 unique), confirmation fraîche.",
      scope: { level: "PROPERTY", propertyId: input.propertyId },
      qualificationStatus: "VALIDATED",
      sourceFingerprint: factsDigest(state.facts),
      sourceRevision: state.facts.revision,
      dedupeKey: `L:${input.propertyId}:${input.fiscalYear}`,
    },
  };
}
