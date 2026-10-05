/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 §6 — MULTI adversarial : UN dossier = UNE activité consolidée = UN F006. Oracle indépendant sur les sommes globales.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/silent-error-gate/multi.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { DOSSIER, roundtrip } from "@/lib/lmnp/services/article-39c/article-39c-test-fixtures";
import { buildConsolidatedArticle39cFromWorkspace } from "@/lib/lmnp/services/article-39c/consolidation";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { resolveExactSwitch } from "@/lib/lmnp/services/declaration/exact-39c-switch";
import { checkWorkspace } from "./check";
import { prng, oracle } from "./oracle";
import { multiDossier, multiOracleInput, productionOptions, genProd, type MultiCase } from "./fixtures.test";
import { answer } from "./flows";

const run = (ws: PersistedWorkspace) => {
  let calls = 0;
  const result: any = runDeclarationGenerationFromWorkspace(ws, { ...productionOptions(ws), engine: { produceFiscalResult: (i: any) => { calls += 1; return produceFiscalResult(i); } } } as never);
  return { result, calls };
};

describe("GATE-1 — multi M1…M6 (littéraux manuels + oracle)", () => {
  it("M1 — deux biens simples : L 18 000, B 3 000, C 15 000, dotations 2 000 → D 2 000, résultat 13 000 (littéral) ; UN F006", () => {
    const m: MultiCase = { biens: [{ id: "A", E: 10000, TF: 2000, dotation: 1000 }, { id: "B", E: 8000, TF: 1000, dotation: 1000 }] };
    const { result, calls } = run(multiDossier(m));
    assert.equal(result.status, "generated", JSON.stringify(result.blockingReasons ?? result.anomalies));
    assert.equal(calls, 1, "UN SEUL F006");
    const f = result.rfs.fiscalResult;
    // L 18 000 − B 3 000 = avant 15 000 ; D 2 000 ; après 13 000 (écrits à la main)
    assert.deepEqual([f.recettes.total, f.resultatAvantAmort, f.amortDeduct, f.resultatFiscalAvantDeficits, f.resultatFiscal], [18000, 15000, 2000, 13000, 13000]);
    assert.deepEqual(checkWorkspace(multiDossier(m), multiOracleInput(m), "M1").diffs, []);
  });

  it("M2 — un bien bénéficiaire + un bien déficitaire : capacité GLOBALE (jamais par bien) ; L 17 000, B 7 000, C 10 000, dotations 4 000 déductibles en entier", () => {
    // Bien B seul aurait C = max(0, 2 000 − 5 000) = 0 : l'isolement par bien déduirait 3 000 seulement. Global : 4 000.
    const m: MultiCase = { biens: [{ id: "A", E: 15000, TF: 2000, dotation: 3000 }, { id: "B", E: 2000, TF: 5000, dotation: 1000 }] };
    const ws = multiDossier(m);
    const g: any = genProd(ws);
    assert.equal(g.status, "generated");
    const f = g.rfs.fiscalResult;
    assert.deepEqual([f.amortDeduct, f.amortNonDeduitExercice, f.resultatAvantAmort, f.resultatFiscal], [4000, 0, 10000, 6000]);
    assert.deepEqual(checkWorkspace(ws, multiOracleInput(m), "M2").diffs, []);
    const s = resolveExactSwitch(ws) as any;
    assert.equal(s.contract.capacite, 10000);
  });

  it("M3 — ACTIVITY globale : réduit le résultat, jamais C ; non allouée ; consommée UNE fois (comptable global 1 000 + comptable bien A 500)", () => {
    const m: MultiCase = { biens: [{ id: "A", E: 10000, TF: 2000, COMPTA: 500, dotation: 1000 }, { id: "B", E: 8000, TF: 1000, dotation: 1000 }], globalActivity: 1000 };
    const ws = multiDossier(m);
    const { result, calls } = run(ws);
    assert.equal(calls, 1);
    const f = result.rfs.fiscalResult;
    // L 18 000 ; B 3 000 ; ACTIVITY 1 500 ; C 15 000 ; avant 13 500 ; D 2 000 ; après 11 500
    assert.deepEqual([f.resultatAvantAmort, f.amortDeduct, f.resultatFiscalAvantDeficits], [13500, 2000, 11500]);
    const c = buildConsolidatedArticle39cFromWorkspace({ workspace: roundtrip(ws).reloaded, expectedDossierId: DOSSIER });
    assert.deepEqual([c.byClassCents.B, c.byClassCents.ACTIVITY, c.byClassCents.L], [300000, 150000, 1800000]);
    assert.ok(c.contributions.filter((x) => x.class === "ACTIVITY" && x.scope.level === "ACTIVITY").every((x) => !("propertyId" in x.scope)), "aucun propertyId fictif sur l'ACTIVITY globale");
  });

  it("M4 — qualification incertaine sur UN seul bien : l'incertitude survit à la consolidation (immatérielle : avertie ; matérielle : BLOQUÉ)", async () => {
    const mk = (dotation: number): PersistedWorkspace => multiDossier({ biens: [{ id: "A", E: 10000, TF: 2000, dotation }, { id: "B", E: 8000, TF: 1000, dotation: 0, extra: { collected: { taxeFonciere: 1000, fraisBancaires: 200 } as any } }] });
    // Frais bancaires 200 du bien B de nature inconnue (jamais zéro, jamais B par défaut)
    const immaterial = mk(0);
    const cI = buildConsolidatedArticle39cFromWorkspace({ workspace: immaterial, expectedDossierId: DOSSIER });
    const unresolved = cI.contributions.filter((x) => x.class === "NEEDS_QUALIFICATION");
    assert.equal(unresolved.length >= 1, true, "l'incertitude du bien B reste visible après consolidation");
    assert.ok(unresolved.every((x) => x.scope.level === "PROPERTY" && (x.scope as any).propertyId === "B"));
    const s = resolveExactSwitch(immaterial) as any;
    assert.equal(s.status, "READY");
    assert.deepEqual(s.contract.gate.preSwitch.exact.engine.warnings, ["UNRESOLVED_BUT_IMMATERIAL"]);
    // Frais bancaires 200 (B ou ACTIVITY) : C ∈ {14 800 ; 15 000}. Dotation 14 800 → même D dans les deux branches : immatériel.
    assert.equal(genProd(mk(14800)).status, "generated");
    // Dotation 14 900 → D = 14 800 (branche B, ARD 100) ou 14 900 (branche ACTIVITY) : MATÉRIEL → bloqué, l'incertitude n'a pas disparu.
    const material = mk(14900);
    assert.equal((resolveExactSwitch(material) as any).status, "BLOCKED");
    assert.equal(genProd(material).status, "blocked");
  });

  it("M5 — même identifiant de ligne et même montant sur deux biens : la qualification de A ne contamine jamais B", async () => {
    const two = (): PersistedWorkspace => multiDossier({ biens: [{ id: "A", E: 10000, dotation: 0, extra: { collected: { fraisBancaires: 200 } as any } }, { id: "B", E: 8000, dotation: 0, extra: { collected: { fraisBancaires: 200 } as any } }] });
    const ws = await answer(two(), "BANK_FEE_PURPOSE", "ACTIVITY_ACCOUNT", { propertyId: "A" });
    const c = buildConsolidatedArticle39cFromWorkspace({ workspace: ws, expectedDossierId: DOSSIER });
    const fee = (id: string) => c.contributions.find((x) => x.contributionId.includes(`${id}:frais-bancaires`))!;
    assert.deepEqual([fee("A").class, fee("B").class], ["ACTIVITY", "NEEDS_QUALIFICATION"]);
    assert.equal(fee("A").amountCents, fee("B").amountCents);
    assert.notEqual(fee("A").sourceFingerprint, fee("B").sourceFingerprint, "empreintes distinctes malgré un montant et un identifiant de ligne identiques");
  });

  it("M6 — stocks historiques GLOBAUX : le moteur les consomme UNE fois (oracle) ; la production (garde de domaine multi) les REFUSE tant que l'allocation par bien n'est pas établie", () => {
    const m: MultiCase = { biens: [{ id: "A", E: 10000, TF: 2000, dotation: 1000 }, { id: "B", E: 8000, TF: 1000, dotation: 1000 }], openingStocks: { deficits: [{ millesime: 2024, montant: 500 }], amortissementsReportes: 700 } };
    const ws = multiDossier(m);
    const o = oracle(multiOracleInput(m));
    assert.deepEqual([o.H, o.imputes], [70000, 50000]);
    // Moteur seul (options d'ouverture vides, comme les tests INT-5) : calcul exact global, aucune allocation.
    const technical: any = runDeclarationGenerationFromWorkspace(ws, {});
    assert.equal(technical.status, "generated");
    assert.deepEqual([technical.rfs.fiscalResult.amortReportesUtilises, technical.rfs.fiscalResult.deficitsImputes], [700, 500]);
    // Production (options dérivées de l'exercice, comme l'écran et la livraison serveur) : fail-closed, jamais calculé.
    const prod: any = genProd(ws);
    assert.equal(prod.status, "blocked");
    assert.ok(prod.anomalies.length > 0 || prod.blockingReasons.length > 0);
  });

  it("multi : ARD GÉNÉRÉE (dotation > C) → hors domaine, BLOQUÉ ; jamais allouée entre biens", () => {
    const ws = multiDossier({ biens: [{ id: "A", E: 3000, TF: 2500, dotation: 900 }, { id: "B", E: 1000, TF: 400, dotation: 900 }] });
    // L 4 000, B 2 900, C 1 100, dotations 1 800 → ARD 700 générée
    assert.equal(genProd(ws).status, "blocked");
  });

  it("multi : un bien F013 v2 + un bien SANS état v2 → EXACT impossible → BLOQUÉ (jamais proxy sur l'un, exact sur l'autre)", () => {
    const ws: any = multiDossier({ biens: [{ id: "A", E: 10000, TF: 2000, dotation: 1000 }, { id: "B", E: 8000, TF: 1000, dotation: 1000 }] });
    const biens = { ...ws.declarationDraft.biens, B: { ...ws.declarationDraft.biens.B, rentReconciliationV2: undefined, revenusAssistant: { exerciceFiscal: 2026, totalRecettes: 8000 } } };
    const mixed = { ...ws, declarationDraft: { ...ws.declarationDraft, biens } };
    const s = resolveExactSwitch(mixed) as any;
    assert.equal(s.mode, "EXACT_39C_V2");
    assert.equal(s.status, "BLOCKED");
    assert.equal(genProd(mixed).status, "blocked");
  });
});

