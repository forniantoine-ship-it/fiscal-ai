/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 §5 — MATRICE ADVERSARIALE mono (A → Z). Les attendus sont des LITTÉRAUX écrits à la main AVANT exécution (euros),
 * calculés sur papier depuis SAV-034 / SAV-030 / SAV-032 ; l'oracle indépendant est recoupé avec eux, puis le système productif.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/silent-error-gate/matrix.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { oracle } from "./oracle";
import { checkCase, checkWorkspace, toOracleInput } from "./check";
import { caseDossier, genProd, cents, type Case } from "./fixtures.test";
import { answer, declareCfe, ofKind } from "./flows";
import { exactDossier } from "@/lib/lmnp/services/article-39c/exact-generation-fixtures";
import { expense, pret, YEAR, DOSSIER } from "@/lib/lmnp/services/article-39c/article-39c-test-fixtures";
import { buildConsolidatedArticle39cFromWorkspace } from "@/lib/lmnp/services/article-39c/consolidation";
import { resolveExactSwitch } from "@/lib/lmnp/services/declaration/exact-39c-switch";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import { map2031FromRfs } from "@/runtime/capabilities/rfs/projection/map-2031-from-rfs";

type Exp = { L: number; C: number; D: number; H: number; ard: number; apres: number; defNew: number; imputes: number; res: number; l318: number; l330: number; l350: number; c7a: number; c7b: number };
const z = (e: Partial<Exp>): Exp => ({ L: 0, C: 0, D: 0, H: 0, ard: 0, apres: 0, defNew: 0, imputes: 0, res: 0, l318: 0, l330: 0, l350: 0, c7a: 0, c7b: 0, ...e });

