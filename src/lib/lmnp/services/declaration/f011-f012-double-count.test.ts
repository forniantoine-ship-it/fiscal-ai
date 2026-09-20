/**
 * Frontière F-011 / F-012 — recouvrement de l'assurance emprunteur (décision PO) :
 * F-012 ne neutralise QUE le montant dont F-011 établit effectivement qu'il est déjà comptabilisé. Un libellé identifie
 * une correspondance potentielle ; il ne suffit jamais à supprimer économiquement une charge sans contrepartie F-011.
 *
 * Deux défauts symétriques corrigés (chronologie) :
 *  1. DOUBLE COMPTAGE — une ligne « déjà comptée » entrait dans `totalNonDeductible` : 264/310/136 comptés deux fois ;
 *  2. PERTE PAR FAUX RECOUVREMENT — la ligne était exclue sur son seul libellé, même sans assurance dans F-011
 *     (ou pour un montant supérieur) : la dépense n'entrait nulle part dans le résultat fiscal.
 *
 * Invariant vérifié partout : montant initial de la ligne = part comptée UNE fois par F-011 (recouvert) + part comptée UNE
 * fois par F-012 (reliquat) + montant explicitement exclu pour une autre raison normative (0 ici).
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/f011-f012-double-count.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeFinancementExercice } from "@/runtime/capabilities/f011/compute-financement-exercice";
import { computeChargesExercice, type ComputeChargesExerciceInput } from "@/runtime/capabilities/f012/compute-charges-exercice";
import { allocateAssuranceRecouvrement } from "@/runtime/capabilities/f012/assurance-recouvrement";
import { assuranceAnnuelleF011 } from "@/runtime/capabilities/f012/detect-financement-overlap";
import { F012ChargesAssistant } from "@/runtime/assistants/f012-charges/assistant";
import { buildFinancementCharges } from "../f011/f011-build-financement-charges";
import { buildChargesAssistantOutput } from "../f012/charges-assistant-output";
import { runDeclarationGeneration } from "./run-declaration-generation";
import { buildFiscalSummary } from "../validation-profile";
import type { ChargesExerciceResult } from "@/runtime/capabilities/f012/types";
import type { DeclarationDraft } from "../../types";
import { ALICE_YEAR, aliceDraft } from "./alice-test-draft";

const round2 = (n: number) => Math.round(n * 100) / 100;
const DESC = "Assurance emprunteur";

/** F-011 réel : un prêt dont l'assurance annuelle vaut `assurance` (0 = aucun prêt). */
function f011(assurance: number, mes: string) {
  if (assurance <= 0) return undefined;
  return computeFinancementExercice({
    exerciceFiscal: ALICE_YEAR,
    dateMiseEnService: mes,
    prets: [
      {
        pretId: "p1",
        typePret: "amortissable",
        capitalInitial: 150000,
        tauxNominal: 0.02,
        dureeMois: 240,
        datePremiereMensualite: "2024-01-01",
        assuranceAnnuelle: assurance,
        assuranceType: "externe",
      },
    ],
  } as never).charges;
}

type F011Charges = NonNullable<ReturnType<typeof f011>>;

/** Résumé F-011 tel que le panneau le transmet à l'assistant F-012. */
function summary(charges: F011Charges | undefined) {
  return charges
    ? {
        exerciceFiscal: charges.exerciceFiscal,
        totalAssurance: charges.totalAssurance,
        totalAssurancePreExploitation: charges.totalAssurancePreExploitation,
        totalCapitalRembourse: charges.totalCapitalRembourse,
      }
    : undefined;
}

