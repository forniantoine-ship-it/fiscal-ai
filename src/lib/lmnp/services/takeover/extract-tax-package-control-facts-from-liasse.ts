/**
 * Lot 4D.2 — adaptation liasse N-1 (observations structurées) → TaxPackageControlFacts.
 *
 * Frontière d'entrée minimale : observations de cases DÉJÀ disponibles
 * (formType / sourceCase / formYear / fiscalYear / CandidateValue).
 *
 * Aucun parser PDF/OCR ici — le dépôt n'extrait pas encore les cases 2033-A/C
 * depuis un document importé. Un extracteur ultérieur pourra alimenter cette
 * frontière sans changer le contrat 4D.1.
 *
 * Réutilise exclusivement TAX_PACKAGE_CONTROL_V1_MATRIX + createTaxPackageControlFact.
 * Pas de matrice dupliquée. Pas de réconciliation. Pas d'arbitrage. Pas d'Opening.
 */

import type { CandidateValue } from "./candidate-value";
import {
  createTaxPackageControlFact,
  TAX_PACKAGE_CONTROL_V1_MATRIX,
  type TaxPackageControlFact,
  type TaxPackageControlFactIssue,
  type TaxPackageControlFacts,
} from "./tax-package-control-facts";

/**
 * Observation documentaire atomique déjà disponible pour une case de liasse.
 * Aucune invention : formYear / fiscalYear / value doivent être fournis tels quels.
 * periodPosition n'est PAS une entrée — dérivé uniquement de la matrice V1.
 */
export type TaxPackageLiasseCaseObservation = {
  formType: string;
  formYear: number;
  fiscalYear: number;
  sourceCase: string;
  value: CandidateValue<number>;
};

export type ExtractTaxPackageControlFactsFromLiasseInput = {
  packageId: string;
  observations: readonly TaxPackageLiasseCaseObservation[];
};

export type TaxPackageControlFactSkip = {
  formType: string;
  sourceCase: string;
  reason: string;
};

export type ExtractTaxPackageControlFactsFromLiasseResult = {
  status: "extracted";
  package: TaxPackageControlFacts;
  /** Cases hors matrice V1 (ex. 490/570/572/318) — aucun fact créé. */
  skipped: TaxPackageControlFactSkip[];
  /** Observations V1 rejetées par la factory 4D.1 (structurelles). */
  issues: TaxPackageControlFactIssue[];
};

function resolveV1Row(formType: string, sourceCase: string) {
  return TAX_PACKAGE_CONTROL_V1_MATRIX.find(
    (row) => row.formType === formType && row.sourceCase === sourceCase,
  );
}

/**
 * Transforme les observations disponibles d'une liasse N-1 en TaxPackageControlFacts.
 *
 * - Une observation admissible → un fact (via createTaxPackageControlFact).
 * - Cases hors V1 → skipped, jamais de fact.
 * - present(0) ≠ missing : CandidateValue préservé tel quel.
 * - Pas de déduplication multi-documents.
 * - Pas de réconciliation 028↔496 / 030↔576.
 */
export function extractTaxPackageControlFactsFromLiasse(
  input: ExtractTaxPackageControlFactsFromLiasseInput,
): ExtractTaxPackageControlFactsFromLiasseResult {
  const facts: TaxPackageControlFact[] = [];
  const skipped: TaxPackageControlFactSkip[] = [];
  const issues: TaxPackageControlFactIssue[] = [];

  for (let i = 0; i < input.observations.length; i += 1) {
    const observation = input.observations[i]!;
    const row = resolveV1Row(observation.formType, observation.sourceCase);

    if (!row) {
      skipped.push({
        formType: observation.formType,
        sourceCase: observation.sourceCase,
        reason: `Case hors matrice V1 — aucun TaxPackageControlFact (${observation.formType}/${observation.sourceCase}).`,
      });
      continue;
    }

    // CandidateValue passé tel quel — present(0) ≠ missing ; pas de normalisation.
    const created = createTaxPackageControlFact({
      kind: row.kind,
      formType: row.formType,
      formYear: observation.formYear,
      fiscalYear: observation.fiscalYear,
      periodPosition: row.periodPosition,
      sourceCase: row.sourceCase,
      value: observation.value,
    });

    if (created.status === "created") {
      facts.push(created.fact);
    } else {
      for (const item of created.issues) {
        issues.push({
          code: item.code,
          message: `observations[${i}]: ${item.message}`,
        });
      }
    }
  }

  return {
    status: "extracted",
    package: {
      packageId: input.packageId,
      facts,
    },
    skipped,
    issues,
  };
}
