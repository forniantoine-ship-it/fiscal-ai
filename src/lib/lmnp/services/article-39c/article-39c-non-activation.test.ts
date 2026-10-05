/**
 * INT-1 — preuve de NON-ACTIVATION : les adapters article 39 C existent mais ne sont consommés par aucun chemin productif.
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/article-39c-non-activation.test.ts
 *
 * 1. Graphe d'imports : aucun module hors `services/article-39c/` ne les importe.
 * 2. Comportement : le chemin productif F006 utilise toujours le proxy `max(0, résultat avant amortissement)`. La sortie
 *    ci-dessous est un GOLDEN capturé AVANT l'ajout des adapters (HEAD 86f11f7) ; elle ne doit pas bouger.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { applyAmortissementStocks } from "@/runtime/capabilities/f006/apply-amortissement-stocks";
import { computeArticle39c } from "@/runtime/capabilities/f006/article-39c-capacity";

const SRC = join(process.cwd(), "src");
const ADAPTER_DIR = join("lib", "lmnp", "services", "article-39c");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

describe("INT-1 — non-activation : graphe d'imports", () => {
  it("aucun module en dehors de services/article-39c/ n'importe les adapters", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      if (rel.startsWith(ADAPTER_DIR + sep)) continue;
      const text = readFileSync(file, "utf8");
      if (/services\/article-39c\//.test(text) || /from\s+["'](\.\.?\/)+article-39c\/(contribution|from-|qualification-facts)/.test(text)) {
        offenders.push(rel);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("le builder productif, F006 et la consolidation ne référencent aucune contribution 39 C", () => {
    for (const file of [
      "lib/lmnp/services/declaration/generation-inputs.ts",
      "lib/lmnp/dossier/fiscal-consolidation.ts",
      "runtime/capabilities/f006/produce-fiscal-result.ts",
      "runtime/capabilities/f006/aggregate-inputs.ts",
      "runtime/capabilities/f006/apply-amortissement-stocks.ts",
    ]) {
      const text = readFileSync(join(SRC, file), "utf8");
      assert.ok(!/Article39cContribution|article-39c\/(contribution|from-|qualification-facts)/.test(text), file);
      assert.ok(!/computeArticle39c\(/.test(text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), `${file} n'appelle pas computeArticle39c`);
    }
  });
});

describe("INT-1 — non-activation : le chemin productif F006 reste le proxy historique", () => {
  const INPUT = {
    exerciceFiscal: 2024,
    activite: { dateMiseEnService: "2024-04-15", siret: "12345678901234" },
    revenusAssistant: { exerciceFiscal: 2024, totalRecettes: 12000 },
    chargesAssistant: { exerciceFiscal: 2024, totalDeductible: 8000, totalPreExploitation: 500, parCategorie: {} },
    financementCharges: { exerciceFiscal: 2024, totalChargesFinancementExercice: 1500, totalInteretsPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2024, totalDotations: 4000, status: "validated" as const },
    logementAmortissement: { computedAt: "2024-01-01T00:00:00.000Z" },
    stockDeficitsAnterieurs: [{ millesime: 2022, montant: 600 }],
    stockAmortissementsReportes: 300,
  };

  it("sortie fiscale d'un dossier représentatif identique au golden pré-INT-1", () => {
    const output = JSON.parse(JSON.stringify(produceFiscalResult(INPUT as never)));
    delete output.result.trace.computedAt;
    assert.deepEqual(output, {
      result: {
        exercice: 2024,
        recettes: { total: 12000 },
        charges: {
          totalDeductible: 9500,
          chargesExploitation: 8000,
          chargesFinancement: 1500,
          chargesPreExploitation: 500,
          chargesExploitationPreExploitation: 500,
          totalNonDeductible: 0,
          detailParCategorie: {},
          fraisAcquisitionEnCharges: 0,
        },
        resultatAvantAmort: 2000,
        amortCalcule: 4000,
        amortDeduct: 2000,
        amortReporte: 2300,
        amortNonDeduitExercice: 2000,
        amortReportesUtilises: 0,
        resultatFiscal: 0,
        resultatFiscalAvantDeficits: 0,
        deficitNouveau: 0,
        deficitsImputes: 0,
        perteExceptionnelle: 0,
        stocks: { deficits: [{ millesime: 2022, montant: 600 }], amortissementsReportes: 2300, deficitsExpires: [] },
        trace: {
          ksArtifacts: ["TRF-0029", "TRF-0020", "TRF-0016", "TRF-0025", "TRF-0030", "TRF-0031", "TRF-0032", "RAI-014", "AX-015", "AX-016", "AX-017", "SAV-030"],
          journal: [
            { trf: "TRF-0029", label: "Total recettes (F-013)", value: 12000 },
            { trf: "TRF-0020", label: "Charges exploitation (F-012)", value: 8000 },
            { trf: "TRF-0020", label: "Charges non déductibles (F-012)", value: 0 },
            { trf: "TRF-0016", label: "Charges financement (F-011)", value: 1500 },
            { trf: "TRF-0025", label: "Charges pré-exploitation", value: 500 },
            { trf: "TRF-0030", label: "Résultat avant amortissement", value: 2000 },
            { trf: "TRF-0012", label: "Amortissement calculé (F-014)", value: 4000 },
            { trf: "TRF-0031", label: "Amortissement déduit", value: 2000 },
            { trf: "TRF-0031", label: "Amortissement non déduit de l'exercice (mouvement annuel)", value: 2000 },
            { trf: "TRF-0031", label: "Amortissement reporté (stock final)", value: 2300 },
            { trf: "TRF-0031", label: "Résultat fiscal avant déficits antérieurs", value: 0 },
            { trf: "TRF-0031", label: "Déficits imputés", value: 0 },
            { trf: "TRF-0032", label: "Résultat fiscal", value: 0 },
          ],
        },
        status: "computed",
        anomalies: [],
      },
      anomalies: [],
    });
  });

  it("applyAmortissementStocks alimente toujours la capacité avec max(0, résultat avant amortissement)", () => {
    // Oracle SAV-030/SAV-032 « B » : résultat global −1 000 (ACTIVITY 4 000), dotation 2 500.
    // Proxy productif : capacité 0 → rien n'est déduit. Le moteur exact (C = max(0, 10 000 − 7 000) = 3 000) déduirait 2 500.
    const proxy = applyAmortissementStocks({ exercice: 2026, resultatAvantAmort: -1000, amortCalcule: 2500 });
    assert.equal(proxy.amortDeduct, 0);
    assert.equal(proxy.amortReporte, 2500);
    assert.equal(proxy.resultatFiscalAvantDeficits, -1000);
    const exact = computeArticle39c({
      exercice: 2026,
      currentDepreciation: 2500,
      amounts: [
        { id: "L", category: "L", amount: 10000, class: "L", qualificationLevel: "DIRECT", provenance: "oracle", reason: "oracle" },
        { id: "B", category: "B", amount: 7000, class: "B", qualificationLevel: "DIRECT", provenance: "oracle", reason: "oracle" },
        { id: "A", category: "A", amount: 4000, class: "ACTIVITY", qualificationLevel: "DIRECT", provenance: "oracle", reason: "oracle" },
      ],
    });
    assert.equal(exact.figures!.amortDeduit, 2500);
    assert.notEqual(proxy.amortDeduct, exact.figures!.amortDeduit, "le proxy productif n'a pas été remplacé par le moteur exact");
  });
});