/** Saisie réelle via l'assistant F-012 (une ligne « Charges diverses », ou aucune). */
async function f012Assistant(mes: string, charges: F011Charges | undefined, divers?: { description: string; montant: number }): Promise<ChargesExerciceResult> {
  const assistant = new F012ChargesAssistant(
    { dossierId: "t", fiscalYear: ALICE_YEAR, route: "/assistants/charges" },
    { dateMiseEnService: mes, financementCharges: summary(charges) } as never,
  );
  let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", copropriete: false, agence: false, travaux: false, vacance: false, comptable: false } as never);
  turn = await assistant.handle(turn.state, { type: "skip_category" });
  turn = await assistant.handle(turn.state, { type: "skip_category" });
  turn = await assistant.handle(turn.state, { type: "skip_category" });
  turn = divers ? await assistant.handle(turn.state, { type: "submit_divers", ...divers } as never) : await assistant.handle(turn.state, { type: "skip_category" });
  turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false } as never);
  turn = await assistant.handle(turn.state, { type: "confirm_all" } as never);
  assert.equal(turn.completed, true);
  return turn.state.result!.charges;
}

/** Même calcul F-012, en direct (plusieurs lignes, fonds de travaux…), avec la contrepartie F-011 réelle. */
function f012Direct(mes: string, charges: F011Charges | undefined, extra: Partial<ComputeChargesExerciceInput>): ChargesExerciceResult {
  return computeChargesExercice({
    exerciceFiscal: ALICE_YEAR,
    dateMiseEnService: mes,
    ...(charges ? { assuranceEmprunteurF011: { exerciceFiscal: charges.exerciceFiscal, montantAnnuel: assuranceAnnuelleF011(summary(charges)) } } : {}),
    ...extra,
  }).charges;
}

function draftWith(charges: ChargesExerciceResult, fin: F011Charges | undefined, mes: string): DeclarationDraft {
  return aliceDraft(
    {},
    {
      chargesAssistant: buildChargesAssistantOutput(charges, {}, "2026-03-02T10:00:00.000Z"),
      ...(fin
        ? {
            financementCharges: buildFinancementCharges(fin, {}, "2026-03-01T10:00:00.000Z"),
            creditConfirmedAt: "2026-03-01T10:00:00.000Z",
            creditFinancing: { loans: [{ id: "p1", firstPaymentDate: "2024-01-01", startDate: "2024-01-01", fees: 0 }], summary: {}, installments: [] } as never,
          }
        : { creditDeclaredNoneAt: "2026-04-01T10:00:00.000Z" }),
    },
    mes,
  );
}

/** Tout ce qu'une sortie peut porter d'un résultat : F-012, F-006, fiscal, comptable, 264, 294, 310, 2033-A 136, estimation. */
function metrics(draft: DeclarationDraft) {
  const g = runDeclarationGeneration(draft, ALICE_YEAR);
  assert.equal(g.status, "generated", g.status === "blocked" ? JSON.stringify(g.anomalies) : "");
  if (g.status !== "generated") throw new Error("unreachable");
  const fr = g.rfs.fiscalResult;
  const B = (id: string) => g.liasseRfs.form2033B.cases.find((c) => c.caseId === id)?.value as number | undefined;
  return {
    f012TotalDeductible: draft.chargesAssistant!.totalDeductible,
    f012TotalNonDeductible: draft.chargesAssistant!.totalNonDeductible,
    chargesFinancement: fr.charges.chargesFinancement,
    resultatAvantAmort: fr.resultatAvantAmort,
    resultatFiscal: fr.resultatFiscal,
    c264: B("264"),
    c294: B("294"),
    c310: B("310"),
    a136: g.liasseRfs.form2033A.cases.find((c) => c.caseId === "136")?.value as number | undefined,
    estimation: buildFiscalSummary(draft, [], ALICE_YEAR).estimatedFiscalResult,
    conservation: g.liasseRfs.form2033B.conservationDetail.status,
  };
}

const diff = (a: number | undefined, b: number | undefined) => round2((a ?? 0) - (b ?? 0));

