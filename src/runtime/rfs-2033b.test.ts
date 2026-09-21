/**
 * Cycle 30 — mapper 2033-B (projection Cerfa depuis la RFS).
 * Run: npx tsx --test src/runtime/rfs-2033b.test.ts
 *
 * Règle absolue vérifiée par ces tests : aucune case n'est recalculée, aucune
 * case ambiguë n'est inventée pour "compléter" le formulaire.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { map2033BFromRfs } from "./capabilities/rfs/projection/map-2033b";
import type { FiscalResult } from "./capabilities/f006/types";
import { round2 } from "./capabilities/f007/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation } from "./capabilities/rfs/types";
import type { PretFinancementExercice } from "./capabilities/f011/types";
import { applyAmortissementStocks } from "./capabilities/f006/apply-amortissement-stocks";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  const merged: FiscalResult = {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: {
      totalDeductible: 2000,
      chargesExploitation: 2000,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalNonDeductible: 0,
    },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortNonDeduitExercice: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
    ...overrides,
  };
  if (overrides.amortNonDeduitExercice === undefined) {
    merged.amortNonDeduitExercice = Math.round((merged.amortCalcule - merged.amortDeduct) * 100) / 100;
  }
  return merged;
}

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Elsa Bouvard" };

function rfs(fr: FiscalResult, emprunts?: PretFinancementExercice[]): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    emprunts,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: {
        identite: "IdentiteDeclarante (ENT-013)",
        fiscalResult: "FiscalResult (F-006)",
        emprunts: emprunts ? "draft.financementCharges.prets (F-011)" : undefined,
      },
    },
  };
}

/** P1 — prêt minimal, valeurs nulles par défaut sur chaque nature de financement. */
function pret(overrides: Partial<PretFinancementExercice> = {}): PretFinancementExercice {
  return {
    pretId: "pret-1",
    typePret: "amortissable",
    interetsEmpruntExercice: 0,
    interetsPreExploitation: 0,
    assuranceEmpruntExercice: 0,
    assurancePreExploitation: 0,
    capitalRembourseExercice: 0,
    capitalRestantDu31_12: 0,
    fraisDossierDeductibles: 0,
    garantieDeductible: 0,
    iraDeductible: 0,
    ...overrides,
  };
}

function findCase(form: ReturnType<typeof map2033BFromRfs>, caseId: string) {
  return form.cases.find((c) => c.caseId === caseId);
}

function findBlocked(form: ReturnType<typeof map2033BFromRfs>, caseId: string) {
  return form.casesNonAlimentees.find((c) => c.caseId === caseId);
}

describe("Cycle 30 — TEST 1 à 4 : cases pass-through", () => {
  it("232 reprend exactement fiscalResult.recettes.total", () => {
    const fr = fiscalResult({ recettes: { total: 12345.67 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "232")?.value, 12345.67);
  });

  it("294 reprend exactement fiscalResult.charges.chargesFinancement", () => {
    const fr = fiscalResult({
      charges: { totalDeductible: 6602, chargesExploitation: 2000, chargesFinancement: 4602, chargesPreExploitation: 0 },
    });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "294")?.value, 4602);
  });

  it("318 reprend exactement fiscalResult.amortNonDeduitExercice (mouvement annuel)", () => {
    const fr = fiscalResult({ amortNonDeduitExercice: 3720, amortReporte: 9000 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "318")?.value, 3720);
    assert.notEqual(findCase(form, "318")?.value, fr.amortReporte, "318 ne doit plus lire le stock final");
  });

  it("audit fiscal ciblé (case 350) — 350 reprend exactement fiscalResult.deficitsImputes", () => {
    const fr = fiscalResult({ deficitsImputes: 1234.56 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "350")?.value, 1234.56);
  });

  it("audit fiscal ciblé (case 350) — deficitsImputes = 0 → 350 alimentée avec 0 (convention identique à 218/254), jamais absente", () => {
    const fr = fiscalResult({ deficitsImputes: 0 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "350")?.value, 0);
    assert.notEqual(findCase(form, "350"), undefined, "350 doit être présente même à 0, pas bloquée");
  });

  it("audit fiscal ciblé (case 350) — projection informative pure, sans effet sur 370/372", () => {
    const fr = fiscalResult({ deficitsImputes: 4000, resultatFiscal: 2000, deficitNouveau: 0 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "350")?.value, 4000);
    assert.equal(findCase(form, "370")?.value, 2000, "370 reste un report direct de resultatFiscal, non affecté par 350");
    assert.equal(findCase(form, "372"), undefined);
  });

  it("audit fiscal ciblé (déficits LMNP) — 360 n'est jamais alimentée, même avec deficitsImputes > 0", () => {
    const fr = fiscalResult({ deficitsImputes: 6000 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(
      findCase(form, "360"),
      undefined,
      "360 est réservée aux entreprises à l'IS (Notice 2033-NOT-SD) — jamais alimentée pour un LMNP à l'IR",
    );
    assert.equal(findBlocked(form, "360")?.categorie, "non_applicable");
  });
});

describe("Audit fiscal ciblé (case 300) — perte exceptionnelle", () => {
  it("300 reprend exactement fiscalResult.perteExceptionnelle", () => {
    const fr = fiscalResult({ perteExceptionnelle: 2500 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "300")?.value, 2500);
  });

  it("perteExceptionnelle = 0 → 300 alimentée avec 0 (convention identique à 218/254/350), jamais absente", () => {
    const fr = fiscalResult({ perteExceptionnelle: 0 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "300")?.value, 0);
    assert.notEqual(findCase(form, "300"), undefined, "300 doit être présente même à 0, pas bloquée");
  });

  it("absence de perte exceptionnelle (fixture par défaut) — comportement des autres cases inchangé", () => {
    const fr = fiscalResult();
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "300")?.value, 0);
    assert.equal(findCase(form, "264")?.value, round2(2000 + 1500 + 0), "264 non affectée par le mapping de 300");
    assert.equal(findCase(form, "294")?.value, 0, "294 non affectée par le mapping de 300");
  });

  it("300 est un pass-through pur : 264/270/294/310 restent strictement identiques avec ou sans perte exceptionnelle", () => {
    const base = {
      recettes: { total: 9000 },
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 500, chargesPreExploitation: 0, totalNonDeductible: 100 },
      resultatAvantAmort: 6900,
      amortCalcule: 1500,
    };
    const sansPerte = map2033BFromRfs(rfs(fiscalResult({ ...base, perteExceptionnelle: 0 })));
    const avecPerte = map2033BFromRfs(rfs(fiscalResult({ ...base, perteExceptionnelle: 2500 })));

    for (const caseId of ["264", "270", "294", "310"]) {
      assert.equal(
        findCase(avecPerte, caseId)?.value,
        findCase(sansPerte, caseId)?.value,
        `${caseId} ne doit pas varier selon fiscalResult.perteExceptionnelle — seule la case 300 le doit`,
      );
    }
    assert.equal(findCase(sansPerte, "300")?.value, 0);
    assert.equal(findCase(avecPerte, "300")?.value, 2500);
  });
});

/**
 * A1 — 242/244 : détail des charges d'exploitation par catégorie F-012, publié UNIQUEMENT s'il
 * explique exactement 264 − 254 (voir `detail-charges-2033b.ts`). Fixtures cohérentes par
 * construction (`chargesExploitation` = Σ détail déductible) : un détail partiel n'est jamais
 * publié. Remplace le micro-jalon 244 (simple passe-plat de la taxe foncière).
 */
