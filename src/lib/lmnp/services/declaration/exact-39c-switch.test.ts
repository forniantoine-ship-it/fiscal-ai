/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * INT-5 — switch productif : F013 v2 + article 39 C EXACT + liasse cohérente.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/exact-39c-switch.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeArticle39c } from "@/runtime/capabilities/f006/article-39c-capacity";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { resolveNonProNeutralisation } from "@/runtime/capabilities/f007/nonpro-neutralisation";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import { map2031FromRfs } from "@/runtime/capabilities/rfs/projection/map-2031-from-rfs";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { exactDossier, legacyDossier, type ExactDossierSpec } from "@/lib/lmnp/services/article-39c/exact-generation-fixtures";
import { multiWorkspace, bien, collected, rentState, YEAR } from "@/lib/lmnp/services/article-39c/article-39c-test-fixtures";
import { emptyQualificationStore, recordActivityCharge } from "@/lib/lmnp/services/article-39c/qualification-store";
import { runDeclarationGenerationFromWorkspace } from "./generation-workspace";
import {
  EXACT_GATE_RED_CODE,
  applyExactContractToEngineInputs,
  reconcileExactFiscalResult,
  resolveExactSwitch,
  resolveFiscalCalculationMode,
} from "./exact-39c-switch";

type Generated = Extract<ReturnType<typeof runDeclarationGenerationFromWorkspace>, { status: "generated" }>;
const gen = (ws: PersistedWorkspace): Generated => {
  const r = runDeclarationGenerationFromWorkspace(ws, {});
  assert.equal(r.status, "generated", JSON.stringify(r.status === "blocked" ? r.anomalies : null));
  return r as Generated;
};
const val = (cases: { caseId: string; value?: unknown }[], id: string) => cases.find((c) => c.caseId === id)?.value;
/** FiscalResult COMPLET (le miroir du brouillon n'en porte qu'un résumé). */
const full = (g: Generated) => g.rfs.fiscalResult;
const b2033 = (g: Generated) => map2033BFromRfs(g.rfs);
const f2031 = (g: Generated) => map2031FromRfs(g.rfs).cases;

const CENTRAL: ExactDossierSpec = { cash: 10000, collected: { taxeFonciere: 7000, honorairesComptable: 1000 }, dotation: 2500 };

describe("INT-5 — décision explicite et fail-closed", () => {
  it("UNE décision : F013 v2 présent → EXACT_39C_V2 ; sinon LEGACY_PROXY (jamais de mélange)", () => {
    assert.equal(resolveFiscalCalculationMode(exactDossier(CENTRAL)), "EXACT_39C_V2");
    assert.equal(resolveFiscalCalculationMode(legacyDossier(CENTRAL)), "LEGACY_PROXY");
    assert.equal(gen(exactDossier(CENTRAL)).fiscalResult.article39cMode, undefined, "le miroir persisté n'est pas le FiscalResult");
  });

  it("gate rouge → BLOQUÉ, jamais de repli sur le proxy (stocks inconnus, F013 incomplet, attestation distante absente)", () => {
    const noStocks = exactDossier(CENTRAL);
    const ws = { ...noStocks, fiscalYear: { ...noStocks.fiscalYear, priorHistoryDeclaration: undefined } } as PersistedWorkspace;
    const r = runDeclarationGenerationFromWorkspace(ws, {});
    assert.equal(r.status, "blocked");
    assert.ok(r.status === "blocked" && "blockingReasons" in r && r.blockingReasons.some((b) => b.code === EXACT_GATE_RED_CODE) && r.blockingReasons.some((b) => b.code === "OPENING_STOCKS_UNKNOWN"));
    // F013 v2 non confirmé.
    const unconfirmed = exactDossier(CENTRAL);
    const d = unconfirmed.declarationDraft as unknown as { rentReconciliationV2: { confirmation?: unknown } };
    const { confirmation: _c, ...rest } = d.rentReconciliationV2;
    void _c;
    const ws2 = { ...unconfirmed, declarationDraft: { ...unconfirmed.declarationDraft, rentReconciliationV2: rest } } as unknown as PersistedWorkspace;
    const r2 = runDeclarationGenerationFromWorkspace(ws2, {});
    assert.ok(r2.status === "blocked" && "blockingReasons" in r2 && r2.blockingReasons.some((b) => b.code === "F013_V2_CONFIRMATION_MISSING"));
    // Attestation distante absente / échouée : bloqué.
    for (const remote of [{ status: "NOT_VERIFIED" as const }, { status: "FAIL" as const, reason: "x" }]) {
      const s = resolveExactSwitch(exactDossier(CENTRAL), { remoteAntiDowngrade: remote });
      assert.ok(s.mode === "EXACT_39C_V2" && s.status === "BLOCKED" && s.reasons.some((x) => x.startsWith("REMOTE_ANTI_DOWNGRADE")));
    }
    // Appel direct de l'ancien chemin pour un brouillon F013 v2 : refusé, pas de proxy.
    const direct = (await_direct(exactDossier(CENTRAL)));
    assert.equal(direct.status, "blocked");
  });
});
function await_direct(ws: PersistedWorkspace) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runDeclarationGeneration } = require("./run-declaration-generation") as typeof import("./run-declaration-generation");
  return runDeclarationGeneration(ws.declarationDraft, YEAR);
}