/** Vérifie, pour une ligne Y face à F-011 = X, la contribution exacte de F-012 sur TOUTES les sorties. */
function assertScenario(label: string, X: number, Y: number, avec: ChargesExerciceResult, sans: ChargesExerciceResult, fin: F011Charges | undefined, mes: string) {
  const recouvert = round2(Math.min(X, Y));
  const reliquat = round2(Y - recouvert);
  const r = avec.recouvrementAssuranceF011!;
  assert.ok(r, `${label}: recouvrement exposé`);
  assert.equal(r.recouvert, recouvert, `${label}: montant neutralisé`);
  assert.equal(r.reliquat, reliquat, `${label}: reliquat`);
  assert.equal(round2(r.recouvert + r.reliquat), Y, `${label}: INVARIANT — recouvert + reliquat = montant initial (rien ne disparaît)`);
  assert.equal(avec.totalDejaComptabiliseF011, recouvert);
  assert.equal(avec.totalNonDeductible, sans.totalNonDeductible, `${label}: le recouvrement n'entre JAMAIS dans totalNonDeductible`);
  assert.equal(diff(avec.totalDeductible + avec.totalPreExploitation, sans.totalDeductible + sans.totalPreExploitation), reliquat, `${label}: seul le reliquat est compté par F-012`);

  const A = metrics(draftWith(avec, fin, mes));
  const W = metrics(draftWith(sans, fin, mes));
  assert.equal(A.chargesFinancement, W.chargesFinancement, `${label}: F-011 garde exactement ses montants (une seule fois)`);
  assert.equal(diff(A.resultatAvantAmort, W.resultatAvantAmort), 0 - reliquat, `${label}: F-006 résultat avant amortissement`);
  assert.equal(diff(A.resultatFiscal, W.resultatFiscal), 0 - reliquat, `${label}: résultat fiscal`);
  assert.equal(diff(A.c310, W.c310), 0 - reliquat, `${label}: résultat comptable (310)`);
  assert.equal(diff(A.a136, W.a136), 0 - reliquat, `${label}: 2033-A 136`);
  assert.equal(diff(A.c264, W.c264), reliquat, `${label}: 264`);
  assert.equal(diff(A.c294, W.c294), 0, `${label}: 294 inchangée`);
  assert.equal(diff(A.estimation, W.estimation), 0 - reliquat, `${label}: estimation`);
  assert.ok(Math.abs(A.estimation - A.resultatFiscal) < 0.005, `${label}: estimation = résultat exact`);
  assert.equal(A.conservation, "CONSERVE", label);
}

