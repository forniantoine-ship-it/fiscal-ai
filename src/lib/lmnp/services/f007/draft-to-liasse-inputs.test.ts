/**
 * Correction 2031 dates — A_EXERCICE_DEBUT (2031-SD).
 * Run: npx tsx --test src/lib/lmnp/services/f007/draft-to-liasse-inputs.test.ts
 *
 * `identiteFromDeclarationDraft()` retient `activityStartDate` (F-009,
 * RNE/INPI) comme représentation opérationnelle du commencement des
 * opérations pour `exerciceDebut` — jamais `dateMiseEnService`, jamais une
 * date fabriquée quand `activityStartDate` est absente ou invalide.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { identiteFromDeclarationDraft } from "./draft-to-liasse-inputs";
import { assembleForm2031SD } from "@/runtime/capabilities/f007/assemble-form-2031";
import { buildFiscalRepresentation } from "@/runtime/capabilities/rfs/build-fiscal-representation";
import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";

function draftWith(overrides: Partial<DeclarationDraft>): DeclarationDraft {
  return {
    completedSteps: [],
    siren: "123456789",
    siret: "12345678901234",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    ...overrides,
  } as unknown as DeclarationDraft;
}

function fiscalResult(exercice: number): FiscalResult {
  return {
    exercice,
    recettes: { total: 9000 },
    charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0 },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
  };
}

describe("identiteFromDeclarationDraft() — A_EXERCICE_DEBUT", () => {
  it("Cas A — activityStartDate dans l'exercice → ouverture = activityStartDate convertie", () => {
    const identite = identiteFromDeclarationDraft(
      draftWith({ activityStartDate: "2025-03-05" }),
      2025,
    );
    assert.equal(identite.exerciceDebut, "05/03/2025");
    assert.equal(identite.exerciceFin, "31/12/2025");
  });

  it("Cas B — activityStartDate au 01/01 de l'exercice → ouverture = 01/01/{exercice}", () => {
    const identite = identiteFromDeclarationDraft(
      draftWith({ activityStartDate: "2025-01-01" }),
      2025,
    );
    assert.equal(identite.exerciceDebut, "01/01/2025");
    assert.equal(identite.exerciceFin, "31/12/2025");
  });

  it("Cas C — activityStartDate antérieure à l'exercice → ouverture = 01/01/{exercice}", () => {
    const identite = identiteFromDeclarationDraft(
      draftWith({ activityStartDate: "2024-09-15" }),
      2025,
    );
    assert.equal(identite.exerciceDebut, "01/01/2025");
    assert.equal(identite.exerciceFin, "31/12/2025");
  });

  it("Cas D — dateMiseEnService ne doit jamais être utilisée comme ouverture d'exercice", () => {
    const identite = identiteFromDeclarationDraft(
      draftWith({ activityStartDate: "2025-03-05", dateMiseEnService: "2025-04-01" }),
      2025,
    );
    assert.equal(identite.exerciceDebut, "05/03/2025");
    assert.notEqual(identite.exerciceDebut, "01/04/2025");
  });

  it("Cas E — activityStartDate absente → exerciceDebut undefined, jamais 01/01/{exercice} fabriqué", () => {
    const identite = identiteFromDeclarationDraft(draftWith({}), 2025);
    assert.equal(identite.exerciceDebut, undefined);
    assert.equal(identite.exerciceFin, "31/12/2025");
  });

  it("Cas F — activityStartDate techniquement invalide (format libre) → exerciceDebut undefined, aucune date inventée", () => {
    const identite = identiteFromDeclarationDraft(
      draftWith({ activityStartDate: "invalide" }),
      2025,
    );
    assert.equal(identite.exerciceDebut, undefined);
  });

  it("Cas F bis — activityStartDate calendairement impossible (jour hors plage du mois) → exerciceDebut undefined", () => {
    const identite = identiteFromDeclarationDraft(
      draftWith({ activityStartDate: "2025-02-30" }),
      2025,
    );
    assert.equal(identite.exerciceDebut, undefined);
  });
});

describe("Propagation — identiteFromDeclarationDraft() → RFS → mapper 2031 → résumé client", () => {
  it("une exerciceDebut calculée arrive inchangée jusqu'à la case A_EXERCICE_DEBUT et au résumé client", () => {
    const draft = draftWith({ activityStartDate: "2025-03-05" });
    const identite = identiteFromDeclarationDraft(draft, 2025);
    assert.equal(identite.exerciceDebut, "05/03/2025");

    const fr = fiscalResult(2025);
    const rfs = buildFiscalRepresentation({ fiscalResult: fr, identite });
    assert.equal(rfs.identite.exerciceDebut, "05/03/2025", "RFS transporte la même valeur, sans recalcul");

    const { form } = assembleForm2031SD(rfs.fiscalResult, rfs.identite);
    const caseDebut = form.cases.find((c) => c.caseId === "A_EXERCICE_DEBUT");
    assert.equal(caseDebut?.value, "05/03/2025", "mapper 2031 : A_EXERCICE_DEBUT porte la valeur exacte");

    const resume = buildClientSummaryDocument(rfs, { activityStartDate: draft.activityStartDate });
    assert.equal(resume.meta.identite.exerciceDebut, "05/03/2025", "résumé client récupère la même valeur");
  });

  it("une exerciceDebut absente n'émet aucun case A_EXERCICE_DEBUT et ne fabrique rien en aval", () => {
    const draft = draftWith({});
    const identite = identiteFromDeclarationDraft(draft, 2025);
    assert.equal(identite.exerciceDebut, undefined);

    const fr = fiscalResult(2025);
    const rfs = buildFiscalRepresentation({ fiscalResult: fr, identite });
    assert.equal(rfs.identite.exerciceDebut, undefined);

    const { form, anomalies } = assembleForm2031SD(rfs.fiscalResult, rfs.identite);
    const caseDebut = form.cases.find((c) => c.caseId === "A_EXERCICE_DEBUT");
    assert.equal(caseDebut, undefined, "aucun case A_EXERCICE_DEBUT émis — jamais de valeur fabriquée");
    assert.deepEqual(anomalies, [], "aucune anomalie nouvelle créée par cette absence");

    const resume = buildClientSummaryDocument(rfs, { activityStartDate: draft.activityStartDate });
    assert.equal(resume.meta.identite.exerciceDebut, undefined, "résumé client ne fabrique rien non plus");
  });
});
