/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 §18 — fuzz du MOTEUR (sans dossier) : OTHER_PRODUCT, capacité, matérialité des montants non résolus, F006 avec capacité exacte.
 * Oracle indépendant (centimes entiers). Run: npx tsx --test src/lib/lmnp/services/article-39c/silent-error-gate/engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeArticle39c } from "@/runtime/capabilities/f006/article-39c-capacity";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { prng, oracle, type OracleInput } from "./oracle";

export const ENGINE_SEED = 90210;
export const ENGINE_CASES = 500;
const eur = (c: number) => c / 100;
const q = (id: string, cls: "L" | "B" | "ACTIVITY" | "OTHER_PRODUCT", cents: number) => ({ id, category: id, amount: eur(cents), class: cls, qualificationLevel: "DIRECT" as const, provenance: "t", reason: "t" });

describe("GATE-1 — moteur 39 C et F006 : OTHER_PRODUCT, stocks, déficits (oracle indépendant)", () => {
  it(`${ENGINE_CASES} cas (seed ${ENGINE_SEED}) : computeArticle39c et F006(article39cExact) concordent avec l'oracle, OTHER_PRODUCT n'augmente jamais C`, () => {
    const rnd = prng(ENGINE_SEED);
    const pick = (max: number) => Math.floor(rnd() * (max + 1));
    const failures: string[] = [];
    for (let i = 0; i < ENGINE_CASES; i++) {
      const L = 100000 + pick(2500000), B = pick(Math.round(L * 1.1)), ACT = rnd() < 0.5 ? pick(400000) : 0, OP = rnd() < 0.4 ? pick(1500000) : 0;
      const dot = rnd() < 0.15 ? Math.max(0, L - B) : pick(700000);
      const ard = rnd() < 0.4 ? pick(500000) : 0;
      const deficits = rnd() < 0.3 ? [{ millesime: 2018 + pick(7), montant: 1 + pick(400000) }] : [];
      const input: OracleInput = { E: L, CO: 0, CC: 0, AO: 0, AC: 0, B, ACTIVITY: ACT, OTHER_PRODUCT: OP, dotation: dot, ardOpen: ard, deficits, year: 2026 };
      const o = oracle(input);
      const amounts = [q("l", "L", L), q("b", "B", B), ...(ACT ? [q("a", "ACTIVITY", ACT)] : []), ...(OP ? [q("op", "OTHER_PRODUCT", OP)] : [])];
      const e = computeArticle39c({ exercice: 2026, amounts, currentDepreciation: eur(dot), historicalArdStock: eur(ard), priorDeficits: deficits.map((d) => ({ millesime: d.millesime, montant: eur(d.montant) })) } as any);
      const tag = `#${i} ${JSON.stringify(input)}`;
      if (e.status !== "COMPUTED") { failures.push(`${tag} statut ${e.status}`); continue; }
      const f = e.figures!;
      const got = [f.capacite, f.amortDeduit, f.ardConsomme, f.ardNouvelle, f.stockArdFinal, f.resultatApresAmortissements, f.deficitsImputes, f.resultatFiscal, f.deficitNouveau].map((x) => Math.round((x as number) * 100));
      const want = [o.C, o.D, o.H, o.ARDn, o.ardClose, o.apres, o.imputes, o.resultat, o.deficitNouveau];
      if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${tag} moteur ${JSON.stringify(got)} ≠ oracle ${JSON.stringify(want)}`);
      // F006 avec la capacité exacte
      const r = produceFiscalResult({
        exerciceFiscal: 2026, activite: { dateMiseEnService: "2020-01-01" }, revenusAssistant: { exerciceFiscal: 2026, totalRecettes: eur(L + OP) },
        chargesAssistant: { exerciceFiscal: 2026, totalDeductible: eur(B + ACT), totalPreExploitation: 0, parCategorie: {} },
        amortissementAssistant: { exerciceFiscal: 2026, totalDotations: eur(dot), status: "validated" }, logementAmortissement: { computedAt: "2026-01-01T00:00:00.000Z" },
        stockAmortissementsReportes: eur(ard), stockDeficitsAnterieurs: deficits.map((d) => ({ millesime: d.millesime, montant: eur(d.montant) })),
        article39cExact: { capacite: eur(o.C), resultatAvantAmort: eur(o.avant) },
      } as any).result as any;
      if (r === undefined) { failures.push(`${tag} F006 refuse`); continue; }
      const f6 = [r.amortDeduct, r.amortReportesUtilises, r.amortNonDeduitExercice, r.stocks.amortissementsReportes, r.resultatFiscalAvantDeficits, r.deficitsImputes, r.resultatFiscal, r.deficitNouveau].map((x: number) => Math.round(x * 100));
      const w6 = [o.D, o.H, o.ARDn, o.ardClose, o.apres, o.imputes, o.resultat, o.deficitNouveau];
      if (JSON.stringify(f6) !== JSON.stringify(w6)) failures.push(`${tag} F006 ${JSON.stringify(f6)} ≠ oracle ${JSON.stringify(w6)}`);
      // OTHER_PRODUCT n'augmente jamais C : même C avec ou sans
      if (OP > 0) {
        const without = computeArticle39c({ exercice: 2026, amounts: amounts.filter((a) => a.class !== "OTHER_PRODUCT"), currentDepreciation: eur(dot) } as any);
        if (without.status === "COMPUTED" && Math.round((without.figures!.capacite as number) * 100) !== o.C) failures.push(`${tag} C change avec OTHER_PRODUCT`);
      }
    }
    console.log(`ENGINE FUZZ CASES EXECUTED=${ENGINE_CASES} FAILURES=${failures.length}`);
    assert.deepEqual(failures.slice(0, 6), []);
  });

  it("matérialité d'un montant non résolu (B ou ACTIVITY) : oracle des deux branches → IMMATERIAL ssi D, ARD final, résultat et déficit identiques (400 cas, frontières au centime)", () => {
    const rnd = prng(8675309);
    const pick = (max: number) => Math.floor(rnd() * (max + 1));
    const failures: string[] = [];
    for (let i = 0; i < 400; i++) {
      const L = 500000 + pick(2000000), B = pick(Math.round(L * 0.7)), U = 1 + pick(300000), ACT = rnd() < 0.4 ? pick(200000) : 0;
      const base = Math.max(0, L - B);
      const r = rnd();
      // dotation tirée autour des deux capacités (C si U est B ; C − U) pour exercer les frontières à ±1 centime
      const dot = Math.max(0, r < 0.3 ? base - U + (pick(2) - 1) : r < 0.6 ? base + (pick(2) - 1) : pick(base + 100000));
      const ard = rnd() < 0.4 ? pick(300000) : 0;
      const branch = (asB: boolean) => oracle({ E: L, CO: 0, CC: 0, AO: 0, AC: 0, B: B + (asB ? U : 0), ACTIVITY: ACT + (asB ? 0 : U), dotation: dot, ardOpen: ard, year: 2026 });
      const bB = branch(true), bA = branch(false);
      const sig = (o: ReturnType<typeof oracle>) => JSON.stringify([o.D, o.H, o.ardClose, o.apres, o.deficitNouveau, o.resultat]);
      const expectedImmaterial = sig(bB) === sig(bA);
      const amounts = [q("l", "L", L), q("b", "B", B), ...(ACT ? [q("a", "ACTIVITY", ACT)] : []), { id: "u", category: "u", amount: eur(U), class: "NEEDS_QUALIFICATION", plausibleClasses: ["B", "ACTIVITY"], qualificationLevel: "UNRESOLVED", provenance: "t", reason: "t" }];
      const e: any = computeArticle39c({ exercice: 2026, amounts, currentDepreciation: eur(dot), historicalArdStock: eur(ard) } as any);
      const immaterial = e.status === "COMPUTED_UNRESOLVED_IMMATERIAL";
      if (immaterial !== expectedImmaterial) failures.push(`#${i} L${L} B${B} U${U} ACT${ACT} dot${dot} ard${ard} : moteur ${e.status} ≠ oracle ${expectedImmaterial ? "IMMATERIAL" : "MATERIAL"} (${sig(bB)} vs ${sig(bA)})`);
      if (immaterial && sig(bB) !== JSON.stringify([Math.round(e.figures.amortDeduit * 100), Math.round(e.figures.ardConsomme * 100), Math.round(e.figures.stockArdFinal * 100), Math.round(e.figures.resultatApresAmortissements * 100), Math.round(e.figures.deficitNouveau * 100), Math.round(e.figures.resultatFiscal * 100)])) failures.push(`#${i} figures immatérielles ≠ oracle`);
    }
    assert.deepEqual(failures.slice(0, 6), []);
  });
});
