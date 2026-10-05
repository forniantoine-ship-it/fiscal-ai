/**
 * INT-3 — adapter PUR F010 (frais d'acquisition du bien) → contribution article 39 C.
 *
 * Faits sources (persistés par bien) :
 *  - `logementAmortissement.fraisEnCharges` : frais déduits immédiatement (0 si intégrés au prix de revient) ;
 *  - `logementAssistantState.choixTraitementFrais` / `fraisNotaire` : choix de traitement (JUG-001) et montant.
 *
 * Capitalisés (intégrés au prix de revient) → `EXCLUDED` de B : ils passent par l'immobilisation / l'amortissement.
 * Immédiatement déduits → `NEEDS_QUALIFICATION` tant que B vs ACTIVITY n'est pas fermé par le Knowledge (SAV-031).
 * Traitement inconnu → `NEEDS_QUALIFICATION`. JUG-001 n'est PAS une preuve fiscale de classe : il fournit un FAIT.
 *
 * Absence de F010, exercice non prouvé ou différent : blocage explicite (jamais « aucun frais »). Les frais déjà traités
 * les années précédentes (`fraisAcquisitionHistoriques`) ne sont pas une source de l'exercice : aucune contribution.
 *
 * NON BRANCHÉ à F006 (INT-3).
 */
import { toCents } from "@/runtime/capabilities/f006/cents";
import type { LogementAmortissementOutput } from "@/lib/lmnp/types/domain";
import {
  sortContributions,
  type Article39cAdapterBlocker,
  type Article39cAdapterResult,
  type Article39cContribution,
} from "./contribution";
import { qualifyAcquisitionCost, type AcquisitionCostTreatment } from "./qualification-facts";

export type F010Article39cInput = {
  propertyId: string;
  fiscalYear: number;
  logementAmortissement: Pick<LogementAmortissementOutput, "exerciceFiscal" | "fraisEnCharges"> | undefined;
  state:
    | {
        fraisNotaire?: number;
        choixTraitementFrais?: "integration" | "deduction";
      }
    | undefined;
};

export type F010Article39cResult = Article39cAdapterResult & {
  /** `true` si F010 est établi et rattaché à l'exercice : condition de lecture exacte. */
  readonly established: boolean;
};

export function adaptF010ToArticle39cContributions(input: F010Article39cInput): F010Article39cResult {
  const blockers: Article39cAdapterBlocker[] = [];
  const out: Article39cContribution[] = [];
  const sourceId = `f010:${input.propertyId}:${input.fiscalYear}`;

  if (input.logementAmortissement === undefined) {
    blockers.push({ code: "F010_SOURCE_MISSING", sourceId, message: "F010 non établi pour ce bien : frais d'acquisition INCONNUS (jamais zéro)." });
    return { contributions: [], blockers, established: false };
  }
  if (input.logementAmortissement.exerciceFiscal !== input.fiscalYear) {
    blockers.push({
      code: "FISCAL_YEAR_MISMATCH",
      sourceId,
      message:
        input.logementAmortissement.exerciceFiscal === undefined
          ? "F010 sans exercice : l'appartenance à l'exercice n'est pas prouvée (fail-closed)."
          : `F010 de l'exercice ${input.logementAmortissement.exerciceFiscal} pour ${input.fiscalYear}.`,
    });
    return { contributions: [], blockers, established: false };
  }

  const deductedEuros = input.logementAmortissement.fraisEnCharges ?? 0;
  if (!Number.isFinite(deductedEuros) || deductedEuros < 0) {
    blockers.push({ code: "INVALID_AMOUNT", sourceId, message: "Frais d'acquisition déduits invalides (jamais assimilés à zéro)." });
    return { contributions: [], blockers, established: false };
  }
  const choix = input.state?.choixTraitementFrais;
  const notaryEuros = input.state?.fraisNotaire;

  const push = (amountEuros: number, treatment: AcquisitionCostTreatment, part: string, provenance: string): void => {
    const c = qualifyAcquisitionCost({
      sourceId: `${sourceId}:${part}`,
      propertyId: input.propertyId,
      fiscalYear: input.fiscalYear,
      amountCents: toCents(amountEuros),
      treatment,
      provenance,
    });
    if (c !== null) out.push(c);
  };

  if (deductedEuros > 0) {
    push(deductedEuros, "IMMEDIATELY_DEDUCTED", "deducted", "f010:logementAmortissement.fraisEnCharges");
  } else if (notaryEuros !== undefined && Number.isFinite(notaryEuros) && notaryEuros > 0) {
    // Aucun frais déduit : le traitement vient du choix explicite ; sans choix, il reste inconnu.
    push(notaryEuros, choix === "integration" ? "CAPITALIZED" : choix === "deduction" ? "IMMEDIATELY_DEDUCTED" : "UNKNOWN", "notary", "f010:state.fraisNotaire");
  }
  return { contributions: sortContributions(out), blockers, established: true };
}
