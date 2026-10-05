/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 §19 — GARDES PROFONDES : chaque garde est prouvée INDÉPENDAMMENT de ses doublons (défense en profondeur). Une garde redondante dont
 * le retrait ne change aucun résultat tant que l'autre subsiste n'est pas « équivalente » : elle reçoit ici son propre test.
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/silent-error-gate/guards.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";
import { applyArticle39cSequence, computeArticle39c } from "@/runtime/capabilities/f006/article-39c-capacity";
import { reconcileRentV2 } from "@/lib/lmnp/services/f013/v2/f013-v2-engine";
import { confirmRentReconciliation, createRentReconciliationState, evaluateRentReconciliation } from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import { answerBalance, answerCollections, answerCoverage, answerExceptions } from "@/lib/lmnp/services/f013/v2/f013-v2-manual-flow";
import { resolveExactSwitch } from "@/lib/lmnp/services/declaration/exact-39c-switch";
import { adaptF012ToArticle39cContributions } from "./../from-f012";
import { caseDossier, genProd, multiDossier, rentFull } from "./fixtures.test";

const isBlocked = (ws: any) => genProd(ws).status === "blocked";
const q = (id: string, cls: string, amount: number) => ({ id, category: id, amount, class: cls, qualificationLevel: "DIRECT", provenance: "t", reason: "t" }) as any;

describe("GATE-1 — gardes d'identité F013 v2 (bien, exercice) : bloquées à chaque niveau", () => {
  it("moteur F013 : faits du bien « autre » présentés pour « prop-1 » ; exercice 2025 présenté pour 2026 → aucun montant fiscal", () => {
    const state = rentFull("prop-1", { E: 12000 });
    assert.equal(evaluateRentReconciliation(state, { propertyId: "prop-1", fiscalYear: 2026 }).result.status, "SUPPORTED");
    for (const scope of [{ propertyId: "autre", fiscalYear: 2026 }, { propertyId: "prop-1", fiscalYear: 2025 }]) {
      const r: any = reconcileRentV2(state.facts, scope);
      assert.notEqual(r.status, "SUPPORTED", JSON.stringify(scope));
      assert.equal(r.loyersAcquisCents, undefined);
    }
  });
  it("dossier mono : état F013 portant un AUTRE propertyId → BLOQUÉ (jamais lu pour le bien du dossier)", () => {
    const ws: any = caseDossier({ E: 12000, TF: 3000, dotation: 0 });
    const foreign = { ...ws, declarationDraft: { ...ws.declarationDraft, rentReconciliationV2: rentFull("prop-9", { E: 12000 }) } };
    assert.equal(resolveExactSwitch(foreign).mode, "EXACT_39C_V2");
    assert.equal(isBlocked(foreign), true);
  });
  it("dossier multi : le bien B porte l'état du bien A (même état copié) → BLOQUÉ ; le bien B porte un état de l'exercice 2025 → BLOQUÉ", () => {
    const ws: any = multiDossier({ biens: [{ id: "A", E: 10000, TF: 2000, dotation: 0 }, { id: "B", E: 8000, TF: 1000, dotation: 0 }] });
    const biens = ws.declarationDraft.biens;
    const copied = { ...ws, declarationDraft: { ...ws.declarationDraft, biens: { ...biens, B: { ...biens.B, rentReconciliationV2: biens.A.rentReconciliationV2 } } } };
    assert.equal(isBlocked(copied), true, "état de A dans B");
    const wrongYear = { ...ws, declarationDraft: { ...ws.declarationDraft, biens: { ...biens, B: { ...biens.B, rentReconciliationV2: rentFull("B", { E: 8000 }, 2025) } } } };
    assert.equal(isBlocked(wrongYear), true, "état 2025 dans un dossier 2026");
  });
});

describe("GATE-1 — capacité jamais négative : DEUX gardes, chacune prouvée seule", () => {
  it("moteur : L 6 000 < B 7 000 → capacité 0 (jamais −1 000)", () => {
    const e: any = computeArticle39c({ exercice: 2026, amounts: [q("l", "L", 6000), q("b", "B", 7000)], currentDepreciation: 2000 } as any);
    assert.equal(e.figures.capacite, 0);
    assert.deepEqual([e.figures.amortDeduit, e.figures.stockArdFinal], [0, 2000]);
  });
  it("séquence F006 : une capacité −1 000 transmise est ramenée à 0 (aucun amortissement négatif déduit)", () => {
    const f = applyArticle39cSequence({ exercice: 2026, capacite: -1000, resultatAvantAmort: -1000, currentDepreciation: 2000, historicalArdStock: 300 });
    assert.deepEqual([f.amortDeduit, f.ardConsomme, f.ardNouvelle, f.stockArdFinal], [0, 0, 2000, 2300]);
  });
});