/** Écrit À LA MAIN (euros). id = lettre de la matrice du prompt GATE-1. */
const MATRIX: Array<{ id: string; label: string; c: Case; exp: Exp }> = [
  { id: "A", label: "premier exercice simple", c: { E: 12000, TF: 3000, COMPTA: 600, dotation: 4000 }, exp: z({ L: 12000, C: 9000, D: 4000, apres: 4400, res: 4400, l350: 4400, c7a: 4400 }) },
  { id: "B", label: "exercice partiel : AUCUN prorata de loyer, dotation limitée à C", c: { E: 5000, TF: 2000, dotation: 4000 }, exp: z({ L: 5000, C: 3000, D: 3000, ard: 1000, l318: 1000 }) },
  { id: "C", label: "loyer de décembre payé en janvier (CC)", c: { E: 11000, CC: 1000, TF: 3000, dotation: 0 }, exp: z({ L: 12000, C: 9000, apres: 9000, res: 9000, l350: 9000, c7a: 9000 }) },
  { id: "D", label: "loyer N+1 encaissé en décembre (AC)", c: { E: 13000, AC: 1000, TF: 3000, dotation: 0 }, exp: z({ L: 12000, C: 9000, apres: 9000, res: 9000, l350: 9000, c7a: 9000 }) },
  { id: "E", label: "créance d'ouverture encaissée en N (CO) : pas de double produit", c: { E: 13000, CO: 1000, TF: 3000, dotation: 0 }, exp: z({ L: 12000, C: 9000, apres: 9000, res: 9000, l350: 9000, c7a: 9000 }) },
  { id: "F", label: "avance d'ouverture devenue acquise (AO)", c: { E: 11000, AO: 1000, TF: 3000, dotation: 0 }, exp: z({ L: 12000, C: 9000, apres: 9000, res: 9000, l350: 9000, c7a: 9000 }) },
  { id: "G", label: "CO et CC simultanés", c: { E: 12500, CO: 500, CC: 1000, TF: 3000, dotation: 0 }, exp: z({ L: 13000, C: 10000, apres: 10000, res: 10000, l350: 10000, c7a: 10000 }) },
  { id: "H", label: "AO et AC simultanés", c: { E: 12000, AO: 300, AC: 800, TF: 3000, dotation: 0 }, exp: z({ L: 11500, C: 8500, apres: 8500, res: 8500, l350: 8500, c7a: 8500 }) },
  { id: "I", label: "ACTIVITY > résultat locatif : C indépendante du résultat global (oracle SAV-030/032 B)", c: { E: 10000, TF: 7000, COMPTA: 4000, dotation: 2500 }, exp: z({ L: 10000, C: 3000, D: 2500, apres: -3500, defNew: 3500, l330: 3500, c7b: 3500 }) },
  { id: "K", label: "B > L : C = 0, aucun amortissement 39 C déductible", c: { E: 6000, TF: 7000, dotation: 2000 }, exp: z({ L: 6000, C: 0, D: 0, ard: 2000, apres: -1000, defNew: 1000, l318: 2000, l330: 1000, c7b: 1000 }) },
  { id: "L", label: "C exactement égal à la dotation", c: { E: 10000, TF: 7000, dotation: 3000 }, exp: z({ L: 10000, C: 3000, D: 3000 }) },
  { id: "M1", label: "C inférieur de 1 centime à la dotation", c: { E: 10000, TF: 7000, dotation: 3000.01 }, exp: z({ L: 10000, C: 3000, D: 3000, ard: 0.01, l318: 0.01 }) },
  { id: "M2", label: "C supérieur de 1 centime à la dotation", c: { E: 10000, TF: 7000, dotation: 2999.99 }, exp: z({ L: 10000, C: 3000, D: 2999.99, apres: 0.01, res: 0.01, l350: 0.01, c7a: 0.01 }) },
  { id: "N", label: "ARD historique + dotation courante : courant avant historique", c: { E: 10000, TF: 4000, dotation: 2000, ardOpen: 3000 }, exp: z({ L: 10000, C: 6000, D: 2000, H: 3000, apres: 1000, res: 1000, l350: 4000, c7a: 1000 }) },
  { id: "O", label: "ARD historique supérieure à la capacité résiduelle : stock final 1 000", c: { E: 10000, TF: 4000, dotation: 2000, ardOpen: 5000 }, exp: z({ L: 10000, C: 6000, D: 2000, H: 4000, ard: 1000, l350: 4000 }) },
  { id: "P", label: "déficits antérieurs + résultat positif : imputés APRÈS D/H, jamais dans C", c: { E: 10000, TF: 4000, dotation: 1000, deficits: [{ millesime: 2024, montant: 2000 }, { millesime: 2025, montant: 1500 }] }, exp: z({ L: 10000, C: 6000, D: 1000, apres: 5000, imputes: 3500, res: 1500, l350: 5000, c7a: 5000 }) },
  { id: "P2", label: "déficits antérieurs partiellement imputés (plus anciens d'abord)", c: { E: 10000, TF: 4000, dotation: 1000, deficits: [{ millesime: 2023, montant: 4000 }, { millesime: 2025, montant: 3000 }] }, exp: z({ L: 10000, C: 6000, D: 1000, apres: 5000, imputes: 5000, res: 0, l350: 5000, c7a: 5000 }) },
  { id: "Q", label: "résultat négatif avant amortissement", c: { E: 6000, TF: 2000, COMPTA: 5000, dotation: 3000 }, exp: z({ L: 6000, C: 4000, D: 3000, apres: -4000, defNew: 4000, l330: 4000, c7b: 4000 }) },
  { id: "AA", label: "bien vacant toute l'année (L = 0)", c: { E: 0, TF: 1500, dotation: 2000 }, exp: z({ L: 0, C: 0, D: 0, ard: 2000, apres: -1500, defNew: 1500, l318: 2000, l330: 1500, c7b: 1500 }) },
  { id: "AB", label: "ARD historique seule (dotation 0)", c: { E: 6000, TF: 1000, dotation: 0, ardOpen: 2500 }, exp: z({ L: 6000, C: 5000, H: 2500, apres: 2500, res: 2500, l350: 5000, c7a: 2500 }) },
  { id: "AC", label: "déficit de 2015 périmé en 2026 (10 ans) : non imputé", c: { E: 10000, TF: 1000, dotation: 1000, deficits: [{ millesime: 2015, montant: 3000 }] }, exp: z({ L: 10000, C: 9000, D: 1000, apres: 8000, res: 8000, l350: 8000, c7a: 8000 }) },
  { id: "AD", label: "déficit de 2016 encore imputable en 2026", c: { E: 10000, TF: 1000, dotation: 1000, deficits: [{ millesime: 2016, montant: 3000 }] }, exp: z({ L: 10000, C: 9000, D: 1000, apres: 8000, imputes: 3000, res: 5000, l350: 8000, c7a: 8000 }) },
];