function chargesA1(opts: {
  deductible?: Partial<Record<string, number>>;
  preExploitation?: Partial<Record<string, number>>;
  nonDeductible?: Partial<Record<string, number>>;
  fraisAcquisition?: number;
  chargesFinancement?: number;
}): FiscalResult["charges"] {
  const sum = (m?: Partial<Record<string, number>>) => round2(Object.values(m ?? {}).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) as number);
  const frais = opts.fraisAcquisition ?? 0;
  const ded = sum(opts.deductible);
  return {
    totalDeductible: round2(ded + (opts.chargesFinancement ?? 0)),
    chargesExploitation: round2(ded + frais),
    chargesFinancement: opts.chargesFinancement ?? 0,
    chargesPreExploitation: sum(opts.preExploitation),
    chargesExploitationPreExploitation: sum(opts.preExploitation),
    totalNonDeductible: sum(opts.nonDeductible),
    detailParCategorie: opts.deductible,
    detailPreExploitationParCategorie: opts.preExploitation,
    detailNonDeductibleParCategorie: opts.nonDeductible,
    fraisAcquisitionEnCharges: frais,
  };
}

describe("A1 — 242/244 : détail des charges d'exploitation conservé (242 + 244 + 254 = 264)", () => {
  it("R1 — taxe foncière seule (1200) → 244 = 1200, 242 absente (aucune charge externe), conservation établie", () => {
    const fr = fiscalResult({ charges: chargesA1({ deductible: { taxe_fonciere: 1200 } }), resultatFiscal: 5500 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "244")?.value, 1200);
    assert.equal(findCase(form, "242"), undefined, "aucune ligne de charge externe : 242 non alimentée, jamais un 0 inventé");
    assert.equal(form.conservationDetail.status, "CONSERVE");
    assert.equal(form.conservationDetail.ecart, 0);
    assert.equal(fr.charges.totalDeductible, 1200, "le FiscalResult source n'est jamais modifié");
    assert.equal(fr.resultatFiscal, 5500);
  });

  it("R2 — aucune ventilation disponible (detailParCategorie absent, charges d'exploitation > 0) → 242/244 NON publiées, avec raison et écart", () => {
    const form = map2033BFromRfs(rfs(fiscalResult()));
    assert.equal(findCase(form, "244"), undefined);
    assert.equal(findCase(form, "242"), undefined);
    assert.equal(form.conservationDetail.status, "ECART");
    assert.equal(form.conservationDetail.ecart, 2000, "rien n'est attribuable : tout le total 2000 reste inexpliqué");
    for (const id of ["242", "244"]) {
      const blocked = findBlocked(form, id);
      assert.ok(blocked, `${id} doit être tracée dans casesNonAlimentees`);
      assert.equal(blocked?.categorie, "incoherence_modele");
      assert.ok(blocked?.raison.includes("détail ne peut pas expliquer"));
    }
  });

  it("R2bis — catégories autres que la taxe foncière (PNO 300 + copropriété 800) → 242 = 1100, 244 absente", () => {
    const fr = fiscalResult({ charges: chargesA1({ deductible: { assurance_pno: 300, copropriete: 800 } }) });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "242")?.value, 1100);
    assert.equal(findCase(form, "244"), undefined, "l'absence de la clé taxe_fonciere laisse 244 absente");
    assert.equal(form.conservationDetail.status, "CONSERVE");
  });

  it("R3 — taxe_fonciere = 0 explicite (clé présente, aucun autre montant) → 244 = 0, distincte de l'absence de la clé", () => {
    const form = map2033BFromRfs(rfs(fiscalResult({ charges: chargesA1({ deductible: { taxe_fonciere: 0 } }) })));
    const case244 = findCase(form, "244");
    assert.notEqual(case244, undefined, "une clé PRÉSENTE à 0 produit une case réelle (=0), pas une absence");
    assert.equal(case244?.value, 0);
  });

  it("R4 — un détail PARTIEL n'est jamais publié : taxe_fonciere 1200 dans 8000 de charges → ni 244 ni 242, écart 6800", () => {
    const base = chargesA1({ deductible: { taxe_fonciere: 1200 } });
    const fr = fiscalResult({ charges: { ...base, totalDeductible: 8000, chargesExploitation: 8000 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "244"), undefined, "244 = 1200 expliquerait 15 % du total : non publiée");
    assert.equal(form.conservationDetail.status, "ECART");
    assert.equal(form.conservationDetail.ecart, 6800);
    assert.equal(findCase(form, "264")?.value, round2(8000 + fr.amortCalcule), "264 reste la formule composite habituelle");
  });

  it("R5 — non-régression : 254/264/270/294/300/310/312/314/318/330/350/370/372 identiques avec ou sans détail", () => {
    const sans = map2033BFromRfs(rfs(fiscalResult({ charges: { totalDeductible: 1700, chargesExploitation: 1200, chargesFinancement: 500, chargesPreExploitation: 0, totalNonDeductible: 0 } })));
    const avec = map2033BFromRfs(
      rfs(fiscalResult({ charges: chargesA1({ deductible: { taxe_fonciere: 1200 }, chargesFinancement: 500 }) })),
    );
    for (const caseId of ["254", "264", "270", "294", "300", "310", "312", "314", "318", "330", "350", "370", "372"]) {
      assert.equal(findCase(avec, caseId)?.value, findCase(sans, caseId)?.value, `${caseId} ne doit pas dépendre de la ventilation par catégorie`);
    }
    assert.equal(findCase(sans, "244"), undefined);
    assert.equal(findCase(avec, "244")?.value, 1200);
  });

  it("R6 — PNO + taxe foncière AVEC pré-exploitation : chaque nature reçoit sa quote-part, 242 + 244 + 254 = 264 (montants dérivés, non codés en dur)", () => {
    const deductible = { taxe_fonciere: 550, assurance_pno: 110 };
    const preExploitation = { taxe_fonciere: 50, assurance_pno: 10 };
    const fr = fiscalResult({ amortCalcule: 2979.54, charges: chargesA1({ deductible, preExploitation }) });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "244")?.value, round2(deductible.taxe_fonciere + preExploitation.taxe_fonciere));
    assert.equal(findCase(form, "242")?.value, round2(deductible.assurance_pno + preExploitation.assurance_pno));
    const somme = round2((findCase(form, "242")?.value as number) + (findCase(form, "244")?.value as number) + (findCase(form, "254")?.value as number));
    assert.equal(somme, findCase(form, "264")?.value, "242 + 244 + 254 = 264");
  });

  it("R7 — charges non déductibles externes (fonds de travaux, copropriété) → 242 ; « divers » non déductible (déjà compté par F-011, financier) → jamais attribué, conservation en écart", () => {
    const ok = map2033BFromRfs(rfs(fiscalResult({ charges: chargesA1({ deductible: { assurance_pno: 300 }, nonDeductible: { copropriete: 400 } }) })));
    assert.equal(findCase(ok, "242")?.value, 700, "300 (PNO) + 400 (fonds de travaux, comptabilisé mais non déductible)");
    assert.equal(findCase(ok, "264")?.value, round2(300 + 400 + 1500));
    const financier = map2033BFromRfs(rfs(fiscalResult({ charges: chargesA1({ deductible: { assurance_pno: 300 }, nonDeductible: { divers: 120 } }) })));
    assert.equal(financier.conservationDetail.status, "ECART");
    assert.equal(financier.conservationDetail.ecart, 120);
    assert.equal(findCase(financier, "242"), undefined, "une charge financière ne rejoint jamais une ligne d'exploitation pour faire tenir l'invariant");
    assert.ok(findBlocked(financier, "242")?.raison.includes("charge financière"));
  });

  it("R8 — frais d'acquisition déduits immédiatement : nature non ventilée (droits de mutation / honoraires) → jamais devinée, 242/244 non publiées", () => {
    const fr = fiscalResult({ charges: chargesA1({ deductible: { taxe_fonciere: 1200, assurance_pno: 200 }, fraisAcquisition: 15000 }) });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(form.conservationDetail.status, "ECART");
    assert.equal(form.conservationDetail.ecart, 15000);
    assert.equal(findCase(form, "242"), undefined);
    assert.equal(findCase(form, "244"), undefined);
    assert.ok(findBlocked(form, "244")?.raison.includes("frais d'acquisition"));
    assert.equal(findCase(form, "264")?.value, round2(1200 + 200 + 15000 + fr.amortCalcule), "264 inclut bien les frais d'acquisition");
  });

  it("R9 — dossier persisté avant A1 (pré-exploitation > 0 mais ventilation absente) → 242/244 non publiées, raison explicite (jamais reconstituées)", () => {
    const base = chargesA1({ deductible: { taxe_fonciere: 550, assurance_pno: 110 }, preExploitation: { taxe_fonciere: 50, assurance_pno: 10 } });
    const legacy = { ...base, detailPreExploitationParCategorie: undefined };
    const form = map2033BFromRfs(rfs(fiscalResult({ charges: legacy })));
    assert.equal(form.conservationDetail.status, "ECART");
    assert.equal(form.conservationDetail.ecart, 60);
    assert.ok(form.conservationDetail.raisons.some((r) => r.includes("non persistée")));
    assert.equal(findCase(form, "244"), undefined);
    assert.equal(findCase(form, "242"), undefined);
  });

  it("R10 — transport incohérent (Σ ventilation ≠ chargesExploitation) → écart détecté même sans cause identifiée", () => {
    const base = chargesA1({ deductible: { taxe_fonciere: 1200 } });
    const form = map2033BFromRfs(rfs(fiscalResult({ charges: { ...base, chargesExploitation: 1250 } })));
    assert.equal(form.conservationDetail.status, "ECART");
    assert.equal(form.conservationDetail.ecart, 50);
    assert.ok(form.conservationDetail.raisons[0].includes("incohérence de transport"));
  });

  it("R11 — invariant général sur un jeu de scénarios : quand 242/244 sont publiées, 242 + 244 + 254 = 264 exactement", () => {
    const scenarios: FiscalResult["charges"][] = [
      chargesA1({ deductible: { taxe_fonciere: 600 } }),
      chargesA1({ deductible: { assurance_pno: 120 } }),
      chargesA1({ deductible: { taxe_fonciere: 550, assurance_pno: 110 }, preExploitation: { taxe_fonciere: 50, assurance_pno: 10 } }),
      chargesA1({ deductible: { taxe_fonciere: 1200.35, copropriete: 800.12, honoraires_gestion: 300.99 }, nonDeductible: { copropriete: 210.5 } }),
      chargesA1({ deductible: {}, preExploitation: {}, nonDeductible: {} }),
    ];
    for (const charges of scenarios) {
      const form = map2033BFromRfs(rfs(fiscalResult({ amortCalcule: 1234.56, charges })));
      assert.equal(form.conservationDetail.status, "CONSERVE");
      const v = (id: string) => (findCase(form, id)?.value as number | undefined) ?? 0;
      assert.equal(round2(v("242") + v("244") + v("254")), v("264"), JSON.stringify(charges.detailParCategorie));
    }
  });
});

