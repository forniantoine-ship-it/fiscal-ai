import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assembleLiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import { buildLiasseRfsDocumentText } from "./export-liasse-document";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: {
      totalDeductible: 2000,
      chargesExploitation: 2000,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalNonDeductible: 0,
    },
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
    ...overrides,
  };
}

const IDENTITE: IdentiteDeclarante = {
  siren: "104545108",
  siret: "10454510800011",
  denomination: "Elsa Bouvard",
  adresseEntreprise: "15 Rue Saint-Germain, 29600 Saint-Martin-Des-Champs",
};

function rfs(fr: FiscalResult): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

/**
 * P0-1 (audit 2026-09-02) — buildLiasseRfsDocumentText() est le rendu texte
 * des formulaires complémentaires (2031-bis, 2033-A/B/C) exposé par
 * DeclarationReadyView. Ne teste aucune règle fiscale nouvelle : vérifie
 * uniquement que les 4 formulaires déjà assemblés par assembleLiasseFromRfs()
 * apparaissent bien dans le texte produit.
 */
describe("P0-1 — buildLiasseRfsDocumentText() expose les 4 formulaires complémentaires", () => {
  it("le texte contient les 4 en-têtes de formulaire et au moins une case de chacun", () => {
    const liasseRfs = assembleLiasseFromRfs(rfs(fiscalResult()));
    const text = buildLiasseRfsDocumentText(2025, liasseRfs);

    assert.match(text, /FORMULAIRE 2031-Bis-SD/);
    assert.match(text, /FORMULAIRE 2033-A-SD/);
    assert.match(text, /FORMULAIRE 2033-B-SD/);
    assert.match(text, /FORMULAIRE 2033-C-SD/);
    assert.doesNotMatch(text, /FORMULAIRE 2031-SD\b/, "le 2031-SD reste porté exclusivement par buildLiasseDocumentText()/liasseResult (F-007), pas dupliqué ici");

    for (const c of liasseRfs.form2033B.cases) {
      assert.ok(text.includes(c.caseId), `case ${c.caseId} du 2033-B doit apparaître dans le texte`);
    }
  });

  it("liste les formulaires non générés (2033-D-SD) sans en inventer le contenu", () => {
    const liasseRfs = assembleLiasseFromRfs(rfs(fiscalResult()));
    const text = buildLiasseRfsDocumentText(2025, liasseRfs);

    assert.deepEqual(liasseRfs.formulairesManquants, ["2033-D-SD"]);
    assert.match(text, /Formulaires non générés à ce stade : 2033-D-SD/);
  });
});