const eurosOf = (n: number | string) => (typeof n === "number" ? n / 100 : 0);

describe("GATE-1 — matrice mono (littéraux manuels)", () => {
  for (const { id, label, c, exp } of MATRIX) {
    it(`${id} — ${label}`, () => {
      // 1. l'oracle indépendant reproduit le calcul manuel
      const o = oracle(toOracleInput(c));
      assert.deepEqual(
        [o.L, o.C, o.D, o.H, o.ardClose, o.apres, o.deficitNouveau, o.imputes, o.resultat, o.l318, o.l330, o.l350, o.c7a, o.c7b],
        [exp.L, exp.C, exp.D, exp.H, exp.ard, exp.apres, exp.defNew, exp.imputes, exp.res, exp.l318, exp.l330, exp.l350, exp.c7a, exp.c7b].map(cents),
        "oracle ≠ calcul manuel",
      );
      // 2. le système productif (génération, 2033-B, 2031, capacité, reload) concorde avec l'oracle
      const r = checkCase(c, id);
      assert.equal(r.blocked, undefined, `${id} bloqué : ${r.blocked}`);
      assert.deepEqual(r.diffs, []);
      // 3. et avec les littéraux manuels
      const ob = r.observed!;
      assert.deepEqual(
        [ob.L, ob.D, ob.H, ob.ardClose, ob.apres, ob.deficitNouveau, ob.imputes, ob.resultat, ob.l318, ob.l330, ob.l350, ob.c7a, ob.c7b].map(eurosOf),
        [exp.L, exp.D, exp.H, exp.ard, exp.apres, exp.defNew, exp.imputes, exp.res, exp.l318, exp.l330, exp.l350, exp.c7a, exp.c7b],
      );
    });
  }
});

// ---------------------------------------------------------------------------
// J — OTHER_PRODUCT (aucune source de dossier : moteur + F006, oracle manuel)
// ---------------------------------------------------------------------------
import { computeArticle39c } from "@/runtime/capabilities/f006/article-39c-capacity";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";

describe("GATE-1 — J : OTHER_PRODUCT n'augmente jamais C", () => {
  it("L 5 000, B 4 000, OTHER_PRODUCT 10 000, dotation 5 000 → C 1 000 (jamais 11 000), D 1 000, ARD 4 000, après 10 000", () => {
    const q = (id: string, cls: "L" | "B" | "OTHER_PRODUCT", amount: number) => ({ id, category: id, amount, class: cls, qualificationLevel: "DIRECT" as const, provenance: "t", reason: "t" });
    const e = computeArticle39c({ exercice: YEAR, amounts: [q("l", "L", 5000), q("b", "B", 4000), q("op", "OTHER_PRODUCT", 10000)], currentDepreciation: 5000 });
    assert.equal(e.status, "COMPUTED");
    const f = e.figures!;
    assert.deepEqual([f.capacite, f.amortDeduit, f.stockArdFinal, f.resultatApresAmortissements], [1000, 1000, 4000, 10000]);
    const result = produceFiscalResult({
      exerciceFiscal: YEAR, activite: { dateMiseEnService: "2020-01-01" }, revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 15000 },
      chargesAssistant: { exerciceFiscal: YEAR, totalDeductible: 4000, totalPreExploitation: 0, parCategorie: {} },
      amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 5000, status: "validated" }, logementAmortissement: { computedAt: "2026-01-01T00:00:00.000Z" },
      article39cExact: { capacite: f.capacite!, resultatAvantAmort: f.resultatAvantAmort },
    }).result!;
    assert.deepEqual([result.amortDeduct, result.amortNonDeduitExercice, result.resultatFiscalAvantDeficits, result.resultatFiscal], [1000, 4000, 10000, 10000]);
  });
});