/**
 * P1 → A1 — ventilation du financement depuis rfs.emprunts.
 * Classification 2033-B : intérêts / IRA / assurance / garantie(PROVISOIRE) → 294 ;
 * frais de dossier → 242 ∈ 264 (notice 2033-NOT-SD) ; 310 inchangé.
 */
describe("P1/A1 — 294 = financement (hors frais dossier) ; frais dossier → 242", () => {
  it("1. intérêts seuls → 294 ; 242 non alimentée (aucun détail F-012)", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1000, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ interetsEmpruntExercice: 1000 })]));
    assert.equal(findCase(form, "294")?.value, 1000);
    assert.equal(findCase(form, "242"), undefined);
  });

  it("2. assurance d'exercice seule → 294 (charge financière), jamais 242", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 500, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ assuranceEmpruntExercice: 500 })]));
    assert.equal(findCase(form, "294")?.value, 500);
    assert.equal(findCase(form, "242"), undefined);
  });

  it("3. frais de dossier seuls → 242 ∈ 264, hors 294", () => {
    const fr = fiscalResult({
      charges: {
        totalDeductible: 2000,
        chargesExploitation: 2000,
        chargesFinancement: 300,
        chargesPreExploitation: 0,
        totalNonDeductible: 0,
      },
    });
    const form = map2033BFromRfs(rfs(fr, [pret({ fraisDossierDeductibles: 300 })]));
    assert.equal(findCase(form, "294")?.value, 0);
    assert.equal(
      findCase(form, "264")?.value,
      round2(2000 + 1500 + 300),
      "264 = exploitation + amort + frais dossier F-011",
    );
    const sansFd = map2033BFromRfs(rfs(fr, [pret({ fraisDossierDeductibles: 0 })]));
    assert.equal(
      round2((findCase(form, "264")?.value as number) - (findCase(sansFd, "264")?.value as number)),
      300,
    );
  });

  it("4. IRA seul → 294", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 400, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ iraDeductible: 400 })]));
    assert.equal(findCase(form, "294")?.value, 400);
  });

  it("5. intérêts + assurance → 294 = 1500", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1500, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ interetsEmpruntExercice: 1000, assuranceEmpruntExercice: 500 })]));
    assert.equal(findCase(form, "294")?.value, 1500);
  });

  it("6. intérêts + frais de dossier + IRA → 294 = 1400 (hors frais dossier)", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1700, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(
      rfs(fr, [pret({ interetsEmpruntExercice: 1000, fraisDossierDeductibles: 300, iraDeductible: 400 })]),
    );
    assert.equal(findCase(form, "294")?.value, 1400, "1000 (intérêts) + 400 (IRA) — frais dossier hors 294");
  });

  it("7. plusieurs prêts, natures différentes → agrégation ; frais dossier hors 294", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 2400, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(
      rfs(fr, [
        pret({ pretId: "pret-A", interetsEmpruntExercice: 1000, assuranceEmpruntExercice: 500 }),
        pret({ pretId: "pret-B", fraisDossierDeductibles: 300, iraDeductible: 400, garantieDeductible: 200 }),
      ]),
    );
    assert.equal(findCase(form, "294")?.value, 2100, "1000 + 500 (prêt A) + 400 + 200 (prêt B) — hors 300 frais dossier");
  });

  it("8. commission de caution → 294 (garantieDeductible PROVISOIRE, jamais hypothèque/IPPD)", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 250, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ garantieDeductible: 250 })]));
    assert.equal(findCase(form, "294")?.value, 250);
  });

  it("9a. zéro financement, rfs.emprunts vide ([]) — détail disponible : 294 = 0 ; 242 n'est PAS alimentée à 0 (elle dépend des charges F-012, pas des prêts)", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, []));
    assert.equal(findCase(form, "294")?.value, 0);
    assert.equal(findCase(form, "242"), undefined, "l'absence de crédit n'est plus une raison de publier 242 = 0");
  });

  it("9b. rfs.emprunts absent (undefined) — repli explicite : 294 = chargesFinancement en totalité", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 4602, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "294")?.value, 4602, "ancien comportement conservé — jamais une ventilation arbitraire faute de détail");
  });

  it("10. P0-3a.2/A1 — intérêts ET assurance pré-exploitation rejoignent 294 (financement), pas 242", () => {
    const fr = fiscalResult({
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1000, chargesPreExploitation: 500 },
    });
    const form = map2033BFromRfs(
      rfs(fr, [pret({ interetsEmpruntExercice: 1000, interetsPreExploitation: 350, assurancePreExploitation: 150 })]),
    );
    assert.equal(findCase(form, "294")?.value, 1500, "1000 (exercice) + 350 (intérêts pré-exploitation) + 150 (assurance pré-exploitation)");
    assert.equal(findCase(form, "242"), undefined);
    const sansEmprunts = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "264")?.value, findCase(sansEmprunts, "264")?.value, "264 n'est jamais alimentée par le bloc pré-exploitation financier");
    assert.equal(findCase(form, "270")?.value, findCase(sansEmprunts, "270")?.value);
    assert.equal(findCase(form, "310")?.value, findCase(sansEmprunts, "310")?.value);
  });

  it("10b. plusieurs emprunts — agrégation des composantes pré-exploitation sur 294", () => {
    const fr = fiscalResult({
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 475 },
    });
    const form = map2033BFromRfs(
      rfs(fr, [
        pret({ pretId: "pret-A", interetsPreExploitation: 100, assurancePreExploitation: 50 }),
        pret({ pretId: "pret-B", interetsPreExploitation: 250, assurancePreExploitation: 75 }),
      ]),
    );
    assert.equal(findCase(form, "294")?.value, 475, "100 + 50 + 250 + 75");
  });

  it("10c. aucun montant pré-exploitation — 294 inchangée", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1500, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ interetsEmpruntExercice: 1000, assuranceEmpruntExercice: 500 })]));
    assert.equal(findCase(form, "294")?.value, 1500);
  });

  it("11. invariant — 294 === chargesFinancement − frais dossier (sans pré-exploitation)", () => {
    const emprunts = [
      pret({ pretId: "pret-A", interetsEmpruntExercice: 1234.56, assuranceEmpruntExercice: 210.44 }),
      pret({ pretId: "pret-B", fraisDossierDeductibles: 300, iraDeductible: 175.5, garantieDeductible: 80 }),
    ];
    const chargesFinancement = round2(
      emprunts.reduce(
        (acc, p) =>
          acc + p.interetsEmpruntExercice + p.iraDeductible + p.assuranceEmpruntExercice + p.fraisDossierDeductibles + p.garantieDeductible,
        0,
      ),
    );
    const fraisDossier = round2(emprunts.reduce((acc, p) => acc + p.fraisDossierDeductibles, 0));
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, emprunts));
    assert.equal(findCase(form, "294")?.value, round2(chargesFinancement - fraisDossier));
  });

  it("11b. avec pré-exploitation financière, 294 = (chargesFinancement − frais dossier) + Σ(intérêts + assurance pré-exploitation)", () => {
    const emprunts = [
      pret({ pretId: "pret-A", interetsEmpruntExercice: 1234.56, assuranceEmpruntExercice: 210.44, interetsPreExploitation: 100, assurancePreExploitation: 40 }),
      pret({ pretId: "pret-B", fraisDossierDeductibles: 300, iraDeductible: 175.5, garantieDeductible: 80, interetsPreExploitation: 250, assurancePreExploitation: 60 }),
    ];
    const chargesFinancement = round2(
      emprunts.reduce(
        (acc, p) =>
          acc + p.interetsEmpruntExercice + p.iraDeductible + p.assuranceEmpruntExercice + p.fraisDossierDeductibles + p.garantieDeductible,
        0,
      ),
    );
    const fraisDossier = round2(emprunts.reduce((acc, p) => acc + p.fraisDossierDeductibles, 0));
    const totalPreExploitationEmprunts = round2(emprunts.reduce((acc, p) => acc + p.interetsPreExploitation + p.assurancePreExploitation, 0));
    const fr = fiscalResult({
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement, chargesPreExploitation: totalPreExploitationEmprunts },
    });
    const form = map2033BFromRfs(rfs(fr, emprunts));
    assert.equal(findCase(form, "294")?.value, round2(chargesFinancement - fraisDossier + totalPreExploitationEmprunts));
  });

  it("11c. frais dossier F-011 augmentent 242 ; intérêts/assurance/garantie restent en 294", () => {
    const charges = chargesA1({ deductible: { assurance_pno: 110 }, preExploitation: { assurance_pno: 10 }, chargesFinancement: 1470 });
    const avec = map2033BFromRfs(
      rfs(fiscalResult({ charges }), [pret({ interetsEmpruntExercice: 1000, assuranceEmpruntExercice: 200, fraisDossierDeductibles: 100, garantieDeductible: 50, interetsPreExploitation: 100, assurancePreExploitation: 20 })]),
    );
    const sans = map2033BFromRfs(rfs(fiscalResult({ charges }), []));
    assert.equal(findCase(sans, "242")?.value, 120);
    assert.equal(findCase(avec, "242")?.value, 220, "120 F-012 + 100 frais dossier F-011");
    assert.equal(findCase(avec, "294")?.value, 1370, "1470 − 100 frais dossier");
  });

  it("11d. réconciliation Cerfa avec crédit : 270 − 294 − 300 = 310 ; 242+244+254=264", () => {
    const emprunts = [pret({ interetsEmpruntExercice: 1000, interetsPreExploitation: 100, assuranceEmpruntExercice: 200, assurancePreExploitation: 20, fraisDossierDeductibles: 100, garantieDeductible: 50 })];
    const charges = chargesA1({ deductible: { taxe_fonciere: 550, assurance_pno: 110 }, preExploitation: { taxe_fonciere: 50, assurance_pno: 10 }, chargesFinancement: 1350 });
    const fr = fiscalResult({
      recettes: { total: 7150 },
      amortCalcule: 2979.54,
      charges: { ...charges, chargesPreExploitation: 60 + 120 },
      resultatAvantAmort: round2(7150 - (660 + 1350) - 180),
    });
    const form = map2033BFromRfs(rfs(fr, emprunts));
    const v = (id: string) => (findCase(form, id)?.value as number | undefined) ?? 0;
    assert.equal(round2(v("270") - v("294") - v("300")), v("310"));
    assert.equal(round2(v("242") + v("244") + v("254")), v("264"));
  });

  it("294 est tracée source=Emprunts (détail disponible) ; 242 est tracée source=FiscalResult (ventilation F-012)", () => {
    const charges = chargesA1({ deductible: { assurance_pno: 500 }, chargesFinancement: 1000 });
    const form = map2033BFromRfs(rfs(fiscalResult({ charges }), [pret({ interetsEmpruntExercice: 1000 })]));
    assert.equal(findCase(form, "294")?.trace.source, "Emprunts");
    assert.ok(findCase(form, "294")?.trace.path.includes("rfs.emprunts") || findCase(form, "294")?.trace.path.includes("intérêts"));
    assert.equal(findCase(form, "242")?.trace.source, "FiscalResult");
    assert.ok(findCase(form, "242")?.trace.path.includes("detailParCategorie"));
  });

  it("294 reste tracée source=FiscalResult en repli (rfs.emprunts absent), comme avant P1", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 4602, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "294")?.trace.source, "FiscalResult");
    assert.ok(String(findCase(form, "294")?.trace.path).includes("chargesFinancement"));
  });
});