describe("recouvrement F-011 / F-012 — matrice demandée (vrai F-011, vraie saisie F-012, tout le pipeline)", () => {
  const MES = "2024-01-01"; // bien déjà en service : l'assurance de l'année est entièrement « exercice »
  const CASES: Array<[string, number, number]> = [
    ["F-011 0 € / F-012 300 € → rien n'est neutralisé, 300 € restent traités normalement", 0, 300],
    ["F-011 300 € / F-012 300 € → 300 € neutralisés, aucune contribution supplémentaire", 300, 300],
    ["F-011 300 € / F-012 450 € → 300 € neutralisés, 150 € suivent le traitement normal", 300, 450],
    ["F-011 450 € / F-012 300 € → F-012 n'ajoute rien, F-011 conserve ses 450 €", 450, 300],
  ];
  for (const [label, X, Y] of CASES) {
    it(label, async () => {
      const fin = f011(X, MES);
      if (X > 0) assert.equal(fin!.totalAssurance, X, "précondition : F-011 établit bien cette assurance");
      const avec = await f012Assistant(MES, fin, { description: DESC, montant: Y });
      const sans = await f012Assistant(MES, fin);
      assertScenario(label, X, Y, avec, sans, fin, MES);
    });
  }

  it("plusieurs lignes F-012 face à UNE charge F-011 : servies dans l'ordre de saisie jusqu'à épuisement de F-011 ; Σ recouvert ≤ F-011 et Σ (recouvert + reliquat) = Σ lignes", () => {
    const fin = f011(300, MES)!;
    const lignes = [
      { id: "d1", description: DESC, montant: 200, financementOverlap: "assurance_emprunteur" as const },
      { id: "d2", description: "Assurance de prêt immobilier", montant: 200, financementOverlap: "assurance_emprunteur" as const },
      { id: "d3", description: "Assurance crédit", montant: 100, financementOverlap: "assurance_emprunteur" as const },
    ];
    const avec = f012Direct(MES, fin, { divers: lignes });
    const sans = f012Direct(MES, fin, {});
    assert.deepEqual(
      avec.lignes.map((l) => [l.id, l.montant, l.exclusionReason ?? "normal"]),
      [["d1", 200, "f011_overlap"], ["d2", 100, "f011_overlap"], ["d2#reliquat", 100, "normal"], ["d3", 100, "normal"]],
      "traçabilité : chaque ligne F-012 reste visible, découpée en part neutralisée et reliquat",
    );
    assert.equal(avec.recouvrementAssuranceF011!.recouvert, 300, "jamais plus que F-011 n'établit");
    assert.equal(avec.recouvrementAssuranceF011!.reliquat, 200);
    assertScenario("multi-lignes", 300, 500, avec, sans, fin, MES);
  });

  it("nature différente : une ligne « Assurance habitation » n'est jamais candidate — comptée normalement, quel que soit F-011", async () => {
    const fin = f011(300, MES);
    const avec = await f012Assistant(MES, fin, { description: "Assurance habitation du bien", montant: 300 });
    const sans = await f012Assistant(MES, fin);
    assert.equal(avec.recouvrementAssuranceF011, undefined, "aucun recouvrement : pas de correspondance");
    assert.equal(avec.totalDeductible, 300);
    const A = metrics(draftWith(avec, fin, MES));
    const W = metrics(draftWith(sans, fin, MES));
    assert.equal(diff(A.resultatFiscal, W.resultatFiscal), -300, "300 € entièrement déduits en plus de F-011");
    assert.equal(diff(A.c310, W.c310), -300);
  });

  it("le fonds de travaux (dépense distincte, non déductible) n'est PAS affecté : compté une fois dans totalNonDeductible / 264 / 310, avec ou sans recouvrement", () => {
    const fin = f011(300, MES)!;
    const fonds = { coproLignes: [{ type: "fonds_travaux" as const, montant: 210.5, description: "Fonds ALUR" }] };
    const seul = f012Direct(MES, fin, fonds);
    const avecRecouvrement = f012Direct(MES, fin, { ...fonds, divers: [{ id: "d1", description: DESC, montant: 450, financementOverlap: "assurance_emprunteur" }] });
    assert.equal(seul.totalNonDeductible, 210.5);
    assert.equal(avecRecouvrement.totalNonDeductible, 210.5, "inchangé par le recouvrement");
    assert.equal(avecRecouvrement.parCategorieNonDeductible?.copropriete, 210.5);
    const A = metrics(draftWith(avecRecouvrement, fin, MES));
    const W = metrics(draftWith(seul, fin, MES));
    assert.equal(diff(A.c310, W.c310), -150, "seul le reliquat (450 − 300) bouge 310 ; le fonds de travaux reste une charge comptable unique");
    assert.equal(diff(A.c264, W.c264), 150);
  });
});