// ---------------------------------------------------------------------------
// R / S / T / U — CFE
// ---------------------------------------------------------------------------
describe("GATE-1 — CFE (R/S/T/U), frontière de matérialité au centime", () => {
  const base = (dotation: number) => caseDossier({ E: 10000, TF: 7000, dotation });
  it("R — CFE base minimum : ACTIVITY / STRONG_INFERENCE ; L 10k, B 7k, CFE 1k, dotation 2,5k → C 3k, D 2,5k, après −500, déficit 500", async () => {
    const ws = await answer(await declareCfe(base(2500), "1000"), "CFE_BASE", "MINIMUM_BASE");
    const cfe = buildConsolidatedArticle39cFromWorkspace({ workspace: ws, expectedDossierId: DOSSIER }).contributions.find((x) => x.source === "CFE_NOTICE")!;
    assert.deepEqual([cfe.class, cfe.proofLevel], ["ACTIVITY", "STRONG_INFERENCE"]);
    const r = checkWorkspace(ws, { ...toOracleInput({ E: 10000, TF: 7000, COMPTA: 1000, dotation: 2500 }) }, "R");
    assert.deepEqual([r.blocked, r.diffs], [undefined, []]);
    assert.deepEqual([r.observed!.apres, r.observed!.deficitNouveau, r.observed!.l330], [-50000, 50000, 50000]);
  });
  it("S — CFE valeur locative + dotation matérielle : BLOQUÉ (jamais classée automatiquement en B)", async () => {
    const ws = await answer(await declareCfe(base(2500), "1000"), "CFE_BASE", "RENTAL_VALUE_BASE");
    assert.equal(resolveExactSwitch(ws).mode === "EXACT_39C_V2" && (resolveExactSwitch(ws) as any).status, "BLOCKED");
    assert.equal(genProd(ws).status, "blocked");
  });
  it("T — CFE inconnue : COMPUTED_UNRESOLVED_IMMATERIAL seulement si réellement immatérielle (dotation 0 → ou égale à C la plus basse)", async () => {
    // L 10 000, B 7 000, CFE 500 : branche B → C 2 500 ; branche ACTIVITY → C 3 000. Dotation 2 500 : même D, même résultat → immatériel.
    for (const dotation of [0, 2500]) {
      const ws = await answer(await declareCfe(base(dotation), "500"), "CFE_BASE", "DONT_KNOW");
      const s = resolveExactSwitch(ws) as any;
      assert.equal(s.status, "READY", `dotation ${dotation}`);
      assert.equal(s.contract.gate.preSwitch.exact.engine.status, "COMPUTED_UNRESOLVED_IMMATERIAL");
      const g: any = genProd(ws);
      assert.equal(g.status, "generated");
      assert.equal(g.rfs.fiscalResult.resultatAvantAmort, 2500, "la CFE (500) est déduite UNE fois, jamais zéro, jamais doublée");
      assert.equal(g.rfs.fiscalResult.amortDeduct, dotation);
    }
  });
  it("U — au centime au-dessus de la frontière (2 500,01) l'incertitude devient MATÉRIELLE → BLOQUÉ", async () => {
    const ws = await answer(await declareCfe(base(2500.01), "500"), "CFE_BASE", "DONT_KNOW");
    assert.equal((resolveExactSwitch(ws) as any).status, "BLOCKED");
    assert.equal(genProd(ws).status, "blocked");
  });
});

// ---------------------------------------------------------------------------
// V / W — F011 / F012 frais de financement
// ---------------------------------------------------------------------------
describe("GATE-1 — V/W : même frais ou frais distincts (littéraux)", () => {
  const spec = (dotation = 0) => exactDossier({ cash: 12000, dotation, collected: { fraisBancaires: 500 } as any, bien: { financement: [pret({ pretId: "loan-1", fraisDossierDeductibles: 500 })] } });
  const withLoan = (ws: any) => ({ ...ws, declarationDraft: { ...ws.declarationDraft, creditDeclaredNoneAt: undefined, creditConfirmedAt: "2026-01-01T00:00:00.000Z" } });
  const financing = async () => answer(withLoan(spec()), "BANK_FEE_PURPOSE", "FINANCING");
  it("V — même frais (réponse explicite) : UNE charge de 500 → résultat avant amortissement 11 500", async () => {
    const ws = await answer(await financing(), "BANK_FEE_ALREADY_IN_LOAN", "ALREADY_IN_LOAN");
    const g: any = genProd(ws);
    assert.equal(g.status, "generated");
    assert.deepEqual([g.rfs.fiscalResult.charges.totalDeductible, g.rfs.fiscalResult.resultatAvantAmort], [500, 11500]);
  });
  it("W — même montant, frais différents (réponse explicite) : DEUX charges → 1 000 / 11 000", async () => {
    const ws = await answer(await financing(), "BANK_FEE_ALREADY_IN_LOAN", "DISTINCT");
    const g: any = genProd(ws);
    assert.deepEqual([g.rfs.fiscalResult.charges.totalDeductible, g.rfs.fiscalResult.resultatAvantAmort], [1000, 11000]);
  });
});

