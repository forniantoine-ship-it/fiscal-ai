/**
 * MICRO-JALON socle patrimonial P0 — RÈGLE CRITIQUE (contrat §22) : après ce
 * jalon, les résultats de F-006 (`applyAmortissementStocks`) doivent être
 * RIGOUREUSEMENT IDENTIQUES à ce qu'ils étaient avant. Ce fichier verrouille
 * par test les valeurs exactes de 5 scénarios déjà documentés dans les
 * jalons précédents (`f006.test.ts`) — aucune régression fiscale n'a été
 * introduite par le socle patrimonial (`capabilities/bilan`), qui n'importe
 * ni ne modifie `apply-amortissement-stocks.ts`.
 * Run: npx tsx --test src/runtime/bilan-fiscal-non-regression.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { applyAmortissementStocks } from "./capabilities/f006/apply-amortissement-stocks";

describe("Non-régression F-006 après le socle patrimonial P0", () => {
  it("déficit LMNP pur (dossier témoin réel, resultatAvantAmort=-9862, amortCalcule=3720)", () => {
    const r = applyAmortissementStocks({ exercice: 2025, resultatAvantAmort: -9862, amortCalcule: 3720 });
    assert.equal(r.resultatFiscal, 0);
    assert.equal(r.deficitNouveau, 9862);
    assert.equal(r.deficitsImputes, 0);
    assert.equal(r.amortDeduct, 0);
    assert.equal(r.amortReporte, 3720);
    assert.equal(r.amortReportesUtilises, 0);
  });

  it("bénéfice pur (resultatAvantAmort=10000, amortCalcule=6779)", () => {
    const r = applyAmortissementStocks({ exercice: 2024, resultatAvantAmort: 10000, amortCalcule: 6779 });
    assert.equal(r.resultatFiscal, 3221);
    assert.equal(r.amortDeduct, 6779);
    assert.equal(r.deficitNouveau, 0);
    assert.equal(r.deficitsImputes, 0);
  });

  it("déficit + ARD préexistant (resultatAvantAmort=-2287, amortCalcule=2266, ARD initial=500)", () => {
    const r = applyAmortissementStocks({ exercice: 2025, resultatAvantAmort: -2287, amortCalcule: 2266, stockAmortissementsReportes: 500 });
    assert.equal(r.resultatFiscal, 0);
    assert.equal(r.deficitNouveau, 2287);
    assert.equal(r.amortDeduct, 0);
    assert.equal(r.amortReporte, 2766, "amortCalcule(2266) + ARD initial(500), jamais utilisé en année déficitaire");
    assert.equal(r.amortReportesUtilises, 0);
  });

  it("bénéfice + déficit antérieur imputé (resultatAvantAmort=5000, amortCalcule=3000, déficit antérieur=2000)", () => {
    const r = applyAmortissementStocks({ exercice: 2024, resultatAvantAmort: 5000, amortCalcule: 3000, stockDeficitsAnterieurs: [{ millesime: 2020, montant: 2000 }] });
    assert.equal(r.deficitsImputes, 2000);
    assert.equal(r.amortDeduct, 3000);
    assert.equal(r.resultatFiscal, 0);
  });

  it("bénéfice + déficit antérieur + ARD, cascade complète (R5-B verrouillé au jalon précédent) : resultatAvantAmort=2000, déficit=600, amortCalcule=800, ARD=500", () => {
    const r = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 2000,
      amortCalcule: 800,
      stockDeficitsAnterieurs: [{ millesime: 2023, montant: 600 }],
      stockAmortissementsReportes: 500,
    });
    assert.equal(r.deficitsImputes, 600);
    assert.equal(r.amortDeduct, 800);
    assert.equal(r.amortReportesUtilises, 500);
    assert.equal(r.amortReporte, 0);
    assert.equal(r.resultatFiscal, 100);
    assert.equal(r.deficitNouveau, 0);
  });

  it("le socle patrimonial (capabilities/bilan) n'importe jamais apply-amortissement-stocks.ts ni produceFiscalResult() — garde d'architecture", () => {
    const bilanDir = path.join(__dirname, "capabilities", "bilan");
    const files = readdirSync(bilanDir).filter((f: string) => f.endsWith(".ts"));
    // Recherche des IMPORTS réels uniquement (jamais une mention en
    // commentaire, qui documente légitimement pourquoi ces fichiers ne
    // doivent pas être importés).
    const importPattern = /from\s+["'][^"']*(apply-amortissement-stocks|produce-fiscal-result)["']/;
    for (const file of files) {
      const content = readFileSync(path.join(bilanDir, file), "utf-8");
      assert.ok(!importPattern.test(content), `${file} ne doit jamais importer apply-amortissement-stocks.ts ni produce-fiscal-result.ts (F-006)`);
    }
  });
});