/**
 * P0-3a.4 — la composante A (`fiscalResult.charges.chargesExploitationPreExploitation`,
 * P0-3a.3) rejoint la case 264 (charges d'exploitation), jamais 242/294 (déjà
 * la destination de B/C depuis P0-3a.2). `chargesPreExploitation` (=A+B+C,
 * TRF-0030) n'est JAMAIS lue par ce mapper — seule A l'est, explicitement.
 */
describe("P0-3a.4 — composante A (F-012) projetée en case 264, jamais mélangée à B/C", () => {
  it("1. A seule (500) : 264 augmente de 500, 270 diminue de 500 — B/C absents, 242/294 inchangées", () => {
    const base = { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 };
    const sansA = fiscalResult({ charges: base });
    const avecA = fiscalResult({ charges: { ...base, chargesExploitationPreExploitation: 500 } });

    const formSansA = map2033BFromRfs(rfs(sansA));
    const formAvecA = map2033BFromRfs(rfs(avecA));

    assert.equal(
      (findCase(formAvecA, "264")?.value as number) - (findCase(formSansA, "264")?.value as number),
      500,
      "264 augmente exactement de A",
    );
    assert.equal(
      (findCase(formAvecA, "270")?.value as number) - (findCase(formSansA, "270")?.value as number),
      -500,
      "270 (232 − 264) diminue exactement de A",
    );
    assert.equal(findCase(formAvecA, "242")?.value, undefined, "242 : rfs.emprunts absent, aucune projection inventée");
    assert.equal(findCase(formAvecA, "294")?.value, 0, "294 : aucune contribution de A, chargesFinancement=0");
  });

  it("2. A+B+C (500/350/150) : chacun compté une seule fois, sur sa propre case — A en 264, B en 294, C en 242", () => {
    const fr = fiscalResult({
      charges: {
        totalDeductible: 2000,
        chargesExploitation: 2000,
        chargesFinancement: 0,
        chargesPreExploitation: 1000, // A+B+C — jamais lu par ce mapper, présent pour un fixture réaliste
        chargesExploitationPreExploitation: 500, // A
        totalNonDeductible: 0,
      },
    });
    const chargesSansPreExploitation = { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 };
    // `[]` — détail par prêt disponible (242 alimentée à 0, jamais absente),
    // pour comparer des cases réellement homogènes avec `form` ci-dessous.
    const sansPreExploitation = map2033BFromRfs(rfs(fiscalResult({ charges: chargesSansPreExploitation }), []));
    const form = map2033BFromRfs(rfs(fr, [pret({ interetsPreExploitation: 350, assurancePreExploitation: 150 })]));

    assert.equal(
      (findCase(form, "264")?.value as number) - (findCase(sansPreExploitation, "264")?.value as number),
      500,
      "264 ne reçoit que A (500), jamais B ni C",
    );
    assert.equal(findCase(form, "294")?.value, 500, "294 ne reçoit que B (350) et C (150), les deux financiers (A1)");
    assert.equal(findCase(form, "242"), undefined, "242 ne reçoit jamais de financement (A1)");

    // Aucun des trois n'est compté deux fois : la somme des deltas sur 264 et 294 (vs un dossier
    // sans aucun montant pré-exploitation) vaut exactement A+B+C, ni plus ni moins.
    const sansRien = sansPreExploitation;
    const delta264 = (findCase(form, "264")?.value as number) - (findCase(sansRien, "264")?.value as number);
    const delta294 = (findCase(form, "294")?.value as number) - (findCase(sansRien, "294")?.value as number);
    assert.equal(round2(delta264 + delta294), 1000, "500 (A, 264) + 500 (B+C, 294) = 1000, jamais plus");
  });

  it("3. réconciliation : 270 − 294 − 300 === résultat comptable (310/312/314) — aucun double comptage architectural", () => {
    const fr = fiscalResult({
      exercice: 2025,
      recettes: { total: 9000 },
      charges: {
        totalDeductible: 2000,
        chargesExploitation: 2000,
        chargesFinancement: 1000,
        chargesPreExploitation: 1000,
        chargesExploitationPreExploitation: 500,
        totalNonDeductible: 0,
      },
      resultatAvantAmort: round2(9000 - (2000 + 1000) - 1000 - 0),
      amortCalcule: 1500,
    });
    const form = map2033BFromRfs(
      rfs(fr, [pret({ interetsEmpruntExercice: 1000, interetsPreExploitation: 350, assurancePreExploitation: 150 })]),
    );

    const case270 = findCase(form, "270")?.value as number;
    const case294 = findCase(form, "294")?.value as number;
    const case300 = (findCase(form, "300")?.value as number) ?? 0;
    const resultatFinal = fr.resultatAvantAmort - fr.amortCalcule - fr.charges.totalNonDeductible;

    assert.equal(
      round2(case270 - case294 - case300),
      round2(resultatFinal),
      "résultat d'exploitation (270) moins les charges financières (294, B/C inclus) et exceptionnelles (300) reconstitue exactement le résultat final (310/312/314) — preuve qu'aucun euro n'est compté deux fois entre les deux sections",
    );
  });

  it("4. zéro/absence : chargesExploitationPreExploitation à 0 ou absent → comportement strictement identique à l'ancien", () => {
    const base = { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 500, chargesPreExploitation: 0, totalNonDeductible: 0 };
    const absent = map2033BFromRfs(rfs(fiscalResult({ charges: base })));
    const explicitementZero = map2033BFromRfs(rfs(fiscalResult({ charges: { ...base, chargesExploitationPreExploitation: 0 } })));

    assert.equal(findCase(absent, "264")?.value, findCase(explicitementZero, "264")?.value);
    assert.equal(findCase(absent, "270")?.value, findCase(explicitementZero, "270")?.value);
    assert.ok(!Number.isNaN(findCase(absent, "264")?.value), "champ absent → jamais NaN (repli ?? 0)");
  });

  it("5. non-régression multi-emprunts (P0-3a.2) : A (264) et plusieurs prêts B/C (294/242) coexistent sans interférence", () => {
    const fr = fiscalResult({
      charges: {
        totalDeductible: 2000,
        chargesExploitation: 2000,
        chargesFinancement: 0,
        chargesPreExploitation: 0,
        chargesExploitationPreExploitation: 500,
        totalNonDeductible: 0,
      },
    });
    const form = map2033BFromRfs(
      rfs(fr, [
        pret({ pretId: "pret-A", interetsPreExploitation: 100, assurancePreExploitation: 50 }),
        pret({ pretId: "pret-B", interetsPreExploitation: 250, assurancePreExploitation: 75 }),
      ]),
    );
    assert.equal(findCase(form, "294")?.value, 475, "294 : multi-emprunts, intérêts + assurance pré-exploitation (100+250+50+75)");
    assert.equal(findCase(form, "242"), undefined, "242 : jamais de financement (A1)");

    const sansA = map2033BFromRfs(
      rfs(
        fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 } }),
        [
          pret({ pretId: "pret-A", interetsPreExploitation: 100, assurancePreExploitation: 50 }),
          pret({ pretId: "pret-B", interetsPreExploitation: 250, assurancePreExploitation: 75 }),
        ],
      ),
    );
    assert.equal(
      (findCase(form, "264")?.value as number) - (findCase(sansA, "264")?.value as number),
      500,
      "264 reçoit A indépendamment du nombre d'emprunts — jamais affectée par B/C",
    );
  });
});