// ---------------------------------------------------------------------------
// Fuzz multi : 250 dossiers (2 à 3 biens), ARD générée exclue (hors domaine), seed fixe
// ---------------------------------------------------------------------------
export const MULTI_FUZZ_SEED = 5102026;
export const MULTI_FUZZ_CASES = 250;

describe("GATE-1 — fuzz multi (oracle indépendant)", () => {
  it(`${MULTI_FUZZ_CASES} dossiers multi (seed ${MULTI_FUZZ_SEED}) : aucun écart, ONE F006`, () => {
    const rnd = prng(MULTI_FUZZ_SEED);
    const pick = (max: number) => Math.floor(rnd() * (max + 1));
    const failures: string[] = [];
    let executed = 0;
    for (let i = 0; i < MULTI_FUZZ_CASES; i++) {
      const n = 2 + pick(1);
      const biens = Array.from({ length: n }, (_, k) => {
        const some = (p: number, max: number) => (rnd() < p ? pick(max) : 0);
        const E = 2000 + pick(15000);
        // multi : première année uniquement (N+1 multi non supporté) → aucune créance / avance d'ouverture admise (GATE-1.1)
        const CO = 0, AO = 0, CC = some(0.3, 1500), AC = Math.min(some(0.25, 1500), E);
        return { id: ["A", "B", "C"][k]!, E, CO, CC, AO, AC, TF: pick(Math.round((E + CC - CO + AO - AC) * 0.8)), COMPTA: some(0.3, 800), dotation: 0 };
      });
      const L = biens.reduce((s, b) => s + b.E + b.CC - b.CO + b.AO - b.AC, 0);
      const B = biens.reduce((s, b) => s + b.TF, 0);
      const C = Math.max(0, L - B);
      // dotations réparties dont la somme reste ≤ C (aucune ARD générée) — la répartition entre biens est arbitraire
      let left = Math.floor(C * (rnd() < 0.2 ? 1 : rnd()));
      for (const b of biens) { const d = Math.min(left, pick(Math.max(0, left))); b.dotation = d; left -= d; }
      const m: MultiCase = { biens, globalActivity: rnd() < 0.5 ? pick(1500) : 0 };
      executed += 1;
      const ws = multiDossier(m);
      const res = checkWorkspace(ws, multiOracleInput(m), `#${i}`);
      if (res.blocked !== undefined) { failures.push(`#${i} BLOQUÉ ${res.blocked} ${JSON.stringify(m)}`); continue; }
      for (const d of res.diffs) failures.push(`${d} :: ${JSON.stringify(m)}`);
      const { calls } = run(ws);
      if (calls !== 1) failures.push(`#${i} F006 appelé ${calls} fois`);
    }
    console.log(`MULTI FUZZ CASES EXECUTED=${executed} FAILURES=${failures.length}`);
    assert.deepEqual(failures.slice(0, 10), []);
  });
});