describe("recouvrement F-011 / F-012 — périodes : comparer des montants de même nature ET de même période", () => {
  it("mise en service en cours d'année : F-011 répartit l'assurance (exercice + pré-exploitation) ; la base comparable est la SOMME, pas totalAssurance seule", async () => {
    const MES = "2025-07-01";
    const fin = f011(300, MES)!;
    assert.ok(fin.totalAssurancePreExploitation > 0 && fin.totalAssurance < 300, "précondition : F-011 scinde l'année");
    assert.equal(assuranceAnnuelleF011(summary(fin)), 300);
    const avec = await f012Assistant(MES, fin, { description: DESC, montant: 300 });
    assert.equal(avec.recouvrementAssuranceF011!.reference, 300);
    assert.equal(avec.recouvrementAssuranceF011!.recouvert, 300, "avec totalAssurance seul, seuls " + fin.totalAssurance + " € auraient été neutralisés et le reste doublé");
    assert.equal(avec.recouvrementAssuranceF011!.reliquat, 0);
    assertScenario("mise en service en cours d'année", 300, 300, avec, await f012Assistant(MES, fin), fin, MES);
  });

  it("exercices INCOMPATIBLES (F-011 d'une autre année) : aucune correspondance fiable → rien n'est neutralisé, 100 % traité normalement", () => {
    const r = allocateAssuranceRecouvrement({ exerciceFiscal: 2025, lignes: [{ id: "d1", montant: 300 }], f011: { exerciceFiscal: 2024, montantAnnuel: 300 } });
    assert.equal(r.periodeCompatible, false);
    assert.equal(r.totalRecouvert, 0);
    assert.equal(r.totalReliquat, 300);
    const { charges } = computeChargesExercice({
      exerciceFiscal: 2025,
      dateMiseEnService: "2024-01-01",
      divers: [{ id: "d1", description: DESC, montant: 300, financementOverlap: "assurance_emprunteur" }],
      assuranceEmprunteurF011: { exerciceFiscal: 2024, montantAnnuel: 300 },
    });
    assert.equal(charges.totalDeductible, 300);
    assert.equal(charges.recouvrementAssuranceF011?.periodeCompatible, false);
  });

  it("sans aucune donnée F-011 : candidat identifié par le libellé mais JAMAIS neutralisé (aucune exclusion sur un mot-clé)", () => {
    const { charges } = computeChargesExercice({
      exerciceFiscal: 2025,
      dateMiseEnService: "2024-01-01",
      divers: [{ id: "d1", description: DESC, montant: 300, financementOverlap: "assurance_emprunteur" }],
    });
    assert.equal(charges.totalDeductible, 300);
    assert.equal(charges.totalDejaComptabiliseF011, 0);
    assert.equal(charges.recouvrementAssuranceF011?.reference, 0);
  });
});

describe("recouvrement F-011 / F-012 — péremption : F-011 modifié après la confirmation de F-012", () => {
  const MES = "2024-01-01";
  async function confirmed(X: number, Y: number) {
    const fin = f011(X, MES);
    const charges = await f012Assistant(MES, fin, { description: DESC, montant: Y });
    return { fin, charges };
  }
  const gen = (d: DeclarationDraft) => runDeclarationGeneration(d, ALICE_YEAR);

  it("F-011 inchangé depuis la confirmation : génération normale", async () => {
    const { fin, charges } = await confirmed(300, 450);
    assert.equal(gen(draftWith(charges, fin, MES)).status, "generated");
  });

  it("F-011 a AUGMENTÉ (300 → 450) : le reliquat déjà déduit serait compté deux fois → génération BLOQUÉE avec route de récupération, jamais silencieuse", async () => {
    const { charges } = await confirmed(300, 450);
    const g = gen(draftWith(charges, f011(450, MES), MES));
    assert.equal(g.status, "blocked");
    if (g.status === "blocked") assert.ok(g.anomalies.some((a) => a.field === "chargesAssistant.recouvrementAssuranceF011" && a.severity === "error"));
  });

  it("F-011 a DIMINUÉ ou a disparu (prêt retiré) : des montants neutralisés seraient perdus → BLOQUÉE", async () => {
    const { charges } = await confirmed(300, 300);
    assert.equal(gen(draftWith(charges, undefined, MES)).status, "blocked", "prêt retiré après confirmation de F-012");
    assert.equal(gen(draftWith(charges, f011(120, MES), MES)).status, "blocked");
  });

  it("F-011 saisi APRÈS F-012 (référence 0 → 300) : bloquée aussi — F-012 doit être reconfirmé pour neutraliser", async () => {
    const { charges } = await confirmed(0, 300);
    assert.equal(gen(draftWith(charges, undefined, MES)).status, "generated", "cohérent : aucun F-011 des deux côtés");
    assert.equal(gen(draftWith(charges, f011(300, MES), MES)).status, "blocked");
  });

  it("dossier persisté avant cette correction (aucune référence de recouvrement) : aucune garde — comportement inchangé", async () => {
    const { fin, charges } = await confirmed(300, 300);
    const persisted = draftWith(charges, fin, MES);
    const legacy = { ...persisted, chargesAssistant: { ...persisted.chargesAssistant! } } as DeclarationDraft;
    delete (legacy.chargesAssistant as unknown as Record<string, unknown>).recouvrementAssuranceF011;
    assert.equal(gen(legacy).status, "generated");
  });
});