/**
 * Cycle 32 — audit de conformité (notice 2033-NOT-SD + FEC réel) : 264/270/
 * 310/312/314 sont désormais alimentées grâce à l'exposition de
 * charges.totalNonDeductible. Formules vérifiées ci-dessous avec des chiffres
 * simples, puis avec les chiffres réels du dossier de référence (Elsa
 * Bouvard) pour prouver la fidélité à l'audit.
 */
describe("Cycle 32 — 264/270/310/312/314 : projection depuis charges.totalNonDeductible", () => {
  it("264 = chargesExploitation + amortCalcule + totalNonDeductible (chiffres simples)", () => {
    const fr = fiscalResult({
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
      amortCalcule: 1500,
    });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "264")?.value, 3600, "2000 + 1500 + 100");
  });

  it("270 = case 232 − case 264 (présentation, pas un nouveau calcul fiscal)", () => {
    const fr = fiscalResult({
      recettes: { total: 9000 },
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
      amortCalcule: 1500,
    });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "270")?.value, 5400, "9000 - 3600");
  });

  it("cas bénéficiaire : 310 et 312 portent le résultat comptable, jamais 314", () => {
    const fr = fiscalResult({
      resultatAvantAmort: 7000,
      amortCalcule: 1500,
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
    });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "310")?.value, 5400, "7000 - 1500 - 100");
    assert.equal(findCase(form, "312")?.value, 5400);
    assert.equal(findCase(form, "314"), undefined, "pas de case 314 en résultat comptable positif");
  });

  it("cas déficitaire comptable : 310 et 314 portent le résultat, jamais 312 — valeur toujours positive en 314", () => {
    const fr = fiscalResult({
      resultatAvantAmort: -9861.76,
      amortCalcule: 3720.19,
      charges: { totalDeductible: 14961.76, chargesExploitation: 10360.15, chargesFinancement: 4601.61, chargesPreExploitation: 0, totalNonDeductible: 99.4 },
    });
    const form = map2033BFromRfs(rfs(fr));
    const resultatAttendu = round2(-9861.76 - 3720.19 - 99.4);
    assert.equal(findCase(form, "310")?.value, resultatAttendu);
    assert.equal(findCase(form, "312"), undefined, "pas de case 312 en résultat comptable négatif");
    assert.equal(findCase(form, "314")?.value, round2(Math.abs(resultatAttendu)), "314 est toujours une valeur positive (montant du déficit)");
  });

  it("cas de référence réel (dossier Elsa Bouvard, FEC audité) : 264/310 retombent sur les valeurs publiées, aux arrondis près", () => {
    const fr = fiscalResult({
      recettes: { total: 5100 },
      resultatAvantAmort: -9861.76,
      amortCalcule: 3720.19,
      charges: {
        totalDeductible: 14961.76,
        chargesExploitation: 10360.15,
        chargesFinancement: 4601.61,
        chargesPreExploitation: 0,
        totalNonDeductible: 99.4,
      },
    });
    const form = map2033BFromRfs(rfs(fr));
    const case264 = findCase(form, "264")?.value as number;
    const case310 = findCase(form, "310")?.value as number;
    // Valeurs publiées sur le spécimen officiel : 264 = 14 180 €, 310 = (13 681) €.
    assert.ok(Math.abs(case264 - 14180) < 1, `264 attendu ≈ 14180, obtenu ${case264}`);
    assert.ok(Math.abs(case310 - -13681) < 1, `310 attendu ≈ -13681, obtenu ${case310}`);
  });

  it("264/270/310/312/314 n'apparaissent jamais dans casesNonAlimentees désormais", () => {
    const form = map2033BFromRfs(rfs(fiscalResult()));
    for (const id of ["264", "270", "310", "312"]) {
      assert.equal(findBlocked(form, id), undefined, `${id} doit désormais être alimentée`);
    }
  });
});