describe("INT-5 — oracles fiscaux productifs", () => {
  it("ORACLE A — L 10k, B 7k, ACTIVITY 1k, A 2,5k, S 0 → C 3k, D 2,5k, ND 0, H 0, ARD 0, après −500, déficit 500, imposable 0 ; liasse 314/330/7b", () => {
    const g = gen(exactDossier(CENTRAL));
    const f = full(g);
    assert.deepEqual([f.resultatAvantAmort, f.amortDeduct, f.amortNonDeduitExercice, f.amortReportesUtilises, f.stocks.amortissementsReportes, f.resultatFiscalAvantDeficits, f.deficitNouveau, f.resultatFiscal], [2000, 2500, 0, 0, 0, -500, 500, 0]);
    const form = b2033(g);
    assert.equal(form.balancing.status, "BALANCED");
    assert.equal(val(form.cases, "314"), 500);
    assert.ok([undefined, 0].includes(val(form.cases, "318") as number | undefined));
    assert.equal(val(form.cases, "330"), 500);
    assert.equal(val(form.cases, "350"), undefined);
    assert.equal(val(form.cases, "352"), 0);
    assert.equal(val(form.cases, "370"), 0);
    const c2031 = f2031(g);
    assert.equal(val(c2031, "I_7B"), 500);
    assert.equal(val(c2031, "I_7A"), undefined);
  });

  it("ORACLE B — le même dossier sous l'ANCIEN proxy donne C 2k / D 2k / ARD 500 / déficit 0 ; l'exact corrige (D 2,5k / ARD 0 / déficit 500)", () => {
    const old = full(gen(legacyDossier(CENTRAL)));
    assert.deepEqual([old.amortDeduct, old.amortNonDeduitExercice, old.stocks.amortissementsReportes, old.resultatFiscal, old.deficitNouveau], [2000, 500, 500, 0, 0]);
    const exact = full(gen(exactDossier(CENTRAL)));
    assert.deepEqual([exact.amortDeduct, exact.amortNonDeduitExercice, exact.stocks.amortissementsReportes, exact.resultatFiscal, exact.deficitNouveau], [2500, 0, 0, 0, 500]);
  });

  it("ORACLE C — ACTIVITY 1k, A 1,5k, ARD historique 1,5k → avant 2k, D 1,5k, H 1,5k, ARD 0, après −1k, déficit 1k ; 318 = 0, 330 = 1 000, 350 = 1 500 (H → 350), 7b = 1 000", () => {
    const g = gen(exactDossier({ ...CENTRAL, dotation: 1500, openingStocks: { deficits: [], amortissementsReportes: 1500 } }));
    const f = full(g);
    assert.deepEqual([f.resultatAvantAmort, f.amortDeduct, f.amortReportesUtilises, f.stocks.amortissementsReportes, f.resultatFiscalAvantDeficits, f.deficitNouveau], [2000, 1500, 1500, 0, -1000, 1000]);
    const form = b2033(g);
    assert.equal(form.balancing.status, "BALANCED");
    assert.equal(val(form.cases, "312"), 500);
    assert.deepEqual([val(form.cases, "330"), val(form.cases, "350"), val(form.cases, "352"), val(form.cases, "370")], [1000, 1500, 0, 0]);
    assert.ok([undefined, 0].includes(val(form.cases, "318") as number | undefined));
    assert.equal(val(f2031(g), "I_7B"), 1000);
  });

  it("ORACLE D — OTHER_PRODUCT n'est jamais L : L 5k, B 4k, OTHER_PRODUCT 10k, A 5k → C = 1 000 (jamais 11 000), D 1k, ARD 4k, après 10k", () => {
    const q = (id: string, cls: "L" | "B" | "OTHER_PRODUCT", amount: number) => ({ id, category: id, amount, class: cls, qualificationLevel: "DIRECT" as const, provenance: "t", reason: "t" });
    const engine = computeArticle39c({ exercice: YEAR, amounts: [q("l", "L", 5000), q("b", "B", 4000), q("op", "OTHER_PRODUCT", 10000)], currentDepreciation: 5000 });
    assert.equal(engine.status, "COMPUTED");
    const fig = engine.figures!;
    assert.deepEqual([fig.capacite, fig.amortDeduit, fig.stockArdFinal, fig.resultatApresAmortissements], [1000, 1000, 4000, 10000]);
    const result = produceFiscalResult({
      exerciceFiscal: YEAR,
      activite: { dateMiseEnService: "2020-01-01" },
      revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 15000 },
      chargesAssistant: { exerciceFiscal: YEAR, totalDeductible: 4000, totalPreExploitation: 0, parCategorie: {} },
      amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 5000, status: "validated" },
      logementAmortissement: { computedAt: "2026-01-01T00:00:00.000Z" },
      article39cExact: { capacite: fig.capacite!, resultatAvantAmort: fig.resultatAvantAmort },
    }).result!;
    assert.deepEqual([result.amortDeduct, result.amortNonDeduitExercice, result.resultatFiscalAvantDeficits], [1000, 4000, 10000]);
    // Le proxy aurait pris 11 000 comme capacité (D 5 000) : l'exact ne le reproduit jamais.
    const proxy = produceFiscalResult({ exerciceFiscal: YEAR, activite: { dateMiseEnService: "2020-01-01" }, revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 15000 }, chargesAssistant: { exerciceFiscal: YEAR, totalDeductible: 4000, totalPreExploitation: 0, parCategorie: {} }, amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 5000, status: "validated" }, logementAmortissement: { computedAt: "2026-01-01T00:00:00.000Z" } }).result!;
    assert.equal(proxy.amortDeduct, 5000);
  });

  it("ORACLE E — ACTIVITY 4k ne réduit pas C : L 10k, B 7k, ACT 4k, A 2k → C 3k, avant −1 000, D 2k, après −3 000, déficit 3 000", () => {
    const g = gen(exactDossier({ cash: 10000, collected: { taxeFonciere: 7000, honorairesComptable: 4000 }, dotation: 2000 }));
    const f = full(g);
    assert.deepEqual([f.resultatAvantAmort, f.amortDeduct, f.resultatFiscalAvantDeficits, f.deficitNouveau, f.stocks.amortissementsReportes], [-1000, 2000, -3000, 3000, 0]);
    assert.equal(val(b2033(g).cases, "330"), 3000);
  });

  it("déficit antérieur : C et D/H inchangés, imputé APRÈS ; 7a / 350 avant déficit, résultat fiscal après", () => {
    const g = gen(exactDossier({ cash: 10000, collected: { taxeFonciere: 4000 }, dotation: 1000, openingStocks: { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 0 } }));
    const f = full(g);
    assert.deepEqual([f.amortDeduct, f.resultatFiscalAvantDeficits, f.deficitsImputes, f.resultatFiscal], [1000, 5000, 800, 4200]);
    assert.deepEqual(f.stocks.deficits, []);
    const form = b2033(g);
    assert.equal(val(form.cases, "350"), 5000, "bénéfice avant déficits antérieurs (SAV-032 : jamais les déficits antérieurs)");
    assert.equal(val(form.cases, "370"), 0);
    assert.equal(val(f2031(g), "I_7A"), 5000);
  });
});