describe("double comptage (rappel) — la part neutralisée ne modifie jamais deux fois un résultat", () => {
  it("cas réel 300 / 300 : 264, 270, 294, 310, 136, fiscal et estimation identiques au témoin sans la ligne", async () => {
    const MES = "2024-01-01";
    const fin = f011(300, MES);
    const avec = metrics(draftWith(await f012Assistant(MES, fin, { description: DESC, montant: 300 }), fin, MES));
    const sans = metrics(draftWith(await f012Assistant(MES, fin), fin, MES));
    assert.deepEqual(avec, sans);
  });

  it("ligne non candidate exclue par une autre raison normative (capital de prêt, AX-009) : reste refusée, indépendamment de F-011", async () => {
    const MES = "2024-01-01";
    const assistant = new F012ChargesAssistant({ dossierId: "t", fiscalYear: ALICE_YEAR, route: "/assistants/charges" }, { dateMiseEnService: MES } as never);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", copropriete: false, agence: false, travaux: false, vacance: false, comptable: false } as never);
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    const after = await assistant.handle(turn.state, { type: "submit_divers", description: "Remboursement du capital du prêt", montant: 1000 } as never);
    assert.equal(after.state.collected.divers.length, 0, "AX-009 : jamais une charge, sans condition — exclusion normative, pas un rapprochement");
  });
});

const FD_DESC = "Frais de dossier bancaire";

function f012FraisDossier(mes: string, fraisDossierF011: number, lignes: Array<{ id: string; montant: number }>) {
  return computeChargesExercice({
    exerciceFiscal: ALICE_YEAR,
    dateMiseEnService: mes,
    divers: lignes.map((l) => ({
      id: l.id,
      description: FD_DESC,
      montant: l.montant,
      financementOverlap: "frais_dossier" as const,
    })),
    fraisDossierF011: { exerciceFiscal: ALICE_YEAR, montantAnnuel: fraisDossierF011 },
  }).charges;
}

function draftWithFraisDossier(
  charges: ChargesExerciceResult,
  fraisDossierF011: number,
  mes: string,
): DeclarationDraft {
  // Assurance minimale (1 €) uniquement pour obtenir un prêt F-011 valide ; hors enveloppe frais de dossier.
  const fin = f011(1, mes)!;
  const prets = fin.prets.map((p, i) =>
    i === 0
      ? {
          ...p,
          fraisDossierDeductibles: fraisDossierF011,
          assuranceEmpruntExercice: 0,
          assurancePreExploitation: 0,
        }
      : p,
  );
  const totalCharges = round2(
    fin.totalInteretsEmprunt +
      prets.reduce((a, p) => a + p.fraisDossierDeductibles + p.garantieDeductible + p.iraDeductible, 0),
  );
  const financementCharges = buildFinancementCharges(
    {
      ...fin,
      totalAssurance: 0,
      totalAssurancePreExploitation: 0,
      prets,
      totalChargesFinancementExercice: totalCharges,
    },
    {},
    "2026-03-01T10:00:00.000Z",
  );
  return aliceDraft(
    {},
    {
      chargesAssistant: buildChargesAssistantOutput(charges, {}, "2026-03-02T10:00:00.000Z"),
      financementCharges,
      creditConfirmedAt: "2026-03-01T10:00:00.000Z",
      creditFinancing: {
        loans: [{ id: "p1", firstPaymentDate: "2024-01-01", startDate: "2024-01-01", fees: fraisDossierF011 }],
        summary: {},
        installments: [],
      } as never,
    },
    mes,
  );
}