describe("Cycle 30 — TEST 5 : 370/372, bénéfice et déficit jamais mélangés", () => {
  it("bénéfice → 370 alimentée, 372 absente du formulaire", () => {
    const fr = fiscalResult({ resultatFiscal: 5500, deficitNouveau: 0 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "370")?.value, 5500);
    assert.equal(findCase(form, "372"), undefined, "372 ne doit pas apparaître dans les cases en cas de bénéfice");
  });

  it("CORRIGÉ (audit fiscal P0, Cursor/Grok) — déficit LMNP → 330 alimentée, 370 ET 372 absentes du formulaire", () => {
    // AVANT correction, ce test attendait 372=9862. Un déficit LMNP non
    // professionnel (CGI art. 156-I-1° bis, AX-016) ne s'impute/reporte
    // jamais via le circuit générique 370/372 — il est réintégré en case 330
    // (voir map-2033b.ts pour le raisonnement complet). F-006 (inchangé)
    // garantit resultatFiscal=0 (jamais négatif) dans ce cas : 372 exige
    // désormais resultatFiscal<0, jamais vrai ici.
    const fr = fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "330")?.value, 9862, "330 réintègre le déficit LMNP");
    assert.equal(findCase(form, "372"), undefined, "372 ne doit plus jamais recevoir deficitNouveau");
    assert.equal(findCase(form, "370"), undefined, "370 ne doit pas apparaître dans les cases en cas de déficit");
  });
});

describe("Cycle 30 — TEST 6 : aucun moteur fiscal importé (garde d'architecture)", () => {
  it("map-2033b.ts n'importe, en valeur, aucun moteur de calcul ni assistant — seulement des import type", () => {
    const source = readFileSync(
      path.join(__dirname, "capabilities/rfs/projection/map-2033b.ts"),
      "utf-8",
    );
    // On n'inspecte QUE les lignes d'import réelles — pas les commentaires
    // (qui citent volontairement ces noms pour documenter ce qui est interdit).
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");

    const forbidden = [
      "produceFiscalResult",
      "applyAmortissementStocks",
      "fiscalResultFromDraft",
      "f010-logement",
      "f011-financement",
      "f012-charges",
      "f013-revenus",
      "f014-amortissements",
      "capabilities/f010",
      "capabilities/f011",
      "capabilities/f012",
      "capabilities/f013",
      "capabilities/f014",
    ];
    for (const token of forbidden) {
      assert.equal(
        importLines.includes(token),
        false,
        `map-2033b.ts ne doit importer ni valeur ni type référençant ${token} — projection pure depuis la RFS uniquement`,
      );
    }
    // Tous les imports depuis f006 doivent être des `import type`, jamais des imports de valeur.
    const valueImportOfEngine = /^import\s+(?!type)\{[^}]*\}\s+from\s+["'].*\/f006\//m;
    assert.equal(valueImportOfEngine.test(importLines), false, "aucun import de valeur depuis f006 — import type uniquement");
  });
});

describe("Cycle 30 — TEST 7 : le FiscalResult source n'est jamais reconstruit", () => {
  it("form assemblé à partir d'un FiscalResult donné en référence : les valeurs des cases proviennent de CE MÊME objet, pas d'une copie", () => {
    const fr = fiscalResult({ recettes: { total: 9000 } });
    const representation = rfs(fr);
    const form = map2033BFromRfs(representation);
    // La RFS elle-même référence le même FiscalResult (déjà garanti par rfs.test.ts) —
    // ici on vérifie que le mapper ne fait que lire representation.fiscalResult, pas un autre objet.
    assert.equal(representation.fiscalResult, fr);
    assert.equal(findCase(form, "232")?.value, fr.recettes.total);
  });
});

