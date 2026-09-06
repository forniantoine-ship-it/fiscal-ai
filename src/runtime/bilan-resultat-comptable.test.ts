/**
 * MICRO-JALON socle patrimonial P0 — source unique du résultat comptable.
 * Run: npx tsx --test src/runtime/bilan-resultat-comptable.test.ts
 *
 * R13 (contrat P0 §21) : 136 = 310, vérifié par appel RÉEL des deux mappers,
 * jamais par comparaison de deux formules recopiées à la main.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resultatComptable } from "./capabilities/bilan/resultat-comptable";
import { map2033AFromRfs } from "./capabilities/rfs/projection/map-2033a";
import { map2033BFromRfs } from "./capabilities/rfs/projection/map-2033b";
import { round2 } from "./capabilities/f007/types";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation } from "./capabilities/rfs/types";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 99 },
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

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Test P0" };

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

describe("resultatComptable() — source unique", () => {
  it("formule inchangée : resultatAvantAmort − amortCalcule − totalNonDeductible", () => {
    const fr = fiscalResult({ resultatAvantAmort: -9862, amortCalcule: 3720, charges: { totalDeductible: 14963, chargesExploitation: 10361, chargesFinancement: 4602, chargesPreExploitation: 0, totalNonDeductible: 99 } });
    assert.equal(resultatComptable(fr), round2(-9862 - 3720 - 99));
    assert.equal(resultatComptable(fr), -13681);
  });

  it("R13 — 136 (2033-A) = 310 (2033-B), vérifié par appel réel des deux mappers, sur un cas bénéficiaire", () => {
    const fr = fiscalResult({ resultatAvantAmort: 7000, amortCalcule: 1500, charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 } });
    const representation = rfs(fr);
    const form2033A = map2033AFromRfs(representation);
    const form2033B = map2033BFromRfs(representation);
    const case136 = form2033A.cases.find((c) => c.caseId === "136");
    const case310 = form2033B.cases.find((c) => c.caseId === "310");
    assert.ok(case136, "136 doit être produite");
    assert.ok(case310, "310 doit être produite (résultat comptable positif)");
    assert.equal(case136?.value, case310?.value, "136 doit être rigoureusement égale à 310");
    assert.equal(case136?.value, round2(7000 - 1500 - 100));
  });

  it("R13 — 136 = 310 également sur un cas déficitaire (dossier témoin réel)", () => {
    const fr = fiscalResult({
      resultatAvantAmort: -9862,
      amortCalcule: 3720,
      charges: { totalDeductible: 14963, chargesExploitation: 10361, chargesFinancement: 4602, chargesPreExploitation: 0, totalNonDeductible: 99 },
      resultatFiscal: 0,
      deficitNouveau: 9862,
    });
    const representation = rfs(fr);
    const form2033A = map2033AFromRfs(representation);
    const form2033B = map2033BFromRfs(representation);
    const case136 = form2033A.cases.find((c) => c.caseId === "136");
    const case310 = form2033B.cases.find((c) => c.caseId === "310");
    const case314 = form2033B.cases.find((c) => c.caseId === "314"); // résultat comptable négatif → colonne déficit du 2033-B
    assert.equal(case136?.value, -13681);
    assert.ok(case310, "310 doit être produite même sur un résultat comptable négatif (jamais conditionnée au signe)");
    // Correction P0 (audit indépendant) : l'assertion directe 136 === 310
    // manquait sur le cas déficitaire — seule une comparaison indirecte
    // (136 à -13681, 314 à 13681) existait, ce qui n'aurait pas détecté une
    // divergence entre les deux mappers si l'un des deux avait été corrigé
    // sans l'autre.
    assert.equal(case136?.value, case310?.value, "136 doit être rigoureusement égale à 310, y compris sur un résultat comptable négatif");
    assert.equal(case314?.value, 13681, "314 porte |résultat comptable| quand il est négatif");
  });
});
