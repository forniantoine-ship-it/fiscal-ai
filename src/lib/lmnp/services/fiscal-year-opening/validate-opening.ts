/**
 * Contrôles purs sur `FiscalYearOpening` — Lot 1.
 * Aucune I/O, aucun moteur fiscal.
 */

import { isAvailable } from "./opening-fact";
import { computeOpeningContentHash, isOpeningValidationIntact } from "./content-hash";
import type {
  FiscalYearOpening,
  OpeningAsset,
  OpeningIssue,
  OpeningLoan,
} from "./types";

function push(
  issues: OpeningIssue[],
  code: string,
  message: string,
  fieldPath?: string,
  severity: OpeningIssue["severity"] = "error",
): void {
  issues.push({ code, message, severity, fieldPath });
}

function assertFinite(issues: OpeningIssue[], value: number, fieldPath: string, label: string): void {
  if (!Number.isFinite(value)) {
    push(issues, "NON_FINITE_NUMBER", `${label} n'est pas un nombre fini.`, fieldPath);
  }
}

function assertNonNegative(
  issues: OpeningIssue[],
  value: number,
  fieldPath: string,
  label: string,
): void {
  assertFinite(issues, value, fieldPath, label);
  if (Number.isFinite(value) && value < 0) {
    push(issues, "NEGATIVE_AMOUNT", `${label} ne peut pas être négatif.`, fieldPath);
  }
}

function validateAsset(issues: OpeningIssue[], asset: OpeningAsset, targetYear: number): void {
  const base = `assets.${asset.id}`;
  if (isAvailable(asset.coutBrut)) {
    assertNonNegative(issues, asset.coutBrut.value, `${base}.coutBrut`, "Coût brut");
  }
  if (isAvailable(asset.cumulOuverture)) {
    assertNonNegative(issues, asset.cumulOuverture.value, `${base}.cumulOuverture`, "Cumul d'ouverture");
  }
  if (isAvailable(asset.coutBrut) && isAvailable(asset.cumulOuverture)) {
    const brut = asset.coutBrut.value;
    const cumul = asset.cumulOuverture.value;
    if (Number.isFinite(brut) && Number.isFinite(cumul) && cumul > brut) {
      push(
        issues,
        "CUMUL_EXCEEDS_BRUT",
        `Cumul d'ouverture (${cumul}) > coût brut (${brut}).`,
        `${base}.cumulOuverture`,
      );
    }
    if (asset.vncAttestee !== undefined) {
      assertFinite(issues, asset.vncAttestee, `${base}.vncAttestee`, "VNC attestée");
      const vncCalculee = Math.round((brut - cumul) * 100) / 100;
      if (Number.isFinite(asset.vncAttestee) && Math.abs(asset.vncAttestee - vncCalculee) > 0.009) {
        push(
          issues,
          "VNC_ATTESTEE_DIVERGENCE",
          `VNC attestée (${asset.vncAttestee}) ≠ brut − cumul (${vncCalculee}).`,
          `${base}.vncAttestee`,
        );
      }
    }
  }
  if (asset.categorie === "terrain") {
    if (isAvailable(asset.plan) && asset.plan.value.kind !== "non_amortizable") {
      push(
        issues,
        "TERRAIN_MUST_BE_NON_AMORTIZABLE",
        "Un terrain doit avoir un plan non amortissable.",
        `${base}.plan`,
      );
    }
    if (isAvailable(asset.cumulOuverture) && asset.cumulOuverture.value !== 0) {
      push(
        issues,
        "TERRAIN_CUMUL_MUST_BE_ZERO",
        "Le cumul d'amortissement d'un terrain doit être 0.",
        `${base}.cumulOuverture`,
      );
    }
  }
  if (isAvailable(asset.plan) && asset.plan.value.kind === "amortizable") {
    const plan = asset.plan.value;
    if (!plan.startDate) {
      push(issues, "AMORTIZABLE_PLAN_INCOMPLETE", "Date de début manquante.", `${base}.plan.startDate`);
    }
    if (!Number.isFinite(plan.durationYears) || plan.durationYears <= 0) {
      push(issues, "AMORTIZABLE_PLAN_INCOMPLETE", "Durée invalide.", `${base}.plan.durationYears`);
    }
  }
  void targetYear;
}

function validateLoan(issues: OpeningIssue[], loan: OpeningLoan): void {
  const base = `loans.${loan.pretId}`;
  if (!loan.pretId) {
    push(issues, "LOAN_MISSING_ID", "pretId manquant.", base);
  }
  if (isAvailable(loan.terms)) {
    const t = loan.terms.value;
    assertNonNegative(issues, t.capitalInitial, `${base}.terms.capitalInitial`, "Capital initial");
    assertFinite(issues, t.tauxNominal, `${base}.terms.tauxNominal`, "Taux nominal");
    assertNonNegative(issues, t.dureeMois, `${base}.terms.dureeMois`, "Durée");
  }
  if (isAvailable(loan.crdOuverture)) {
    assertNonNegative(issues, loan.crdOuverture.value, `${base}.crdOuverture`, "CRD d'ouverture");
  }
  if (isAvailable(loan.assuranceAnnuelle) && loan.assuranceAnnuelle.value !== undefined) {
    assertNonNegative(issues, loan.assuranceAnnuelle.value, `${base}.assuranceAnnuelle`, "Assurance annuelle");
  }
}

/**
 * Contrôles structurels purs sur une ouverture déjà construite.
 */