describe("INT-5 — F013 : loyers acquis dans F006 et le bilan", () => {
  it("accrual — E 10 000, CC 1 000, AC 500 → L = 10 500 reçu par F-006 (jamais 10 000)", () => {
    const g = gen(exactDossier({ cash: 10000, closingReceivables: 1000, closingAdvances: 500, collected: { taxeFonciere: 7000 }, dotation: 0 }));
    assert.equal(g.fiscalResult.totalRecettes, 10500);
    assert.equal(g.fiscalResult.resultatAvantAmort, 3500);
  });
  it("avance : encaissement de décembre pour N+1 → avance de clôture, hors loyers acquis N ; bilan 174", () => {
    const g = gen(exactDossier({ cash: 12500, closingAdvances: 500, collected: { taxeFonciere: 7000 }, dotation: 0 }));
    assert.equal(g.fiscalResult.totalRecettes, 12000);
  });
  it("impayé : loyer de décembre acquis mais payé en N+1 → produit N + créance de clôture ; bilan 068", () => {
    const g = gen(exactDossier({ cash: 11000, closingReceivables: 1000, collected: { taxeFonciere: 7000 }, dotation: 0 }));
    assert.equal(g.fiscalResult.totalRecettes, 12000);
  });
});

describe("INT-5 — bilan exact dans la génération productive (068 / 174)", () => {
  it("créance 1 000 → 068 ; avance 500 → 174 ; saisie legacy remplacée, `NUL_CONFIRME` : composant locatif seul ; legacy sans état v2 : bilan inchangé", () => {
    const base = { tresorerie: { bankMode: "DEDIE", closingCash: 3000 }, compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 }, ran: { situation: "NATIF" } };
    const legacyBilan = { ...base, tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } }, ventilationTiers: { postes: [{ id: "old", montant: 900, nature: "LOYER_DU_PAR_LOCATAIRE" }] } } as never;
    const ws = exactDossier({ cash: 10500, closingReceivables: 1000, closingAdvances: 500, collected: { taxeFonciere: 7000 }, dotation: 0 });
    const r = runDeclarationGenerationFromWorkspace(ws, { bilanInputs: legacyBilan });
    assert.equal(r.status, "generated");
    if (r.status !== "generated") return;
    const p = r.rfs.patrimoine!;
    assert.equal((p.ventilationTiers.cases.clients as { montant: number }).montant, 1000, "créance legacy 900 remplacée, jamais additionnée");
    assert.equal((p.ventilationTiers.cases.produitsConstatesAvance as { montant: number }).montant, 500);
    assert.deepEqual(p.tiers.dettes, { status: "DECLARE", montant: 500, raison: p.tiers.dettes.raison });
    assert.deepEqual(p.ventilationTiers.conflits, []);
    const leg = runDeclarationGenerationFromWorkspace(legacyDossier({ cash: 12000, dotation: 0 }), { bilanInputs: legacyBilan });
    assert.equal(leg.status, "generated");
    if (leg.status === "generated") assert.equal((leg.rfs.patrimoine!.ventilationTiers.cases.clients as { montant: number }).montant, 900, "dossier legacy : saisie historique conservée");
  });
});