describe("Cycle 30/32 — TEST 8 : cases bloquées — jamais une valeur inventée", () => {
  const form = map2033BFromRfs(rfs(fiscalResult()));

  it("352, 354, 356, 360 restent dans casesNonAlimentees, pas dans cases — après le déblocage 264/270/310/312/314", () => {
    const blockedIds = ["352", "354", "356", "360"];
    for (const id of blockedIds) {
      assert.equal(findCase(form, id), undefined, `${id} ne doit jamais recevoir de valeur`);
      assert.ok(findBlocked(form, id), `${id} doit être tracé dans casesNonAlimentees`);
    }
    // A1 : 242/244 peuvent s'ajouter (conservation non établie, avec raison) — la fixture par défaut n'a
    // aucune ventilation par catégorie. Les quatre cases structurelles restent exactement 352/354/356/360.
    assert.equal(form.casesNonAlimentees.filter((c) => !["242", "244"].includes(c.caseId)).length, 4, "352/354/356/360 restent bloquées (audit fiscal ciblé : 360 rejoint 356, IS uniquement)");
  });

  it("chaque case bloquée porte une raison non vide et une catégorie explicite, y compris la nouvelle catégorie non_applicable", () => {
    for (const c of form.casesNonAlimentees) {
      assert.ok(c.raison.length > 0, `${c.caseId} doit avoir une raison`);
      assert.ok(["donnee_absente", "incoherence_modele", "hors_perimetre", "non_applicable"].includes(c.categorie));
    }
  });

  it("356 est catégorisée non_applicable (pas hors_perimetre) — mécanisme IS, non applicable au LMNP/IR", () => {
    const case356 = findBlocked(form, "356");
    assert.equal(case356?.categorie, "non_applicable");
  });

  it("le total cases + casesNonAlimentees ne double-compte aucun caseId", () => {
    const alimentees = new Set(form.cases.map((c) => c.caseId));
    const bloquees = new Set(form.casesNonAlimentees.map((c) => c.caseId));
    for (const id of alimentees) {
      assert.equal(bloquees.has(id), false, `${id} ne peut pas être à la fois alimentée et bloquée`);
    }
  });
});

describe("Cycle 30/32 — TEST 9 : traçabilité de chaque case alimentée", () => {
  it("chaque case du formulaire porte une trace source=FiscalResult avec un path exploitable", () => {
    const form = map2033BFromRfs(rfs(fiscalResult({ resultatFiscal: 5500 })));
    for (const c of form.cases) {
      assert.equal(c.trace.source, "FiscalResult");
      // Soit un chemin direct dans FiscalResult, soit une projection de
      // présentation explicitement documentée comme telle (ex. case 270 =
      // différence entre deux cases déjà projetées) — jamais un path vide
      // ou une source cachée.
      const isDirectPath = c.trace.path.startsWith("fiscalResult.");
      const isPresentationProjection = c.trace.path.includes("case ") || c.trace.path.includes("fiscalResult.");
      assert.ok(isDirectPath || isPresentationProjection, `path suspect pour ${c.caseId}: ${c.trace.path}`);
      assert.ok(c.trace.path.length > 0, `path vide pour ${c.caseId}`);
      assert.ok(c.trace.ksArtifacts.length > 0);
    }
  });
});

describe("Cycle 30 — non-divergence avec le document client", () => {
  it("232 (2033-B) et recettes du document client proviennent de la même valeur rfs.fiscalResult.recettes.total", async () => {
    const { buildClientSummaryDocument } = await import(
      "@/lib/lmnp/services/declaration/build-client-summary-document"
    );
    const representation = rfs(fiscalResult({ recettes: { total: 7777 } }));
    const clientDoc = buildClientSummaryDocument(representation);
    const form = map2033BFromRfs(representation);
    assert.equal(findCase(form, "232")?.value, clientDoc.syntheseFiscale.recettes);
  });

  it("330 (2033-B) et le résultat principal du document client proviennent de la même valeur, cas déficitaire — CORRIGÉ (audit fiscal P0)", async () => {
    // AVANT correction, ce test comparait clientDoc.syntheseFiscale.deficitFiscal
    // à la case 372 (alors alimentée à tort par deficitNouveau). Le déficit
    // LMNP non professionnel n'apparaît plus sur 372 (voir map-2033b.ts) :
    // c'est désormais la case 330 qui porte la même valeur que le document
    // client — la non-divergence document-client / Cerfa reste garantie,
    // simplement vers la case fiscalement correcte.
    const { buildClientSummaryDocument } = await import(
      "@/lib/lmnp/services/declaration/build-client-summary-document"
    );
    const representation = rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862 }));
    const clientDoc = buildClientSummaryDocument(representation);
    const form = map2033BFromRfs(representation);
    assert.equal(findCase(form, "372"), undefined, "372 ne doit plus jamais être alimentée pour un déficit LMNP");
    assert.equal(findCase(form, "330")?.value, clientDoc.syntheseFiscale.deficitFiscal);
  });
});