// ---------------------------------------------------------------------------
// X / Y / Z — copropriété, assurance, gestion
// ---------------------------------------------------------------------------
describe("GATE-1 — X/Y/Z : classification des charges (littéraux)", () => {
  it("X — copropriété : provisions 2 000, régularisation −300 (net 1 700 → B), fonds de travaux 400 (non déductible → 330) ; dotation 1 000", () => {
    const ws = caseDossier({ E: 12000, dotation: 1000, extra: { collected: { coproLignes: [{ id: "p", type: "provisions", montant: 2000 }, { id: "r", type: "regularisation", montant: -300 }, { id: "f", type: "fonds_travaux", montant: 400 }] } as any } });
    const g: any = genProd(ws);
    assert.equal(g.status, "generated", JSON.stringify(g.blockingReasons ?? g.anomalies));
    const f = g.rfs.fiscalResult;
    // L 12 000 ; B 1 700 ; C 10 300 ; avant 10 300 ; D 1 000 ; après 9 300 ; ND 400
    assert.deepEqual([f.resultatAvantAmort, f.amortDeduct, f.resultatFiscalAvantDeficits, f.charges.totalNonDeductible], [10300, 1000, 9300, 400]);
    const form = map2033BFromRfs(g.rfs);
    const v = (id: string) => (form.cases.find((x: any) => x.caseId === id) as any)?.value ?? 0;
    assert.deepEqual([v("312"), v("314"), v("318"), v("330"), v("350")], [8900, 0, 0, 400, 9300]);
    assert.equal(v("312") - v("314") + v("318") + v("330") - v("350"), 0);
    assert.equal(form.balancing.status, "BALANCED");
    assert.equal((map2031FromRfs(g.rfs).cases.find((x: any) => x.caseId === "I_7A") as any).value, 9300);
  });
  it("Y — assurance : PNO explicite (champ PNO) → B ; assurance documentaire ambiguë → NEEDS_QUALIFICATION jusqu'à la réponse « oui »", async () => {
    const explicit = caseDossier({ E: 12000, dotation: 0, extra: { collected: { assurancePno: 400 } as any } });
    assert.equal(buildConsolidatedArticle39cFromWorkspace({ workspace: explicit, expectedDossierId: DOSSIER }).contributions.find((x) => x.contributionId.includes("assurance-pno"))!.class, "B");
    const ambiguous = caseDossier({ E: 12000, dotation: 0, extra: { collected: { documentExpenses: [expense({ id: "ass-1", category: "assurance_pno", montant: 400, insuranceKind: "logement" })] } as any } });
    assert.equal(buildConsolidatedArticle39cFromWorkspace({ workspace: ambiguous, expectedDossierId: DOSSIER }).contributions.find((x) => x.contributionId.includes("assurance-pno"))!.class, "NEEDS_QUALIFICATION");
    assert.equal(ofKind(ambiguous, "PNO_CONFIRMATION").length, 1);
    const yes = await answer(ambiguous, "PNO_CONFIRMATION", "YES");
    assert.equal(buildConsolidatedArticle39cFromWorkspace({ workspace: yes, expectedDossierId: DOSSIER }).contributions.find((x) => x.contributionId.includes("assurance-pno"))!.class, "B");
  });
  it("Z — gestion : honoraires ambigus → NEEDS_QUALIFICATION ; « gestion courante » explicite → B ; « mise en location » → reste non résolu", async () => {
    const ws = caseDossier({ E: 12000, dotation: 0, extra: { collected: { honorairesGestion: 800 } as any } });
    const cls = (w: any) => buildConsolidatedArticle39cFromWorkspace({ workspace: w, expectedDossierId: DOSSIER }).contributions.find((x) => x.contributionId.includes("honoraires-gestion"))!.class;
    assert.equal(cls(ws), "NEEDS_QUALIFICATION");
    assert.equal(cls(await answer(ws, "AGENCY_FEE_NATURE", "PROPERTY_MANAGEMENT")), "B");
    assert.equal(cls(await answer(ws, "AGENCY_FEE_NATURE", "LETTING")), "NEEDS_QUALIFICATION");
  });
});