describe("INT-5 — réconciliation, ONE F006, legacy figé", () => {
  it("réconciliation : la sortie F-006 concorde avec le moteur exact ; toute divergence est refusée", () => {
    const s = resolveExactSwitch(exactDossier(CENTRAL));
    assert.ok(s.mode === "EXACT_39C_V2" && s.status === "READY");
    if (!(s.mode === "EXACT_39C_V2" && s.status === "READY")) return;
    const g = gen(exactDossier(CENTRAL));
    assert.deepEqual(reconcileExactFiscalResult(full(g), s.contract), []);
    const tampered = { ...full(g), amortDeduct: full(g).amortDeduct - 1 };
    assert.equal(reconcileExactFiscalResult(tampered, s.contract).length, 1);
    // Résultat agrégé divergent : F-006 refuse (jamais corrigé).
    const inputs = applyExactContractToEngineInputs(
      { exerciceFiscal: YEAR, activite: { dateMiseEnService: "2020-01-01" }, chargesAssistant: { exerciceFiscal: YEAR, totalDeductible: 8500, totalPreExploitation: 0, parCategorie: {} }, amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 2500, status: "validated" }, logementAmortissement: { computedAt: "t" } },
      s.contract,
    );
    assert.equal(produceFiscalResult(inputs).result, undefined);
  });

  it("legacy golden : un dossier F013 v1 produit EXACTEMENT les chiffres historiques (proxy), mode non marqué", () => {
    const legacy = gen(legacyDossier({ cash: 12000, collected: { taxeFonciere: 4000 }, dotation: 1500 })).fiscalResult;
    assert.deepEqual([legacy.totalRecettes, legacy.resultatAvantAmort, legacy.amortDeduct, legacy.amortNonDeduitExercice, legacy.resultatFiscal, legacy.stocks.amortissementsReportes], [12000, 8000, 1500, 0, 6500, 0]);
    // Régénérer / réouvrir ne migre pas : toujours LEGACY_PROXY.
    assert.equal(resolveFiscalCalculationMode(legacyDossier({ cash: 12000, dotation: 1500 })), "LEGACY_PROXY");
  });

  const multiExact = (activityCharge = true): PersistedWorkspace => {
    const att = { ssi: { answer: "confirmed", at: "t", wordingVersion: "v" }, directHolding: { answer: "confirmed", at: "t", wordingVersion: "v" }, noCommonCharges: { answer: "confirmed", at: "t", wordingVersion: "2026-10-05.exact-1" } };
    const mk = (id: string, e: number, tf: number, dot: number) => {
      const b: any = bien(id, { rent: rentState(id, e), collected: collected({ taxeFonciere: tf }), logement: {}, dotation: dot });
      b.logementAmortissement = { computedAt: "t", exerciceFiscal: YEAR, prixRevient: 100000, valeurTerrain: 20000, valeurBati: 80000, baseAmortissableBati: 80000, montantMobilier: 0, dotationAnnuelle: dot, dureeMoyenneAnnees: 30, plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 } };
      b.amortissementAssistant = { exerciceFiscal: YEAR, totalDotations: dot, status: "validated" };
      return b;
    };
    const store = recordActivityCharge(emptyQualificationStore(), { charge: { sourceId: "activity-accounting_fees-2026", fiscalYear: YEAR, nature: "ACCOUNTING_FEES", amountCents: 100000, description: "Comptable", provenance: "declaration" }, answeredAt: "t" });
    const ws: any = multiWorkspace(
      { A: mk("A", 10000, 2000, 1000), B: mk("B", 8000, 1000, 1000) },
      { multiPropertyAttestations: att, siret: "12345678901234", siren: "123456789", exploitantFirstName: "M", exploitantLastName: "D", exploitantEmail: "a@b.fr", exploitantTelephone: "0601020304", personalAddress: "1 rue", personalCity: "Lyon", personalPostalCode: "69001", activityType: "LMNP", ...(activityCharge ? { article39cActivityQualifications: store } : {}) },
    );
    ws.fiscalYear = { ...ws.fiscalYear, regime: "reel", priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: "t" } };
    return ws;
  };

  it("ORACLE F (multi) — A L10k/B2k, B L8k/B1k, ACTIVITY globale 1k → L 18k, B 3k, C 15k ; ONE F006 ; ACTIVITY consommée UNE fois, non allouée", () => {
    let calls = 0;
    const r = runDeclarationGenerationFromWorkspace(multiExact(), { engine: { produceFiscalResult: (i) => { calls += 1; return produceFiscalResult(i); } } });
    assert.equal(r.status, "generated", JSON.stringify(r.status === "blocked" ? r.blockingReasons : null));
    assert.equal(calls, 1, "UN SEUL appel F-006 pour l'activité");
    if (r.status !== "generated") return;
    const f = r.rfs.fiscalResult;
    assert.deepEqual([f.recettes.total, f.resultatAvantAmort, f.amortDeduct, f.amortNonDeduitExercice], [18000, 14000, 2000, 0]);
    const s = resolveExactSwitch(multiExact());
    assert.ok(s.mode === "EXACT_39C_V2" && s.status === "READY");
    if (s.mode === "EXACT_39C_V2" && s.status === "READY") {
      const c = s.contract.gate.preSwitch.exact.consolidated;
      assert.deepEqual([c.byClassCents.L, c.byClassCents.B, c.byClassCents.ACTIVITY, s.contract.capacite], [1800000, 300000, 100000, 15000]);
      assert.deepEqual(c.architecture, { capacityScope: "ACTIVITY", engineCalls: 1 });
    }
  });

  it("multi — fail-closed : ARD générée (dotation > C) hors domaine ; attestation absente ; jamais de fallback proxy", () => {
    const ws: any = multiExact(false);
    const noAtt = { ...ws, declarationDraft: { ...ws.declarationDraft, multiPropertyAttestations: undefined } };
    const r = runDeclarationGenerationFromWorkspace(noAtt, {});
    assert.ok(r.status === "blocked" && "blockingReasons" in r && r.blockingReasons.some((b) => b.code === EXACT_GATE_RED_CODE));
    const big = { ...ws, declarationDraft: { ...ws.declarationDraft, biens: Object.fromEntries(Object.entries(ws.declarationDraft.biens).map(([id, b]: [string, any]) => [id, { ...b, amortissementAssistant: { ...b.amortissementAssistant, totalDotations: 20000 } }])) } };
    const r2 = runDeclarationGenerationFromWorkspace(big, {});
    assert.equal(r2.status, "blocked");
  });
});