// =====================================================================
// Cycle 47 — cases 218 (Services) et 254 (Dotations aux amortissements)
// =====================================================================
describe("Cycle 47 — case 218 : Production vendue — Services", () => {
  it("218 === recettes.total, sur un cas bénéficiaire", () => {
    const fr = fiscalResult({ recettes: { total: 12345.67 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "218")?.value, 12345.67);
  });

  it("218 === 232, toujours la même valeur (pass-through identique, pas une seconde formule)", () => {
    const fr = fiscalResult({ recettes: { total: 5100 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "218")?.value, findCase(form, "232")?.value);
  });

  it("recettes.total = 0 → 218 alimentée avec 0 (convention identique à 232, jamais bloquée)", () => {
    const fr = fiscalResult({ recettes: { total: 0 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "218")?.value, 0);
    assert.equal(findBlocked(form, "218"), undefined);
  });

  it("218 n'est jamais ventilée à partir de loyersEncaisses/recettesPlateforme/indemnitesAssurance/ajustementsJanDec", () => {
    const fr = fiscalResult({
      recettes: {
        total: 9000,
        loyersEncaisses: 1,
        recettesPlateforme: 2,
        indemnitesAssurance: 3,
        ajustementsJanDec: 4,
      },
    });
    const form = map2033BFromRfs(rfs(fr));
    // Si une ventilation arbitraire avait été introduite, la valeur ne
    // vaudrait plus exactement recettes.total (9000) — elle le reste malgré
    // la présence des sous-champs détaillés.
    assert.equal(findCase(form, "218")?.value, 9000);
    assert.doesNotMatch(findCase(form, "218")!.trace.path, /loyersEncaisses|recettesPlateforme|indemnitesAssurance|ajustementsJanDec/);
  });
});

describe("Cycle 47 — case 254 : Dotations aux amortissements", () => {
  it("254 === amortCalcule, sur un cas avec amortissement positif", () => {
    const fr = fiscalResult({ amortCalcule: 3720 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "254")?.value, 3720);
  });

  it("amortCalcule = 0 → 254 alimentée avec 0 (convention identique à 318, jamais bloquée)", () => {
    const fr = fiscalResult({ amortCalcule: 0 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "254")?.value, 0);
    assert.equal(findBlocked(form, "254"), undefined);
  });

  it("254 n'est jamais reconstruite à partir de amortDeduct ou amortReporte", () => {
    // amortCalcule volontairement différent de amortDeduct/amortReporte pour
    // détecter toute confusion entre les trois grandeurs.
    const fr = fiscalResult({ amortCalcule: 3720, amortDeduct: 1000, amortReporte: 2720 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "254")?.value, 3720);
    assert.doesNotMatch(findCase(form, "254")!.trace.path, /amortDeduct|amortReporte/);
  });
});

describe("Cycle 47 — non-régression des cases déjà livrées", () => {
  it("232/264/270/294/310/312/314/318/370/372 restent strictement identiques à l'ajout de 218/254", () => {
    const fr = fiscalResult({
      recettes: { total: 9000 },
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 500, chargesPreExploitation: 0, totalNonDeductible: 100 },
      resultatAvantAmort: 6900,
      amortCalcule: 1500,
      resultatFiscal: 5400,
      amortReporte: 300,
      amortNonDeduitExercice: 300,
      deficitsImputes: 200,
    });
    const form = map2033BFromRfs(rfs(fr));

    assert.equal(findCase(form, "232")?.value, 9000);
    assert.equal(findCase(form, "264")?.value, round2(2000 + 1500 + 100));
    assert.equal(findCase(form, "270")?.value, round2(9000 - (2000 + 1500 + 100)));
    assert.equal(findCase(form, "294")?.value, 500);
    const resultatComptable = round2(6900 - 1500 - 100);
    assert.equal(findCase(form, "310")?.value, resultatComptable);
    assert.equal(findCase(form, "312")?.value, resultatComptable > 0 ? resultatComptable : undefined);
    assert.equal(findCase(form, "318")?.value, 300);
    assert.equal(findCase(form, "370")?.value, 5400);
  });

  it("352/354/356/360 restent bloquées, casesNonAlimentees structurelles toujours 4 (hors 242/244, A1)", () => {
    const form = map2033BFromRfs(rfs(fiscalResult()));
    assert.equal(form.casesNonAlimentees.filter((c) => !["242", "244"].includes(c.caseId)).length, 4, "218/254 sont dans cases, pas casesNonAlimentees — 360 rejoint 352/354/356 (audit fiscal ciblé, IS uniquement) ; 242/244 (A1) exclues du décompte structurel");
    assert.ok(findBlocked(form, "352"));
    assert.ok(findBlocked(form, "354"));
    assert.ok(findBlocked(form, "356"));
    assert.ok(findBlocked(form, "360"));
    assert.equal(findBlocked(form, "352")?.categorie, "incoherence_modele");
    assert.equal(findBlocked(form, "356")?.categorie, "non_applicable");
    assert.equal(findBlocked(form, "360")?.categorie, "non_applicable");
  });

  it("aucune autre case du groupe 209-348 n'est nouvellement alimentée (300/350 exceptées — audit fiscal ciblé, perte exceptionnelle et déficits LMNP)", () => {
    const form = map2033BFromRfs(rfs(fiscalResult({ recettes: { total: 9000 }, amortCalcule: 1500 })));
    const untouched = [
      "209", "210", "214", "215", "217", "222", "224", "226", "230",
      "234", "236", "238", "240", "242", "243", "244", "250", "252",
      "255", "256", "259", "260", "262", "280", "290", "306",
      "316", "322", "324", "330",
    ];
    for (const caseId of untouched) {
      assert.equal(findCase(form, caseId), undefined, `${caseId} ne doit pas être alimentée par ce cycle`);
    }
  });
});

/**
 * MICRO-JALON R5 — vérifie que les cases 2033-B déjà validées (318/330/350/
 * 370/372) sont correctement alimentées à partir d'une sortie RÉELLE de
 * `applyAmortissementStocks()` (jamais une valeur retapée à la main) dans le
 * scénario R5-B (déficit antérieur + amortissement de l'exercice + ARD tous
 * consommés — voir f006.test.ts pour la preuve détaillée des valeurs
 * intermédiaires). Aucune règle fiscale modifiée : ce test ferme uniquement
 * l'angle mort identifié par l'audit de couverture 2033-B précédent.
 */
describe("MICRO-JALON R5 — wiring 2033-B (318/330/350/370/372) depuis une sortie F-006 réelle (déficit antérieur + ARD)", () => {
  it("scénario R5-B (2000/600 déficit/800 amort/500 ARD) : 318=0, 350=600, 370=100, 330 et 372 absentes", () => {
    const application = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 2000,
      amortCalcule: 800,
      stockDeficitsAnterieurs: [{ millesime: 2023, montant: 600 }],
      stockAmortissementsReportes: 500,
    });
    // Précondition : reprend exactement les valeurs déjà verrouillées par
    // f006.test.ts (R5-B) — pas un second calcul indépendant.
    assert.equal(application.resultatFiscal, 100);
    assert.equal(application.deficitsImputes, 600);
    assert.equal(application.deficitNouveau, 0);
    assert.equal(application.amortReporte, 0);

    const fr = fiscalResult({
      resultatAvantAmort: 2000,
      amortCalcule: 800,
      amortDeduct: application.amortDeduct,
      amortReporte: application.amortReporte,
      amortNonDeduitExercice: 0,
      amortReportesUtilises: application.amortReportesUtilises,
      resultatFiscal: application.resultatFiscal,
      deficitNouveau: application.deficitNouveau,
      deficitsImputes: application.deficitsImputes,
    });
    const form = map2033BFromRfs(rfs(fr));

    assert.equal(findCase(form, "318")?.value, 0, "318 = mouvement annuel = 0 (dotation N intégralement déduite)");
    assert.equal(findCase(form, "350")?.value, 600, "350 = deficitsImputes = 600");
    assert.equal(findCase(form, "370")?.value, 100, "370 = resultatFiscal = 100 (>0)");
    assert.equal(findCase(form, "330"), undefined, "330 absente : deficitNouveau = 0, pas de déficit LMNP cette année");
    assert.equal(findCase(form, "372"), undefined, "372 absente : resultatFiscal > 0, jamais < 0");
  });

  it("scénario R5-A (1000/600 déficit/800 amort/500 ARD) : 318=400 (mouvement annuel), stock final=900, 350=600", () => {
    const application = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 1000,
      amortCalcule: 800,
      stockDeficitsAnterieurs: [{ millesime: 2023, montant: 600 }],
      stockAmortissementsReportes: 500,
    });
    assert.equal(application.resultatFiscal, 0);
    assert.equal(application.deficitsImputes, 600);
    assert.equal(application.amortReporte, 900, "stock final inchangé");
    assert.equal(application.amortReportesUtilises, 0);
    assert.equal(application.amortDeduct, 400);

    const fr = fiscalResult({
      resultatAvantAmort: 1000,
      amortCalcule: 800,
      amortDeduct: application.amortDeduct,
      amortReporte: application.amortReporte,
      amortNonDeduitExercice: round2(800 - application.amortDeduct),
      amortReportesUtilises: application.amortReportesUtilises,
      resultatFiscal: application.resultatFiscal,
      deficitNouveau: application.deficitNouveau,
      deficitsImputes: application.deficitsImputes,
    });
    const form = map2033BFromRfs(rfs(fr));

    assert.equal(findCase(form, "318")?.value, 400, "318 = mouvement annuel seul (800 − 400), sans ARD d'ouverture");
    assert.notEqual(findCase(form, "318")?.value, fr.amortReporte, "318 ≠ stock final");
    assert.equal(findCase(form, "350")?.value, 600, "350 = deficitsImputes = 600");
    assert.equal(findCase(form, "330"), undefined, "330 absente : deficitNouveau = 0 (résultat avant amort positif)");
    assert.equal(findCase(form, "370"), undefined, "370 absente : resultatFiscal = 0, pas > 0");
    assert.equal(findCase(form, "372"), undefined, "372 absente : resultatFiscal = 0, pas < 0");
  });
});