describe("GATE-1 — gardes de classification et de réconciliation F012, prouvées seules", () => {
  const ligne = (id: string, categorie: LigneCharge["categorie"], montant: number): LigneCharge => ({ id, description: id, categorie, montant, deductibilite: "deductible", montantDeductible: montant, montantPreExploitation: 0, montantAmortissable: 0, source: "manual" }) as LigneCharge;
  it("charge de niveau ACTIVITÉ (commune) classée B → OUT_OF_DOMAIN + blocage (jamais B sans allocation par bien)", () => {
    const r = adaptF012ToArticle39cContributions({ owner: { level: "ACTIVITY" }, fiscalYear: 2026, lignes: [ligne("taxe-fonciere", "taxe_fonciere", 1000)] });
    assert.deepEqual(r.contributions.map((c) => c.class), ["OUT_OF_DOMAIN"]);
    assert.ok(r.blockers.some((b) => b.code === "COMMON_CHARGE_NOT_SUPPORTED"));
  });
  it("sortie F012 confirmée ≠ état collecté (TF 7 000 confirmée, 1 000 collectée) → BLOQUÉ, aucun B construit sur des lignes qui ne sont pas celles du résultat", () => {
    const ws: any = caseDossier({ E: 12000, TF: 7000, dotation: 0 });
    const d = ws.declarationDraft;
    const stale = { ...ws, declarationDraft: { ...d, chargesAssistantState: { ...d.chargesAssistantState, collected: { ...d.chargesAssistantState.collected, taxeFonciere: 1000 } } } };
    assert.equal(isBlocked(stale), true);
    assert.ok((resolveExactSwitch(stale) as any).reasons?.some((r: string) => /F012|DOSSIER/.test(r)), JSON.stringify((resolveExactSwitch(stale) as any).reasons));
  });
});

describe("GATE-1 — F013 v2 : faits incohérents ou incomplets ne produisent jamais un loyer (jamais UNKNOWN → 0, jamais de plancher à 0)", () => {
  const manual = (o: { E: number; CO?: number; coverage?: "all" | "not_all" }) => {
    const scope = { propertyId: "prop-1", fiscalYear: 2026 };
    const ok = (r: any) => { assert.equal(r.ok, true); return r.state; };
    let s = createRentReconciliationState(scope);
    s = ok(answerCollections(s, Math.round(o.E * 100)));
    s = answerCoverage(s, o.coverage ?? "all");
    for (const k of ["openingReceivables", "closingReceivables", "openingAdvances", "closingAdvances"] as const) {
      const a = k === "openingReceivables" ? o.CO : undefined;
      s = ok(answerBalance(s, k, a ? { answer: "some", amountCents: Math.round(a * 100) } : { answer: "none" }));
    }
    s = ok(answerExceptions(s, { answer: "none" }));
    return { state: s, confirmed: confirmRentReconciliation(s, scope, "2026-12-31T00:00:00.000Z") };
  };
  it("loyer négatif (E 500, CO 1 000 → L = −500) : jamais confirmable, jamais ramené à 0 ; dossier BLOQUÉ", () => {
    const { state, confirmed } = manual({ E: 500, CO: 1000 });
    assert.equal(confirmed.ok, false);
    const ws: any = caseDossier({ E: 12000, TF: 3000, dotation: 0 });
    assert.equal(isBlocked({ ...ws, declarationDraft: { ...ws.declarationDraft, rentReconciliationV2: state } }), true);
  });
  it("couverture des encaissements PARTIELLE (« tous les loyers ne sont pas dans les relevés ») : jamais confirmable ; dossier BLOQUÉ", () => {
    const { state, confirmed } = manual({ E: 9000, coverage: "not_all" });
    assert.equal(confirmed.ok, false);
    const ws: any = caseDossier({ E: 12000, TF: 3000, dotation: 0 });
    assert.equal(isBlocked({ ...ws, declarationDraft: { ...ws.declarationDraft, rentReconciliationV2: state } }), true);
  });
});
