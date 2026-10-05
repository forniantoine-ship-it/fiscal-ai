/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 §21 — erreurs silencieuses TROUVÉES : un test par erreur, ROUGE avant correction, conservé comme non-régression.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/silent-error-gate/findings.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exactDossier } from "@/lib/lmnp/services/article-39c/exact-generation-fixtures";
import { pret } from "@/lib/lmnp/services/article-39c/article-39c-test-fixtures";
import { f011FeesMayExplainAmount } from "@/lib/lmnp/services/article-39c/from-f012";
import { FIRST_YEAR_OPENING_BALANCES_UNSUPPORTED_CODE, resolveExactSwitch } from "@/lib/lmnp/services/declaration/exact-39c-switch";
import { genProd, caseDossier } from "./fixtures.test";
import { answer, ofKind } from "./flows";

const loanWorkspace = (fraisBancaires: number, dotation = 0) => {
  const ws: any = exactDossier({ cash: 12000, dotation, collected: { fraisBancaires } as any, bien: { financement: [pret({ pretId: "loan-1", fraisDossierDeductibles: 500 })] } });
  return { ...ws, declarationDraft: { ...ws.declarationDraft, creditDeclaredNoneAt: undefined, creditConfirmedAt: "2026-01-01T00:00:00.000Z" } };
};

describe("SILENT ERROR #1 — frais bancaires F012 de même montant que les frais de prêt F011, identité NON tranchée, dotation immatérielle", () => {
  it("le client déclare « frais de financement » (prêt loan-1) sans dire s'ils sont déjà dans les frais du prêt : la génération ne doit PAS aboutir (500 € possiblement comptés deux fois)", async () => {
    // Faits : encaissements 12 000 ; F011 : frais de dossier 500 (prêt loan-1) ; F012 : frais bancaires 500 ; dotation 0.
    const ws = await answer(loanWorkspace(500), "BANK_FEE_PURPOSE", "FINANCING");
    assert.equal(ofKind(ws, "BANK_FEE_ALREADY_IN_LOAN").length, 1, "la question d'identité est posée mais pas répondue");
    // Résultat attendu si c'est le MÊME frais : 12 000 − 500 = 11 500. Si deux frais distincts : 11 000. Les deux sont plausibles → aucun résultat définitif.
    const g: any = genProd(ws);
    assert.equal(g.status, "blocked", `résultat avant amortissement ${g.rfs?.fiscalResult.resultatAvantAmort} produit sans blocage alors que 11 500 et 11 000 sont tous deux plausibles`);
  });
});

describe("GATE-1.1 — erreur silencieuse #1 : trio d'oracles (même fait / faits distincts / ambigu)", () => {
  const financing = async (fraisBancaires = 500) => answer(loanWorkspace(fraisBancaires), "BANK_FEE_PURPOSE", "FINANCING");
  it("même fait explicitement démontré → 500 € UNE fois (11 500) ; deux faits explicitement distincts → 1 000 € (11 000) ; ambigu / « je ne sais pas » → BLOCK", async () => {
    const same: any = genProd(await answer(await financing(), "BANK_FEE_ALREADY_IN_LOAN", "ALREADY_IN_LOAN"));
    assert.deepEqual([same.status, same.rfs.fiscalResult.charges.totalDeductible, same.rfs.fiscalResult.resultatAvantAmort], ["generated", 500, 11500]);
    const distinct: any = genProd(await answer(await financing(), "BANK_FEE_ALREADY_IN_LOAN", "DISTINCT"));
    assert.deepEqual([distinct.status, distinct.rfs.fiscalResult.charges.totalDeductible, distinct.rfs.fiscalResult.resultatAvantAmort], ["generated", 1000, 11000]);
    assert.equal(genProd(await financing()).status, "blocked");
    assert.equal(genProd(await answer(await financing(), "BANK_FEE_ALREADY_IN_LOAN", "UNKNOWN")).status, "blocked");
  });
});

