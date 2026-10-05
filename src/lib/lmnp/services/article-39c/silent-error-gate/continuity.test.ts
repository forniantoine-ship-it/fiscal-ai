/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 §7 — CONTINUITÉ N → N+1 (→ N+2) par la VRAIE transition (clôture, prepareFiscalYearTransitionCandidate, parcours F013 v2 de
 * N+1, génération avec les options de production). Les attendus de N+1 se déduisent de l'oracle indépendant appliqué à N.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/silent-error-gate/continuity.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { map2033AFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033a";
import { map2033CFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033c";
import { prng, oracle, type OracleInput } from "./oracle";
import { checkWorkspace, toOracleInput } from "./check";
import { caseDossier, closeAndOpenNext, nextYearDossier, genProd, rentFull, cents, type Case } from "./fixtures.test";
import { genCase } from "./gen";
import { roundtrip } from "@/lib/lmnp/services/article-39c/article-39c-test-fixtures";

const val = (cases: { caseId: string; value?: unknown }[], id: string) => (cases.find((c) => c.caseId === id)?.value as number | undefined) ?? 0;
const c100 = (n: number) => Math.round(n * 100);

describe("GATE-1 — continuité : scénarios nommés (littéraux manuels)", () => {
  // N : L = 10 000 + 1 000 − 0 + 0 − 500 = 10 500 ; B 7 000 ; ACTIVITY 1 000 ; C 3 500 ; dotation 6 000 → D 3 500, ARD 2 500 ; avant 2 500 ; après −1 000 → déficit 1 000.
  const N: Case = { E: 10000, CC: 1000, AC: 500, TF: 7000, COMPTA: 1000, dotation: 6000 };

  it("CC(N) = CO(N+1), AC(N) = AO(N+1) (provenance conservée), ARD 2 500 et déficit 2026 : 1 000 repris en ouverture ; clôture = stocks de N", () => {
    const t = closeAndOpenNext(caseDossier(N));
    assert.equal(t.ok, true);
    if (!t.ok) return;
    assert.deepEqual(t.closure, { deficits: [{ millesime: 2026, montant: 1000 }], amortissementsReportes: 2500, deficitsExpires: [] } as any);
    const fy: any = t.next.fiscalYear;
    assert.deepEqual(fy.stocksOuverture.stocks.deficits, [{ millesime: 2026, montant: 1000 }]);
    assert.equal(fy.stocksOuverture.stocks.amortissementsReportes, 2500);
    assert.ok(typeof fy.stocksOuverture.sourceClosureId === "string" && fy.stocksOuverture.sourceClosureId.length > 0, "provenance de la clôture conservée");
    const rent: any = (t.next.declarationDraft as any).rentReconciliationV2;
    assert.deepEqual([rent.facts.openingReceivables.status, rent.facts.openingReceivables.amountCents, rent.facts.openingAdvances.status, rent.facts.openingAdvances.amountCents], ["VALIDATED", 100000, "VALIDATED", 50000]);
    assert.equal(rent.facts.openingReceivables.provenance.kind, "prior_year_continuity");
    assert.equal(rent.facts.closingReceivables.status, "UNKNOWN", "CC(N) ne devient jamais CC(N+1)");
    assert.equal(rent.facts.collections.status, "UNKNOWN");
  });

  it("N+1 (littéral) : E 11 000, CC 300, TF 7 000, comptable 1 000, dotation 1 500 → L 10 800, C 3 800, D 1 500, H 2 300, après −1 000, ARD 200, déficits [2026 : 1 000 ; 2027 : 1 000] ; 2033-A/C cumulés", () => {
    const t = closeAndOpenNext(caseDossier(N));
    if (!t.ok) throw new Error(t.reason);
    const n1: Case = { E: 11000, CC: 300, TF: 7000, COMPTA: 1000, dotation: 1500 };
    const ws = nextYearDossier(t.next, n1);
    const g: any = genProd(ws);
    assert.equal(g.status, "generated", JSON.stringify(g.blockingReasons ?? g.anomalies));
    const f = g.rfs.fiscalResult;
    assert.deepEqual([f.recettes.total, f.amortDeduct, f.amortReportesUtilises, f.resultatFiscalAvantDeficits, f.stocks.amortissementsReportes], [10800, 1500, 2300, -1000, 200]);
    assert.deepEqual(f.stocks.deficits, [{ millesime: 2026, montant: 1000 }, { millesime: 2027, montant: 1000 }]);
    // 2033-A / 2033-C : amortissements cumulés comptables = 6 000 (N) + 1 500 (N+1) = 7 500, indépendamment du plafond 39 C
    const a = map2033AFromRfs(g.rfs).cases as any[];
    const c = map2033CFromRfs(g.rfs).cases as any[];
    assert.deepEqual([val(a, "028"), val(a, "030")], [200000, 7500]);
    assert.deepEqual([val(c, "490"), val(c, "570"), val(c, "572"), val(c, "576")], [200000, 6000, 1500, 7500]);
    assert.deepEqual(checkWorkspace(ws, { E: cents(11000), CO: cents(1000), CC: cents(300), AO: cents(500), AC: 0, B: cents(7000), ACTIVITY: cents(1000), dotation: cents(1500), ardOpen: cents(2500), deficits: [{ millesime: 2026, montant: cents(1000) }], year: 2027 }, "N+1").diffs, []);
  });

  it("zéro validé reste zéro ; UNKNOWN ne devient jamais zéro (clôture refusée) ; reload : mêmes chiffres N+1", () => {
    const t = closeAndOpenNext(caseDossier({ E: 12000, TF: 3000, dotation: 0 }));
    if (!t.ok) throw new Error(t.reason);
    const rent: any = (t.next.declarationDraft as any).rentReconciliationV2;
    assert.deepEqual([rent.facts.openingReceivables, rent.facts.openingAdvances].map((x) => [x.status, x.amountCents]), [["VALIDATED", 0], ["VALIDATED", 0]]);
    // CC(N) inconnue : la clôture N est refusée, aucun N+1 produit
    const unknown: any = caseDossier({ E: 12000, TF: 3000, dotation: 0 });
    const st = rentFull("prop-1", { E: 12000 });
    unknown.declarationDraft.rentReconciliationV2 = { ...st, facts: { ...st.facts, closingReceivables: { status: "UNKNOWN" } } };
    const refused = (() => { try { return closeAndOpenNext(unknown); } catch { return { ok: false } as const; } })();
    assert.equal(refused.ok, false);
    // reload
    const ws = nextYearDossier(t.next, { E: 12500, TF: 3000, dotation: 0 });
    const a: any = genProd(ws);
    const b: any = genProd(roundtrip(ws).reloaded);
    assert.deepEqual([b.status, b.rfs.fiscalResult.resultatFiscal], [a.status, a.rfs.fiscalResult.resultatFiscal]);
  });

  it("déficit de 2016 en ouverture : périmé en N+1 (2027 − 2016 = 11 > 10), jamais imputé ; déplacé en `deficitsExpires`", () => {
    const n: Case = { E: 10000, TF: 1000, dotation: 1000, deficits: [{ millesime: 2016, montant: 3000 }] };
    // N (2026) : 2016 imputable (10 ans) → résultat 8 000 − 3 000
    assert.deepEqual(checkWorkspace(caseDossier(n), toOracleInput(n), "N").diffs, []);
    const strict: Case = { E: 10000, TF: 9500, dotation: 0, deficits: [{ millesime: 2016, montant: 3000 }] }; // après 500 < 3 000 → 2 500 restent
    const t = closeAndOpenNext(caseDossier(strict));
    if (!t.ok) throw new Error(t.reason);
    assert.deepEqual(t.closure.deficits, [{ millesime: 2016, montant: 2500 }]);
    const ws = nextYearDossier(t.next, { E: 10000, TF: 1000, dotation: 0 });
    const g: any = genProd(ws);
    assert.equal(g.status, "generated");
    assert.equal(g.rfs.fiscalResult.deficitsImputes, 0, "déficit 2016 périmé en 2027");
    assert.equal(g.rfs.fiscalResult.resultatFiscal, 9000);
  });
});

// ---------------------------------------------------------------------------
// Chaînes fuzz N → N+1 (→ N+2) : seed fixe
// ---------------------------------------------------------------------------
export const CHAIN_SEED = 77102026;
export const CHAIN_CASES = 120;

describe("GATE-1 — chaînes N → N+1 → N+2 (oracle indépendant chaîné)", () => {
  it(`${CHAIN_CASES} chaînes (seed ${CHAIN_SEED}) : stocks, CO/AO, 2033-A/C et résultats concordent à chaque exercice`, () => {
    const rnd = prng(CHAIN_SEED);
    const pick = (max: number) => Math.floor(rnd() * (max + 1));
    const failures: string[] = [];
    let steps = 0;
    for (let i = 0; i < CHAIN_CASES; i++) {
      let prevCase = genCase(rnd);
      let prevWs = caseDossier(prevCase);
      let prevIn: OracleInput = toOracleInput(prevCase);
      let year = 2026;
      let cum = 0; // amortissements cumulés comptables à la clôture de l'exercice précédent
      const depth = i % 4 === 0 ? 2 : 1;
      const first = checkWorkspace(prevWs, prevIn, `chain#${i}/N`);
      steps += 1;
      if (first.blocked !== undefined || first.diffs.length > 0) { failures.push(...first.diffs.slice(0, 3), `chain#${i}/N ${JSON.stringify(prevCase)}`); continue; }
      cum = c100(prevCase.dotation);
      for (let d = 0; d < depth; d++) {
        const exp = oracle(prevIn);
        const t = closeAndOpenNext(prevWs);
        if (!t.ok) { failures.push(`chain#${i}/${year} transition refusée: ${t.reason}`); break; }
        const stockOk = c100(t.closure.amortissementsReportes) === exp.ardClose && JSON.stringify(t.closure.deficits.map((x) => [x.millesime, c100(x.montant)])) === JSON.stringify(exp.deficitsClose.map((x) => [x.millesime, x.montant]));
        if (!stockOk) failures.push(`chain#${i}/${year} stocks de clôture ≠ oracle: ${JSON.stringify(t.closure)} vs ${JSON.stringify([exp.ardClose, exp.deficitsClose])}`);
        year += 1;
        const E = 7000 + pick(20000);
        const next: Case = { E, CC: rnd() < 0.3 ? pick(2000) : 0, AC: rnd() < 0.25 ? pick(2000) : 0, TF: pick(Math.round(E * 0.7)), COMPTA: rnd() < 0.5 ? pick(2500) : 0, dotation: pick(5000) };
        const ws = nextYearDossier(t.next, next, year);
        const input: OracleInput = {
          E: cents(next.E), CO: prevIn.CC, CC: cents(next.CC ?? 0), AO: prevIn.AC, AC: cents(next.AC ?? 0), B: cents(next.TF ?? 0), ACTIVITY: cents(next.COMPTA ?? 0),
          dotation: cents(next.dotation), ardOpen: exp.ardClose, deficits: exp.deficitsClose, year,
        };
        const res = checkWorkspace(ws, input, `chain#${i}/${year}`);
        steps += 1;
        if (res.blocked !== undefined) { failures.push(`chain#${i}/${year} BLOQUÉ ${res.blocked} ${JSON.stringify({ prevCase, next })}`); break; }
        for (const x of res.diffs) failures.push(`${x} :: ${JSON.stringify({ prevCase, next })}`);
        // 2033-A / 2033-C : cumuls comptables (indépendants du 39 C)
        const g: any = genProd(ws);
        const a = map2033AFromRfs(g.rfs).cases as any[];
        const c = map2033CFromRfs(g.rfs).cases as any[];
        const cumNext = cum + cents(next.dotation);
        if (c100(val(a, "030")) !== cumNext || c100(val(c, "576")) !== cumNext || c100(val(c, "572")) !== cents(next.dotation) || (cum > 0 && c100(val(c, "570")) !== cum)) {
          failures.push(`chain#${i}/${year} amortissements cumulés: 030=${val(a, "030")} 570=${val(c, "570")} 572=${val(c, "572")} 576=${val(c, "576")} attendu ${cum / 100} + ${next.dotation}`);
        }
        cum = cumNext;
        prevCase = next as any; prevWs = ws; prevIn = input;
      }
    }
    console.log(`CHAIN STEPS EXECUTED=${steps} CHAINS=${CHAIN_CASES} FAILURES=${failures.length}`);
    assert.deepEqual(failures.slice(0, 10), []);
  });
});