describe("INT-5 — formule 330 / 350 (SAV-032 v1.1) : oracles isolés", () => {
  const n = (over: Partial<{ apres: number; h: number; nd: number; dn: number }>) => {
    const v = { apres: 0, h: 0, nd: 0, dn: 0, ...over };
    const r = resolveNonProNeutralisation({ resultatFiscalAvantDeficits: v.apres, amortReportesUtilises: v.h, deficitNouveau: v.dn, charges: { totalNonDeductible: v.nd } } as never);
    assert.equal(r.status, "AVAILABLE");
    return r.status === "AVAILABLE" ? r : (undefined as never);
  };
  it("ND seul (318) : 350 = 0 ; H seul : 350 = H ; résultat négatif : 330 ; mélange ND + négatif : 330 = −après + ND", () => {
    assert.deepEqual([n({ apres: 0 }).ligne330, n({ apres: 0 }).ligne350], [0, 0]);
    assert.deepEqual([n({ apres: 2000, h: 700 }).ligne330, n({ apres: 2000, h: 700 }).ligne350], [0, 2700]);
    assert.deepEqual([n({ apres: -500 }).ligne330, n({ apres: -500 }).ligne350], [500, 0]);
    assert.deepEqual([n({ apres: -500, nd: 99 }).ligne330, n({ apres: -500, nd: 99 }).ligne350], [599, 0]);
    // H > 0 et après < 0 (Oracle C) : 330 = 1 000, 350 = 1 500.
    assert.deepEqual([n({ apres: -1000, h: 1500 }).ligne330, n({ apres: -1000, h: 1500 }).ligne350], [1000, 1500]);
  });
  it("silent error gate — bouclage (312 − 314) + 318 + 330 − 350 = 0 sur une grille de cas", () => {
    for (const avant of [-1000, 0, 2000, 8000]) for (const dot of [0, 1500, 4000]) for (const ard of [0, 1500]) {
      const cap = Math.max(0, 3000);
      const d = Math.min(dot, cap);
      const h = Math.min(ard, cap - d);
      const apres = avant - d - h;
      const nd = dot - d;
      const r = n({ apres, h });
      const result312314 = avant - dot; // 312 − 314
      assert.equal(Math.round((result312314 + nd + r.ligne330 - r.ligne350) * 100), 0, `avant ${avant} dot ${dot} ard ${ard}`);
    }
  });
});
