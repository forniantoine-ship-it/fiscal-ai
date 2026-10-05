/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 §8/§9/§10/§15/§16/§17 — 2033-B (318/330/350 grille), 2031, 2033-A/C (immobilisations), reprise comptable, bilan.
 * Attendus : LITTÉRAUX manuels (euros) écrits avant exécution ; l'oracle indépendant est recoupé.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/silent-error-gate/forms.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { map2033AFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033a";
import { map2033CFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033c";
import { assembleLiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { resolveFinalDeclarabilityState } from "@/lib/lmnp/services/declaration/final-declarability";
import { oracle } from "./oracle";
import { checkCase, toOracleInput } from "./check";
import { caseDossier, genProd, cents, multiDossier, type Case } from "./fixtures.test";
import { TAKEOVER_ANNUITY_EUROS, stocksCandidate, takeoverDossier, takeoverOpening } from "./takeover-fixtures";

const val = (cases: { caseId: string; value?: unknown }[], id: string) => (cases.find((c) => c.caseId === id)?.value as number | undefined) ?? 0;
const deliverable = (g: any) => resolveFinalDeclarabilityState(assembleLiasseFromRfs(g.rfs));

// ---------------------------------------------------------------------------
// 2033-B : 318 / 330 / 350 — grille ND × H × déficits (SAV-032 v1.1, jamais le prompt INT-5 contradictoire)
// ---------------------------------------------------------------------------
type Lines = { l312: number; l314: number; l318: number; l330: number; l350: number; res: number; c7a: number; c7b: number };
const GRID: Array<{ id: string; label: string; c: Case; exp: Lines }> = [
  { id: "G1", label: "ND uniquement", c: { E: 12000, TF: 3000, ND: 400, dotation: 0 }, exp: { l312: 8600, l314: 0, l318: 0, l330: 400, l350: 9000, res: 9000, c7a: 9000, c7b: 0 } },
  { id: "G2", label: "H uniquement (ARD historique utilisée → 350)", c: { E: 12000, TF: 3000, dotation: 0, ardOpen: 2000 }, exp: { l312: 9000, l314: 0, l318: 0, l330: 0, l350: 9000, res: 7000, c7a: 7000, c7b: 0 } },
  { id: "G3", label: "ND + déficit antérieur (déficit jamais en 330/350/352/370)", c: { E: 12000, TF: 3000, ND: 400, dotation: 0, deficits: [{ millesime: 2025, montant: 1000 }] }, exp: { l312: 8600, l314: 0, l318: 0, l330: 400, l350: 9000, res: 8000, c7a: 9000, c7b: 0 } },
  { id: "G4", label: "H + déficit antérieur", c: { E: 12000, TF: 3000, dotation: 0, ardOpen: 2000, deficits: [{ millesime: 2025, montant: 1500 }] }, exp: { l312: 9000, l314: 0, l318: 0, l330: 0, l350: 9000, res: 5500, c7a: 7000, c7b: 0 } },
  { id: "G5", label: "ND + H + déficit antérieur", c: { E: 12000, TF: 3000, ND: 400, dotation: 0, ardOpen: 2000, deficits: [{ millesime: 2025, montant: 1500 }] }, exp: { l312: 8600, l314: 0, l318: 0, l330: 400, l350: 9000, res: 5500, c7a: 7000, c7b: 0 } },
  { id: "G6", label: "bénéfice simple", c: { E: 12000, TF: 3000, dotation: 0 }, exp: { l312: 9000, l314: 0, l318: 0, l330: 0, l350: 9000, res: 9000, c7a: 9000, c7b: 0 } },
  { id: "G7", label: "zéro exact", c: { E: 10000, TF: 7000, dotation: 3000 }, exp: { l312: 0, l314: 0, l318: 0, l330: 0, l350: 0, res: 0, c7a: 0, c7b: 0 } },
  { id: "G8", label: "H > 0 et après < 0 (oracle C : 330 = 1 000, 350 = 1 500)", c: { E: 10000, TF: 7000, COMPTA: 1000, dotation: 1500, ardOpen: 1500 }, exp: { l312: 500, l314: 0, l318: 0, l330: 1000, l350: 1500, res: 0, c7a: 0, c7b: 1000 } },
  { id: "G9", label: "ND + résultat négatif : 330 = déficit + ND", c: { E: 6000, TF: 7000, ND: 99, dotation: 0 }, exp: { l312: 0, l314: 1099, l318: 0, l330: 1099, l350: 0, res: 0, c7a: 0, c7b: 1000 } },
  { id: "G10", label: "ND + amortissement non admis (318) + 330", c: { E: 10000, TF: 7000, ND: 200, dotation: 4000 }, exp: { l312: 0, l314: 1200, l318: 1000, l330: 200, l350: 0, res: 0, c7a: 0, c7b: 0 } },
];

describe("GATE-1 — 2033-B / 2031 : grille ND × H × déficits (bouclage (312−314)+318+330−350 = 0)", () => {
  for (const { id, label, c, exp } of GRID) {
    it(`${id} — ${label}`, () => {
      const o = oracle(toOracleInput(c));
      assert.deepEqual([o.l312, o.l314, o.l318, o.l330, o.l350, o.resultat, o.c7a, o.c7b], [exp.l312, exp.l314, exp.l318, exp.l330, exp.l350, exp.res, exp.c7a, exp.c7b].map(cents), "oracle ≠ calcul manuel");
      assert.equal(exp.l312 - exp.l314 + exp.l318 + exp.l330 - exp.l350, 0, "le littéral boucle");
      const r = checkCase(c, id);
      assert.deepEqual([r.blocked, r.diffs], [undefined, []]);
      const ob = r.observed!;
      assert.deepEqual([ob.l312, ob.l314, ob.l318, ob.l330, ob.l350, ob.l352, ob.l370, ob.resultat, ob.c7a, ob.c7b].map((n) => (n as number) / 100), [exp.l312, exp.l314, exp.l318, exp.l330, exp.l350, 0, 0, exp.res, exp.c7a, exp.c7b]);
    });
  }
});

// ---------------------------------------------------------------------------
// 2033-A / 2033-C : immobilisations (immobilier seul, + mobilier, plusieurs composants, multi) et plafond 39 C
// ---------------------------------------------------------------------------
type Ligne = { id: string; label: string; montant: number; dureeAnnees: number; dotationExercice: number; amortissementsCumules: number };
function withAssets(ws: PersistedWorkspace, a: { lignes: Ligne[]; terrain: number; mobilier: number }, propertyId?: string): PersistedWorkspace {
  const dot = Math.round(a.lignes.reduce((n, l) => n + l.dotationExercice, 0) * 100) / 100;
  const patch = (d: any) => ({
    ...d,
    logementAmortissement: { ...d.logementAmortissement, valeurTerrain: a.terrain, montantMobilier: a.mobilier, dotationAnnuelle: dot, plan: { lignes: a.lignes, totalAnnuelExercice: dot, totalBrut: a.lignes.reduce((n, l) => n + l.montant, 0) } },
    amortissementAssistant: { exerciceFiscal: 2026, totalDotations: dot, status: "validated" },
  });
  const d: any = ws.declarationDraft;
  return { ...ws, declarationDraft: propertyId === undefined ? patch(d) : { ...d, biens: { ...d.biens, [propertyId]: patch(d.biens[propertyId]) } } } as PersistedWorkspace;
}
const bati = (m: number, y: number, cum?: number): Ligne => ({ id: "gros-oeuvre", label: "Bâti", montant: m, dureeAnnees: y, dotationExercice: m / y, amortissementsCumules: cum ?? m / y });
const mob = (m: number, y: number): Ligne => ({ id: "mobilier", label: "Mobilier", montant: m, dureeAnnees: y, dotationExercice: m / y, amortissementsCumules: m / y });

describe("GATE-1 — 2033-A / 2033-C : immobilisations (littéraux manuels), indépendantes du plafond 39 C", () => {
  const base: Case = { E: 20000, TF: 3000, dotation: 0 };
  const cases: Array<{ id: string; label: string; a: { lignes: Ligne[]; terrain: number; mobilier: number }; exp: { brut: number; cumul: number; dot: number; terrain: number; mobilier: number } }> = [
    { id: "I1", label: "immobilier seul : bâti 160 000 / 50 ans + terrain 40 000", a: { lignes: [bati(160000, 50)], terrain: 40000, mobilier: 0 }, exp: { brut: 200000, cumul: 3200, dot: 3200, terrain: 40000, mobilier: 0 } },
    { id: "I2", label: "immobilier + mobilier : + mobilier 8 000 / 5 ans", a: { lignes: [bati(160000, 50), mob(8000, 5)], terrain: 40000, mobilier: 8000 }, exp: { brut: 208000, cumul: 4800, dot: 4800, terrain: 40000, mobilier: 8000 } },
    { id: "I3", label: "plusieurs composants : gros œuvre 100 000 / 50 + façades 60 000 / 25 + mobilier 8 000 / 5", a: { lignes: [{ id: "gros-oeuvre", label: "Gros œuvre", montant: 100000, dureeAnnees: 50, dotationExercice: 2000, amortissementsCumules: 2000 }, { id: "facades", label: "Façades", montant: 60000, dureeAnnees: 25, dotationExercice: 2400, amortissementsCumules: 2400 }, mob(8000, 5)], terrain: 40000, mobilier: 8000 }, exp: { brut: 208000, cumul: 6000, dot: 6000, terrain: 40000, mobilier: 8000 } },
    { id: "I4", label: "terrain seul inchangé, aucun bâti amorti (dotation 0)", a: { lignes: [{ id: "gros-oeuvre", label: "Bâti", montant: 160000, dureeAnnees: 50, dotationExercice: 0, amortissementsCumules: 0 }], terrain: 40000, mobilier: 0 }, exp: { brut: 200000, cumul: 0, dot: 0, terrain: 40000, mobilier: 0 } },
  ];
  for (const { id, label, a, exp } of cases) {
    it(`${id} — ${label} ; dotation comptable intégrale en 2033-B/C même si D < dotation`, () => {
      // Revenus faibles : C = 20 000 − 3 000 = 17 000 ≥ dotation (cas libre) ; puis cas contraint C = 500 < dotation
      for (const [tf, expectedD] of [[3000, exp.dot], [19500, Math.min(exp.dot, 500)]] as const) {
        const ws = withAssets(caseDossier({ ...base, TF: tf }), a);
        const g: any = genProd(ws);
        assert.equal(g.status, "generated", JSON.stringify(g.blockingReasons ?? g.anomalies));
        const A = map2033AFromRfs(g.rfs).cases as any[];
        const C = map2033CFromRfs(g.rfs).cases as any[];
        assert.deepEqual([val(A, "028"), val(A, "030"), val(C, "426"), val(C, "476"), val(C, "496"), val(C, "572"), val(C, "576")], [exp.brut, exp.cumul, exp.terrain, exp.mobilier, exp.brut, exp.dot, exp.cumul], `tf ${tf}`);
        assert.equal(g.rfs.fiscalResult.amortDeduct, expectedD, "D = min(dotation, C) (39 C), sans effet sur 2033-A/C");
        assert.equal(deliverable(g).deliverable, true, JSON.stringify(deliverable(g).internalProjectionIssues));
      }
    });
  }
  it("multi : 2 biens (A : bâti + mobilier ; B : bâti) → 2033-A/C = somme des deux, un seul F006", () => {
    const ws = multiDossier({ biens: [{ id: "A", E: 15000, TF: 2000, dotation: 0 }, { id: "B", E: 9000, TF: 1000, dotation: 0 }] });
    const wsA = withAssets(ws, { lignes: [bati(160000, 50), mob(8000, 5)], terrain: 40000, mobilier: 8000 }, "A");
    const wsAB = withAssets(wsA, { lignes: [bati(80000, 40)], terrain: 20000, mobilier: 0 }, "B");
    const g: any = genProd(wsAB);
    assert.equal(g.status, "generated", JSON.stringify(g.blockingReasons ?? g.anomalies));
    // A : dot 4 800, cumul 4 800, brut 208 000 ; B : dot 2 000, cumul 2 000, brut 100 000 → Σ : dot 6 800, brut 308 000
    const A = map2033AFromRfs(g.rfs).cases as any[];
    const C = map2033CFromRfs(g.rfs).cases as any[];
    assert.deepEqual([val(A, "028"), val(A, "030"), val(C, "496"), val(C, "572"), val(C, "576"), val(C, "426"), val(C, "476")], [308000, 6800, 308000, 6800, 6800, 60000, 8000]);
    assert.equal(g.rfs.fiscalResult.amortDeduct, 6800);
    assert.equal(deliverable(g).deliverable, true, JSON.stringify(deliverable(g).internalProjectionIssues));
  });
  it("F014 (dotation validée) ≠ plan F-010 : jamais livrable silencieusement", () => {
    const ws: any = withAssets(caseDossier(base), { lignes: [bati(160000, 50)], terrain: 40000, mobilier: 0 });
    const diverge = { ...ws, declarationDraft: { ...ws.declarationDraft, amortissementAssistant: { exerciceFiscal: 2026, totalDotations: 3500, status: "validated" } } };
    const g: any = genProd(diverge);
    assert.ok(g.status === "blocked" || deliverable(g).deliverable === false, "divergence F010/F014 non bloquée");
  });
});

// ---------------------------------------------------------------------------
// Reprise comptable (EXTERNAL_HISTORY)
// ---------------------------------------------------------------------------
describe("GATE-1 — reprise comptable : stocks démontrés, jamais zéro implicite ; plan d'amortissement repris", () => {
  const stock = (deficits: { millesime: number; montant: number }[], ard: number) => takeoverOpening(stocksCandidate({ deficits, ard }));
  const run = (ws: PersistedWorkspace) => { const g: any = genProd(ws); assert.equal(g.status, "generated", JSON.stringify(g.blockingReasons ?? g.anomalies)); return g; };
  const C: Case = { E: 14000, TF: 3000, dotation: 0 };

  it("T1 — ARD 800 + déficit 2022 : 1 500 ; dotation reprise 4 200 ; L 14 000, C 11 000, D 4 200, H 800, après 6 000, imputé 1 500, résultat 4 500 ; 2033-A/C cumulés 39 200", () => {
    const g = run(takeoverDossier(C, stock([{ millesime: 2022, montant: 1500 }], 800)));
    const f = g.rfs.fiscalResult;
    assert.deepEqual([f.recettes.total, f.amortDeduct, f.amortReportesUtilises, f.resultatFiscalAvantDeficits, f.deficitsImputes, f.resultatFiscal], [14000, TAKEOVER_ANNUITY_EUROS, 800, 6000, 1500, 4500]);
    assert.deepEqual([f.stocks.amortissementsReportes, f.stocks.deficits], [0, []]);
    const A = map2033AFromRfs(g.rfs).cases as any[];
    const Cc = map2033CFromRfs(g.rfs).cases as any[];
    assert.deepEqual([val(A, "028"), val(A, "030"), val(Cc, "570"), val(Cc, "572"), val(Cc, "576"), val(Cc, "496")], [132000, 39200, 35000, 4200, 39200, 132000]);
    assert.equal(deliverable(g).deliverable, true);
  });
  it("T2 — ARD 9 000 > capacité résiduelle (C 11 000 − D 4 200 = 6 800) : H 6 800, stock final 2 200, après 0", () => {
    const f = run(takeoverDossier(C, stock([], 9000))).rfs.fiscalResult;
    assert.deepEqual([f.amortDeduct, f.amortReportesUtilises, f.stocks.amortissementsReportes, f.resultatFiscalAvantDeficits, f.resultatFiscal], [4200, 6800, 2200, 0, 0]);
  });
  it("T3 — déficit 2025 : 9 000 > bénéfice 6 800 : imputé 6 800, reste 2 200 (jamais dans C)", () => {
    const f = run(takeoverDossier(C, stock([{ millesime: 2025, montant: 9000 }], 0))).rfs.fiscalResult;
    assert.deepEqual([f.resultatFiscalAvantDeficits, f.deficitsImputes, f.resultatFiscal, f.stocks.deficits], [6800, 6800, 0, [{ millesime: 2025, montant: 2200 }]]);
  });
  it("T4 — stocks INCONNUS dans la reprise : aucune Opening constructible, jamais zéro (le dossier bloque)", () => {
    let built: unknown;
    try { built = takeoverOpening(stocksCandidate({ deficits: "UNKNOWN", ard: "UNKNOWN" })); } catch (e) { built = e; }
    assert.ok(built instanceof Error, "le constructeur d'Opening refuse des stocks non démontrés");
    // Sans Opening : EXTERNAL_HISTORY déclaré mais aucune preuve → génération bloquée
    const ws: any = takeoverDossier(C, stock([], 0));
    const noProof = { ...ws, fiscalYear: { ...ws.fiscalYear, externalTakeoverOpening: undefined } };
    assert.equal(genProd(noProof).status, "blocked");
  });
  it("T5 — F014 falsifiée (99 999) face au plan REPRIS (4 200) : jamais utilisée ; la réconciliation moteur exact ↔ F-006 REFUSE (fail-closed)", () => {
    const ws: any = takeoverDossier(C, stock([], 0));
    const forged = { ...ws, declarationDraft: { ...ws.declarationDraft, amortissementAssistant: { exerciceFiscal: 2026, totalDotations: 99999, status: "validated" } } };
    const g: any = genProd(forged);
    assert.equal(g.status, "blocked");
    assert.ok(g.anomalies.some((a: any) => String(a.message).includes("exact_39c_reconciliation_failed")), JSON.stringify(g.anomalies));
  });
  it("T6 — F014 non validée dans un dossier de reprise : exact BLOQUÉ (dotation INCONNUE, jamais zéro)", () => {
    const ws: any = takeoverDossier(C, stock([], 0));
    const noF014 = { ...ws, declarationDraft: { ...ws.declarationDraft, amortissementAssistant: undefined } };
    assert.equal(genProd(noF014).status, "blocked");
  });
});

// ---------------------------------------------------------------------------
// Bilan : F013 v2 ne remplace que les composants locatifs ; autres créances / dettes intactes
// ---------------------------------------------------------------------------
describe("GATE-1 — bilan : propriété F013 v2 des seuls composants locatifs (créance 1 000, avance 500, autre créance 300, autre dette 200)", () => {
  const base = { tresorerie: { bankMode: "DEDIE", closingCash: 3000 }, compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 }, ran: { situation: "NATIF" } };
  const dossier = () => caseDossier({ E: 10500, CC: 1000, AC: 500, TF: 7000, dotation: 0 });
  const bilan = (name: string, b: any) => {
    const g: any = genProd(dossier(), { bilanInputs: b });
    assert.equal(g.status, "generated", name);
    const p = g.rfs.patrimoine;
    const m = (x: any) => (x?.status === "DECLARE" ? x.montant : x?.status);
    return { c: p.ventilationTiers.cases, tiers: p.tiers, conflits: p.ventilationTiers.conflits.map((x: any) => x.code), deliverable: deliverable(g).deliverable, m };
  };
  const others = [{ id: "a", montant: 300, nature: "AUTRE_CREANCE_ACTIVITE" }, { id: "b", montant: 200, nature: "FOURNISSEUR_NON_PAYE" }];

  it("B1 — postes explicites : 068 = 1 000, 072 = 300, 166 = 200, 174 = 500 ; aucune autre dette/créance ne disparaît ; livrable", () => {
    const r = bilan("B1", { ...base, ventilationTiers: { postes: others } });
    assert.deepEqual([r.m(r.c.clients), r.m(r.c.autresCreances), r.m(r.c.fournisseurs), r.m(r.c.produitsConstatesAvance)], [1000, 300, 200, 500]);
    assert.equal(r.deliverable, true);
  });
  it("B2 — buckets déclarés cohérents (1 300 / 700 = locatif + autres) : conservés, aucun conflit, livrable", () => {
    const r = bilan("B2", { ...base, tiers: { creances: { status: "DECLARE", montant: 1300 }, dettes: { status: "DECLARE", montant: 700 } }, ventilationTiers: { postes: others } });
    assert.deepEqual([r.m(r.tiers.creances), r.m(r.tiers.dettes), r.conflits.length, r.deliverable], [1300, 700, 0, true]);
  });
  it("B3 — `NUL_CONFIRME` + autres postes : contradiction EXPLICITE (jamais résolue en silence) → non livrable", () => {
    const r = bilan("B3", { ...base, tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } }, ventilationTiers: { postes: others } });
    assert.ok(r.conflits.includes("BUCKET_TIERS_ET_VENTILATION"));
    assert.equal(r.deliverable, false);
  });
  it("B4 — bucket = AUTRES seules (300 / 200) face au locatif F013 : divergence → non livrable (l'autre dette n'est ni perdue ni écrasée en silence)", () => {
    const r = bilan("B4", { ...base, tiers: { creances: { status: "DECLARE", montant: 300 }, dettes: { status: "DECLARE", montant: 200 } } });
    assert.equal(r.deliverable, false);
    assert.deepEqual([r.m(r.tiers.creances), r.m(r.tiers.dettes)], [300, 200], "la saisie du client n'est pas modifiée");
  });
  it("B5 — saisie legacy du loyer (900) remplacée, jamais additionnée à la créance F013 (1 000)", () => {
    const r = bilan("B5", { ...base, tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } }, ventilationTiers: { postes: [{ id: "old", montant: 900, nature: "LOYER_DU_PAR_LOCATAIRE" }] } });
    assert.equal(r.m(r.c.clients), 1000);
  });
});