export function validateFiscalYearOpening(opening: FiscalYearOpening): OpeningIssue[] {
  const issues: OpeningIssue[] = [];

  if (!opening.openingId) {
    push(issues, "MISSING_OPENING_ID", "openingId manquant.");
  }
  if (!opening.dossierId) {
    push(issues, "MISSING_DOSSIER_ID", "dossierId manquant.");
  }
  if (!Number.isInteger(opening.targetFiscalYear) || opening.targetFiscalYear < 1900) {
    push(issues, "INVALID_TARGET_YEAR", "targetFiscalYear invalide.", "targetFiscalYear");
  }

  if (opening.source.kind === "internal_closure") {
    if (!opening.source.previousFiscalYearId || !opening.source.sourceClosureId) {
      push(issues, "MISSING_PROVENANCE", "previousFiscalYearId / sourceClosureId manquants pour une source interne.");
    }
  } else {
    if (!opening.source.takeoverId) {
      push(issues, "MISSING_PROVENANCE", "takeoverId manquant pour une source externe.");
    }
    if ("previousFiscalYearId" in opening.source || "sourceClosureId" in opening.source) {
      push(
        issues,
        "EXTERNAL_SOURCE_LEAK",
        "Une source externe ne doit pas porter previousFiscalYearId / sourceClosureId.",
      );
    }
  }

  if (isAvailable(opening.stocks.deficits)) {
    const seen = new Set<number>();
    for (const row of opening.stocks.deficits.value) {
      assertNonNegative(issues, row.montant, `stocks.deficits.${row.millesime}`, "Montant de déficit");
      if (!Number.isInteger(row.millesime)) {
        push(issues, "DEFICIT_YEAR_NOT_INTEGER", "Millésime de déficit non entier.", `stocks.deficits.${row.millesime}`);
      } else if (row.millesime >= opening.targetFiscalYear) {
        push(
          issues,
          "DEFICIT_YEAR_NOT_PRIOR",
          `Millésime ${row.millesime} doit être strictement antérieur à ${opening.targetFiscalYear}.`,
          `stocks.deficits.${row.millesime}`,
        );
      }
      if (seen.has(row.millesime)) {
        push(issues, "DUPLICATE_DEFICIT_YEAR", `Millésime de déficit dupliqué : ${row.millesime}.`, `stocks.deficits.${row.millesime}`);
      }
      seen.add(row.millesime);
    }
  }

  if (isAvailable(opening.stocks.amortissementsReportes)) {
    assertNonNegative(
      issues,
      opening.stocks.amortissementsReportes.value,
      "stocks.amortissementsReportes",
      "Stock d'amortissements reportés",
    );
  }

  if (isAvailable(opening.assets)) {
    const ids = new Set<string>();
    for (const asset of opening.assets.value) {
      if (ids.has(asset.id)) {
        push(issues, "DUPLICATE_ASSET_ID", `Actif dupliqué : ${asset.id}.`, `assets.${asset.id}`);
      }
      ids.add(asset.id);
      validateAsset(issues, asset, opening.targetFiscalYear);
    }
  }

  if (isAvailable(opening.loans)) {
    const ids = new Set<string>();
    for (const loan of opening.loans.value) {
      if (ids.has(loan.pretId)) {
        push(issues, "DUPLICATE_LOAN_ID", `Prêt dupliqué : ${loan.pretId}.`, `loans.${loan.pretId}`);
      }
      ids.add(loan.pretId);
      validateLoan(issues, loan);
    }
  }

  // Comptes signés autorisés.
  if (isAvailable(opening.patrimoine.ouvertureCompteExploitant)) {
    assertFinite(
      issues,
      opening.patrimoine.ouvertureCompteExploitant.value,
      "patrimoine.ouvertureCompteExploitant",
      "Ouverture compte exploitant",
    );
  }
  if (isAvailable(opening.patrimoine.tresorerieOuverture)) {
    assertFinite(
      issues,
      opening.patrimoine.tresorerieOuverture.value,
      "patrimoine.tresorerieOuverture",
      "Trésorerie d'ouverture",
    );
  }
  if (isAvailable(opening.patrimoine.ran) && opening.patrimoine.ran.value.valeur !== undefined) {
    assertFinite(issues, opening.patrimoine.ran.value.valeur, "patrimoine.ran.valeur", "RAN");
  }

  const requiredProvenance = ["source", "stocks.deficits", "stocks.amortissementsReportes"];
  for (const path of requiredProvenance) {
    if (!opening.provenance[path]) {
      push(issues, "MISSING_PROVENANCE", `Provenance manquante pour ${path}.`, path);
    }
  }

  if (opening.validation.status === "validated") {
    if (opening.validation.openingRevision !== opening.revision) {
      push(
        issues,
        "VALIDATION_REVISION_MISMATCH",
        "openingRevision de validation ≠ revision courante.",
        "validation.openingRevision",
      );
    }
    const expected = computeOpeningContentHash(opening);
    if (opening.validation.contentHash !== expected) {
      push(
        issues,
        "VALIDATION_HASH_MISMATCH",
        "contentHash de validation incohérent avec le contenu courant.",
        "validation.contentHash",
      );
    }
    if (!isOpeningValidationIntact(opening)) {
      push(
        issues,
        "VALIDATION_STALE",
        "La validation n'est plus intacte après modification du contenu.",
        "validation",
      );
    }
  }

  return issues;
}