describe("recouvrement F-011 / F-012 — frais de dossier (enveloppe séparée)", () => {
  const MES = "2024-01-01";
  const CASES: Array<[string, number, number]> = [
    ["FD 0/300 → rien n'est neutralisé", 0, 300],
    ["FD 300/300 → entièrement neutralisé", 300, 300],
    ["FD 300/450 → reliquat 150", 300, 450],
    ["FD 450/300 → F-012 n'ajoute rien", 450, 300],
  ];
  for (const [label, X, Y] of CASES) {
    it(label, () => {
      const avec = f012FraisDossier(MES, X, [{ id: "fd1", montant: Y }]);
      const sans = f012FraisDossier(MES, X, []);
      const recouvert = round2(Math.min(X, Y));
      const reliquat = round2(Y - recouvert);
      assert.equal(avec.recouvrementFraisDossierF011!.recouvert, recouvert, label);
      assert.equal(avec.recouvrementFraisDossierF011!.reliquat, reliquat, label);
      assert.equal(avec.totalDejaComptabiliseF011, recouvert);
      assert.equal(
        round2(avec.totalDeductible + avec.totalPreExploitation - (sans.totalDeductible + sans.totalPreExploitation)),
        reliquat,
      );
    });
  }

  it("plusieurs lignes FD face à UNE enveloppe F-011 : Σ recouvert ≤ F-011", () => {
    const avec = f012FraisDossier(MES, 300, [
      { id: "a", montant: 200 },
      { id: "b", montant: 200 },
      { id: "c", montant: 100 },
    ]);
    assert.equal(avec.recouvrementFraisDossierF011!.recouvert, 300);
    assert.equal(avec.recouvrementFraisDossierF011!.reliquat, 200);
  });

  it("enveloppe assurance F-011 NE neutralise PAS une ligne frais_dossier F-012", () => {
    const { charges } = computeChargesExercice({
      exerciceFiscal: ALICE_YEAR,
      dateMiseEnService: MES,
      divers: [{ id: "fd1", description: FD_DESC, montant: 300, financementOverlap: "frais_dossier" }],
      assuranceEmprunteurF011: { exerciceFiscal: ALICE_YEAR, montantAnnuel: 300 },
      fraisDossierF011: { exerciceFiscal: ALICE_YEAR, montantAnnuel: 0 },
    });
    assert.equal(charges.totalDeductible, 300);
    assert.equal(charges.recouvrementFraisDossierF011!.recouvert, 0);
    assert.equal(charges.recouvrementAssuranceF011, undefined);
  });

  it("libellé trompeur sans montant F-011 : dépense conservée", () => {
    const { charges } = computeChargesExercice({
      exerciceFiscal: ALICE_YEAR,
      dateMiseEnService: MES,
      divers: [{ id: "fd1", description: FD_DESC, montant: 200, financementOverlap: "frais_dossier" }],
    });
    assert.equal(charges.totalDeductible, 200);
    assert.equal(charges.recouvrementFraisDossierF011?.reference, 0);
  });

  it("péremption frais dossier : F-011 modifié après confirmation → génération bloquée", () => {
    const charges = f012FraisDossier(MES, 300, [{ id: "fd1", montant: 450 }]);
    assert.equal(charges.recouvrementFraisDossierF011!.reference, 300);
    const ok = draftWithFraisDossier(charges, 300, MES);
    assert.equal(runDeclarationGeneration(ok, ALICE_YEAR).status, "generated");
    const stale = draftWithFraisDossier(charges, 450, MES);
    const g = runDeclarationGeneration(stale, ALICE_YEAR);
    assert.equal(g.status, "blocked");
    if (g.status === "blocked") {
      assert.ok(g.anomalies.some((a) => a.field === "chargesAssistant.recouvrementFraisDossierF011"));
    }
  });
});
