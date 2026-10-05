/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 §11 — centimes et arrondis : conservation exacte (Σ des parties = total, au centime), frontières de capacité à ±0,01 €,
 * plusieurs lignes dont les arrondis individuels diffèrent de l'arrondi global. Oracle : arithmétique entière en centimes.
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/silent-error-gate/cents.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeChargesExercice } from "@/runtime/capabilities/f012/compute-charges-exercice";
import { prng, oracle } from "./oracle";
import { checkCase, toOracleInput } from "./check";
import { genProd, caseDossier, withServiceDate, type Case } from "./fixtures.test";

const c = (n: number) => Math.round(n * 100);

describe("GATE-1 — centimes : conservation exacte des charges F012 (prorata pré-exploitation)", () => {
  it("300 combinaisons (seed fixe) : pour chaque ligne, déductible + pré-exploitation = montant au centime ; Σ lignes = totaux", () => {
    const rnd = prng(424242);
    const pick = (max: number) => Math.floor(rnd() * (max + 1));
    const failures: string[] = [];
    for (let i = 0; i < 300; i++) {
      const month = 1 + pick(11);
      const day = 1 + pick(27);
      const eur = (max: number) => pick(max * 100) / 100;
      const input = { exerciceFiscal: 2026, dateMiseEnService: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, taxeFonciere: eur(3000), assurancePno: eur(900), honorairesComptable: eur(1200), honorairesGestion: eur(1500), fraisBancaires: eur(300), assuranceGli: eur(500) } as any;
      const r: any = computeChargesExercice(input);
      const lignes = r.charges.lignes as any[];
      let sumDed = 0, sumPre = 0;
      for (const l of lignes) {
        if (l.deductibilite !== "deductible") continue;
        const ded = c(l.montantDeductible ?? 0), pre = c(l.montantPreExploitation ?? 0);
        sumDed += ded; sumPre += pre;
        // une ligne « pré-exploitation » dédiée porte son montant entier dans montantPreExploitation et son parent déduit la part courante
        if (l.id.endsWith("pre-exploitation")) continue;
      }
      const inputsTotal = [input.taxeFonciere, input.assurancePno, input.honorairesComptable, input.honorairesGestion, input.fraisBancaires, input.assuranceGli].reduce((n, x) => n + c(x), 0);
      if (c(r.charges.totalDeductible) + c(r.charges.totalPreExploitation) !== inputsTotal) failures.push(`#${i} ${input.dateMiseEnService} Σ déductible ${r.charges.totalDeductible} + pré ${r.charges.totalPreExploitation} ≠ saisi ${inputsTotal / 100}`);
      if (c(r.charges.totalDeductible) !== sumDed) failures.push(`#${i} totalDeductible ${r.charges.totalDeductible} ≠ Σ lignes ${sumDed / 100}`);
      if (c(r.charges.totalPreExploitation) !== sumPre) failures.push(`#${i} totalPreExploitation ${r.charges.totalPreExploitation} ≠ Σ lignes ${sumPre / 100}`);
    }
    assert.deepEqual(failures.slice(0, 8), []);
  });
});