describe("GATE-1.1 — F012 = SOMME de plusieurs frais F011 : jamais dédupliqué par égalité arithmétique, BLOCK sans identité métier", () => {
  // F011 : frais de dossier 500 + garantie 200 (même prêt). F012 : frais bancaires 700 = 500 + 200.
  const sumWorkspace = (fraisBancaires: number) => {
    const ws: any = exactDossier({ cash: 12000, dotation: 0, collected: { fraisBancaires } as any, bien: { financement: [pret({ pretId: "loan-1", fraisDossierDeductibles: 500, garantieDeductible: 200 })] } });
    return { ...ws, declarationDraft: { ...ws.declarationDraft, creditDeclaredNoneAt: undefined, creditConfirmedAt: "2026-01-01T00:00:00.000Z" } };
  };
  it("somme exacte (700 = 500 + 200), réponse « financement du bien » sans identité : question posée, BLOCK ; « déjà dans le prêt » → 700 une fois ; « distincts » → 1 400", async () => {
    const ws = await answer(sumWorkspace(700), "BANK_FEE_PURPOSE", "FINANCING");
    assert.equal(ofKind(ws, "BANK_FEE_ALREADY_IN_LOAN").length, 1, "la somme déclenche la question d'identité");
    assert.equal(genProd(ws).status, "blocked");
    const same: any = genProd(await answer(ws, "BANK_FEE_ALREADY_IN_LOAN", "ALREADY_IN_LOAN"));
    assert.deepEqual([same.status, same.rfs.fiscalResult.charges.totalDeductible, same.rfs.fiscalResult.resultatAvantAmort], ["generated", 700, 11300]);
    const distinct: any = genProd(await answer(ws, "BANK_FEE_ALREADY_IN_LOAN", "DISTINCT"));
    assert.deepEqual([distinct.status, distinct.rfs.fiscalResult.charges.totalDeductible], ["generated", 1400]);
  });
  it("montant qui n'est NI un frais NI une somme de frais (650) : aucune question, deux charges (aucune répartition inventée)", async () => {
    const ws = await answer(sumWorkspace(650), "BANK_FEE_PURPOSE", "FINANCING");
    assert.equal(ofKind(ws, "BANK_FEE_ALREADY_IN_LOAN").length, 0);
    const g: any = genProd(ws);
    assert.deepEqual([g.status, g.rfs.fiscalResult.charges.totalDeductible], ["generated", 1350]);
  });
  it("prédicat : égalité à un frais, somme de deux frais ou plus (plusieurs prêts), 0 et négatifs jamais ; aucune somme partielle inventée", () => {
    assert.equal(f011FeesMayExplainAmount(500, [500, 200]), true);
    assert.equal(f011FeesMayExplainAmount(700, [500, 200]), true);
    assert.equal(f011FeesMayExplainAmount(800, [500, 300, 150]), true);
    assert.equal(f011FeesMayExplainAmount(950, [500, 300, 150]), true);
    assert.equal(f011FeesMayExplainAmount(701, [500, 200]), false);
    assert.equal(f011FeesMayExplainAmount(0, [500]), false);
    assert.equal(f011FeesMayExplainAmount(-500, [500]), false);
    assert.equal(f011FeesMayExplainAmount(500, []), false);
  });
});

describe("GATE-1.1 — FIRST_REAL_YEAR + créance / avance d'ouverture non nulle : fail-closed conservateur, aucune règle inventée", () => {
  it("AVANT : générable sans blocage (constat GATE-1) ; MAINTENANT : BLOQUÉ (code dédié) pour CO ou AO > 0 ; zéro validé reste admis ; continuité native admise", () => {
    for (const c of [{ E: 13000, CO: 1000 }, { E: 11000, AO: 1000 }] as const) {
      const ws: any = caseDossier({ E: c.E, ...("CO" in c ? { CO: c.CO } : { AO: c.AO }), TF: 3000, dotation: 0 });
      // reconstitué en première année réelle déclarée (sans prédécesseur)
      const { stocksOuverture: _s, previousFiscalYearId: _p, ...fy } = ws.fiscalYear;
      void _s; void _p;
      const first = { ...ws, fiscalYear: { ...fy, priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: "t" } } };
      const sw: any = resolveExactSwitch(first);
      assert.deepEqual([sw.status, sw.reasons.includes(FIRST_YEAR_OPENING_BALANCES_UNSUPPORTED_CODE)], ["BLOCKED", true]);
      assert.equal(genProd(first).status, "blocked");
      assert.equal(genProd(ws).status, "generated", "continuité native (antériorité démontrée) : admis");
    }
    const zero: any = genProd(caseDossier({ E: 12000, TF: 3000, dotation: 0 }));
    assert.equal(zero.status, "generated");
    assert.equal(zero.rfs.fiscalResult.recettes.total, 12000, "ouverture nulle validée : jamais traitée comme inconnue");
  });
});