describe("GATE-1 — centimes : frontières de capacité et arrondis multi-lignes de plan", () => {
  it("dotation = C ± 0,01 € sur 12 couples (L, B) à centimes : D = min(dotation, C) exact, ARD au centime, 318 = ARDn", () => {
    const rnd = prng(31337);
    const pick = (max: number) => Math.floor(rnd() * (max + 1));
    const failures: string[] = [];
    for (let i = 0; i < 12; i++) {
      const E = 3000 + pick(900000) / 100;
      const TF = pick(Math.round(E * 100 * 0.8)) / 100;
      const C = Math.max(0, c(E) - c(TF));
      for (const delta of [-1, 0, 1]) {
        const dot = Math.max(0, C + delta) / 100;
        const cs: Case = { E, TF, dotation: dot };
        const r = checkCase(cs, `c#${i}${delta}`);
        if (r.blocked !== undefined || r.diffs.length > 0) failures.push(...r.diffs, `${JSON.stringify(cs)}`);
        const o = oracle(toOracleInput(cs));
        if (o.D !== Math.min(c(dot), C)) failures.push(`oracle D ${o.D}`);
        if (r.observed !== undefined && delta === 1 && (r.observed.ARDn as number) !== 1) failures.push(`C−0,01 : ARDn attendu 1 centime, obtenu ${r.observed.ARDn}`);
        if (r.observed !== undefined && delta === -1 && (r.observed.apres as number) !== 1) failures.push(`C+0,01 : après attendu 1 centime`);
      }
    }
    assert.deepEqual(failures.slice(0, 6), []);
  });

  it("plan à plusieurs lignes dont les arrondis individuels (333,33 + 333,33 + 333,34) diffèrent de 1/3 × 1 000 : total comptable 1 000,00, 2033-C 572/576 au centime, capacité exacte", () => {
    const ws: any = caseDossier({ E: 5000, TF: 4000, dotation: 1000 }); // C = 1 000,00
    const lignes = [333.33, 333.33, 333.34].map((d, k) => ({ id: `l${k}`, label: `L${k}`, montant: 40000 + k, dureeAnnees: 40, dotationExercice: d, amortissementsCumules: d }));
    const draft = { ...ws.declarationDraft, logementAmortissement: { ...ws.declarationDraft.logementAmortissement, valeurTerrain: 40000, plan: { lignes, totalAnnuelExercice: 1000, totalBrut: 120003 }, dotationAnnuelle: 1000 }, amortissementAssistant: { exerciceFiscal: 2026, totalDotations: 1000, status: "validated" } };
    const g: any = genProd({ ...ws, declarationDraft: draft });
    assert.equal(g.status, "generated", JSON.stringify(g.blockingReasons ?? g.anomalies));
    const f = g.rfs.fiscalResult;
    assert.deepEqual([f.amortDeduct, f.amortNonDeduitExercice, f.resultatFiscalAvantDeficits], [1000, 0, 0], "C = 1 000,00 = Σ lignes arrondies : aucun centime perdu ni créé");
  });

  it("montants à 0,01 / 0,99 / 1,01 : L et résultats exacts (aucune perte de centime sur de petites valeurs)", () => {
    for (const [E, TF, expectedAvant] of [[0.01, 0, 0.01], [0.99, 0.01, 0.98], [1.01, 0.99, 0.02], [100.01, 33.34, 66.67]] as const) {
      const g: any = genProd(caseDossier({ E, TF, dotation: 0 }));
      assert.equal(g.status, "generated", `E=${E}`);
      assert.equal(c(g.rfs.fiscalResult.resultatAvantAmort), c(expectedAvant), `E=${E} TF=${TF}`);
    }
  });
});

describe("GATE-1 — mise en service en cours d'année (B) : prorata par date des charges, aucun prorata inventé sur les loyers", () => {
  it("TF 3 000,01 + comptable 601,01 : quelle que soit la date de mise en service, résultat avant amortissement = 10 000 − 3 601,02 = 6 398,98 (littéral) ; loyers = encaissements", () => {
    for (const date of ["2026-01-01", "2026-03-10", "2026-08-17", "2026-12-30"]) {
      const ws = withServiceDate(caseDossier({ E: 10000, TF: 3000.01, COMPTA: 601.01, dotation: 0 }), date);
      const g: any = genProd(ws);
      assert.equal(g.status, "generated", `${date}: ${JSON.stringify(g.blockingReasons ?? g.anomalies)}`);
      const f = g.rfs.fiscalResult;
      assert.deepEqual([f.recettes.total, c(f.resultatAvantAmort), c(f.charges.totalDeductible) + c(f.charges.chargesPreExploitation)], [10000, 639898, 360102], date);
    }
  });
});
