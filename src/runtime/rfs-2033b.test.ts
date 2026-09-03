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

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
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

  it("318 reprend exactement fiscalResult.amortReporte", () => {
    const fr = fiscalResult({ amortReporte: 3720 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "318")?.value, 3720);
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

describe("P1 — ventilation financement (242/294) depuis rfs.emprunts", () => {
  it("1. intérêts seuls → 294, 242 présente à 0 (détail disponible)", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1000, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ interetsEmpruntExercice: 1000 })]));
    assert.equal(findCase(form, "294")?.value, 1000);
    assert.equal(findCase(form, "242")?.value, 0);
  });

  it("2. assurance d'exercice seule → 242", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 500, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ assuranceEmpruntExercice: 500 })]));
    assert.equal(findCase(form, "242")?.value, 500);
    assert.equal(findCase(form, "294")?.value, 0);
  });

  it("3. frais de dossier seuls → 242", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 300, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ fraisDossierDeductibles: 300 })]));
    assert.equal(findCase(form, "242")?.value, 300);
    assert.equal(findCase(form, "294")?.value, 0);
  });

  it("4. IRA seul → 294", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 400, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ iraDeductible: 400 })]));
    assert.equal(findCase(form, "294")?.value, 400);
    assert.equal(findCase(form, "242")?.value, 0);
  });

  it("5. intérêts + assurance — chacun sur sa case", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1500, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ interetsEmpruntExercice: 1000, assuranceEmpruntExercice: 500 })]));
    assert.equal(findCase(form, "294")?.value, 1000);
    assert.equal(findCase(form, "242")?.value, 500);
  });

  it("6. intérêts + frais de dossier + IRA", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1700, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(
      rfs(fr, [pret({ interetsEmpruntExercice: 1000, fraisDossierDeductibles: 300, iraDeductible: 400 })]),
    );
    assert.equal(findCase(form, "294")?.value, 1400, "1000 (intérêts) + 400 (IRA)");
    assert.equal(findCase(form, "242")?.value, 300, "300 (frais de dossier)");
  });

  it("7. plusieurs prêts, natures différentes → agrégation correcte 242/294 sur l'ensemble de rfs.emprunts", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 2400, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(
      rfs(fr, [
        pret({ pretId: "pret-A", interetsEmpruntExercice: 1000, assuranceEmpruntExercice: 500 }),
        pret({ pretId: "pret-B", fraisDossierDeductibles: 300, iraDeductible: 400, garantieDeductible: 200 }),
      ]),
    );
    assert.equal(findCase(form, "242")?.value, 1000, "500 (assurance A) + 300 (dossier B) + 200 (garantie B)");
    assert.equal(findCase(form, "294")?.value, 1400, "1000 (intérêts A) + 400 (IRA B)");
  });

  it("8. commission de caution → 242 (garantieDeductible, jamais hypothèque/IPPD)", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 250, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ garantieDeductible: 250 })]));
    assert.equal(findCase(form, "242")?.value, 250);
    assert.equal(findCase(form, "294")?.value, 0);
  });

  it("9a. zéro financement, rfs.emprunts vide ([]) — détail disponible, 242 et 294 à 0", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, []));
    assert.equal(findCase(form, "242")?.value, 0, "détail disponible (tableau vide) — 242 alimentée à 0, pas absente");
    assert.equal(findCase(form, "294")?.value, 0);
  });

  it("9b. rfs.emprunts absent (undefined) — repli explicite : 294 = chargesFinancement en totalité, 242 absente", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 4602, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "294")?.value, 4602, "ancien comportement conservé — jamais une ventilation arbitraire faute de détail");
    assert.equal(findCase(form, "242"), undefined, "242 ne doit jamais être inventée sans rfs.emprunts");
  });

  it("10. P0-3a.2 — intérêts pré-exploitation rejoignent 294, assurance pré-exploitation rejoint 242", () => {
    const fr = fiscalResult({
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1000, chargesPreExploitation: 500 },
    });
    const form = map2033BFromRfs(
      rfs(fr, [pret({ interetsEmpruntExercice: 1000, interetsPreExploitation: 350, assurancePreExploitation: 150 })]),
    );
    assert.equal(findCase(form, "294")?.value, 1350, "1000 (exercice) + 350 (pré-exploitation) — 294 doit désormais inclure interetsPreExploitation");
    assert.equal(findCase(form, "242")?.value, 150, "assurancePreExploitation rejoint 242 (autres charges externes)");
    // 264/270/310 restent des lectures de fiscalResult.charges.chargesPreExploitation
    // (TRF-0030, hors périmètre P0-3a.2) — strictement inchangées par la
    // ventilation 242/294 : le résultat fiscal ne change pas, seule la
    // restitution Cerfa des composantes déjà déduites devient visible.
    const sansEmprunts = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "264")?.value, findCase(sansEmprunts, "264")?.value, "264 n'est jamais alimentée directement par le bloc pré-exploitation");
    assert.equal(findCase(form, "270")?.value, findCase(sansEmprunts, "270")?.value);
    assert.equal(findCase(form, "310")?.value, findCase(sansEmprunts, "310")?.value);
  });

  it("10b. plusieurs emprunts — agrégation des composantes pré-exploitation sur 294/242", () => {
    const fr = fiscalResult({
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 475 },
    });
    const form = map2033BFromRfs(
      rfs(fr, [
        pret({ pretId: "pret-A", interetsPreExploitation: 100, assurancePreExploitation: 50 }),
        pret({ pretId: "pret-B", interetsPreExploitation: 250, assurancePreExploitation: 75 }),
      ]),
    );
    assert.equal(findCase(form, "294")?.value, 350, "100 + 250 (intérêts pré-exploitation, deux emprunts)");
    assert.equal(findCase(form, "242")?.value, 125, "50 + 75 (assurance pré-exploitation, deux emprunts)");
  });

  it("10c. aucun montant pré-exploitation — 242/294 inchangées (zéro/absence, comportement existant préservé)", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1500, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ interetsEmpruntExercice: 1000, assuranceEmpruntExercice: 500 })]));
    assert.equal(findCase(form, "294")?.value, 1000, "interetsPreExploitation=0 par défaut sur pret() — aucun effet");
    assert.equal(findCase(form, "242")?.value, 500, "assurancePreExploitation=0 par défaut sur pret() — aucun effet");
  });

  it("11. invariant de conservation (charges de l'exercice seules, sans pré-exploitation) — Σ(242+294 par nature) === fiscalResult.charges.chargesFinancement", () => {
    const emprunts = [
      pret({ pretId: "pret-A", interetsEmpruntExercice: 1234.56, assuranceEmpruntExercice: 210.44 }),
      pret({ pretId: "pret-B", fraisDossierDeductibles: 300, iraDeductible: 175.5, garantieDeductible: 80 }),
    ];
    const chargesFinancement = round2(
      emprunts.reduce(
        (acc, p) =>
          acc +
          p.interetsEmpruntExercice +
          p.iraDeductible +
          p.assuranceEmpruntExercice +
          p.fraisDossierDeductibles +
          p.garantieDeductible,
        0,
      ),
    );
    const fr = fiscalResult({
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement, chargesPreExploitation: 0 },
    });
    const form = map2033BFromRfs(rfs(fr, emprunts));
    const case242 = findCase(form, "242")?.value as number;
    const case294 = findCase(form, "294")?.value as number;
    assert.equal(
      round2(case242 + case294),
      chargesFinancement,
      "242 + 294 doit reconstituer exactement fiscalResult.charges.chargesFinancement — le total de contrôle",
    );
  });

  it("11b. P0-3a.2 — avec pré-exploitation, 242+294 dépasse chargesFinancement exactement de la somme pré-exploitation (nouvel invariant)", () => {
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
    const totalPreExploitationEmprunts = round2(
      emprunts.reduce((acc, p) => acc + p.interetsPreExploitation + p.assurancePreExploitation, 0),
    );
    const fr = fiscalResult({
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement, chargesPreExploitation: totalPreExploitationEmprunts },
    });
    const form = map2033BFromRfs(rfs(fr, emprunts));
    const case242 = findCase(form, "242")?.value as number;
    const case294 = findCase(form, "294")?.value as number;
    assert.equal(
      round2(case242 + case294),
      round2(chargesFinancement + totalPreExploitationEmprunts),
      "242 + 294 reconstitue chargesFinancement UNIQUEMENT augmenté des montants pré-exploitation — chargesFinancement seul (charges de l'exercice) n'est plus reconstitué à l'identique, ce qui est attendu",
    );
    assert.notEqual(round2(case242 + case294), chargesFinancement, "l'ancien invariant (sans pré-exploitation) ne doit plus être vérifié tel quel dès que du pré-exploitation existe");
  });

  it("242/294 sont tracées avec source=Emprunts et un pretId reconstituable quand le détail est disponible", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 1500, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr, [pret({ interetsEmpruntExercice: 1000, assuranceEmpruntExercice: 500 })]));
    assert.equal(findCase(form, "242")?.trace.source, "Emprunts");
    assert.equal(findCase(form, "294")?.trace.source, "Emprunts");
    assert.ok(findCase(form, "242")?.trace.path.includes("rfs.emprunts"));
    assert.ok(findCase(form, "294")?.trace.path.includes("rfs.emprunts"));
  });

  it("294 reste tracée source=FiscalResult en repli (rfs.emprunts absent), comme avant P1", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 4602, chargesPreExploitation: 0 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "294")?.trace.source, "FiscalResult");
    assert.equal(findCase(form, "294")?.trace.path, "fiscalResult.charges.chargesFinancement");
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
    assert.equal(findCase(form, "294")?.value, 350, "294 ne reçoit que B (350)");
    assert.equal(findCase(form, "242")?.value, 150, "242 ne reçoit que C (150)");

    // Aucun des trois n'est compté deux fois : la somme des deltas sur les
    // trois cases (264+294+242 vs un dossier sans aucun montant pré-exploitation)
    // vaut exactement A+B+C, ni plus ni moins.
    const sansRien = sansPreExploitation;
    const delta264 = (findCase(form, "264")?.value as number) - (findCase(sansRien, "264")?.value as number);
    const delta294 = (findCase(form, "294")?.value as number) - (findCase(sansRien, "294")?.value as number);
    const delta242 = (findCase(form, "242")?.value as number) - (findCase(sansRien, "242")?.value as number);
    assert.equal(round2(delta264 + delta294 + delta242), 1000, "500 (A, 264) + 350 (B, 294) + 150 (C, 242) = 1000, jamais plus");
  });

  it("3. réconciliation : 270 − (242+294) === résultat comptable (310/312/314) — aucun double comptage architectural", () => {
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
    const case242 = (findCase(form, "242")?.value as number) ?? 0;
    const case294 = findCase(form, "294")?.value as number;
    const resultatFinal = fr.resultatAvantAmort - fr.amortCalcule - fr.charges.totalNonDeductible;

    assert.equal(
      round2(case270 - (case242 + case294)),
      round2(resultatFinal),
      "résultat d'exploitation (270) moins les charges financières (242+294, B/C inclus) reconstitue exactement le résultat final (310/312/314) — preuve qu'aucun euro n'est compté deux fois entre les deux sections",
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
    assert.equal(findCase(form, "294")?.value, 350, "294 : ventilation multi-emprunts P0-3a.2 inchangée (100+250)");
    assert.equal(findCase(form, "242")?.value, 125, "242 : ventilation multi-emprunts P0-3a.2 inchangée (50+75)");

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

  it("déficit → 372 alimentée, 370 absente du formulaire", () => {
    const fr = fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "372")?.value, 9862);
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
    assert.equal(form.casesNonAlimentees.length, 4, "352/354/356/360 restent bloquées (audit fiscal ciblé : 360 rejoint 356, IS uniquement)");
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

  it("370/372 (2033-B) et le résultat principal du document client proviennent de la même valeur, cas déficitaire", async () => {
    const { buildClientSummaryDocument } = await import(
      "@/lib/lmnp/services/declaration/build-client-summary-document"
    );
    const representation = rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862 }));
    const clientDoc = buildClientSummaryDocument(representation);
    const form = map2033BFromRfs(representation);
    assert.equal(findCase(form, "372")?.value, clientDoc.syntheseFiscale.deficitFiscal);
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

  it("352/354/356/360 restent bloquées, casesNonAlimentees.length toujours 4", () => {
    const form = map2033BFromRfs(rfs(fiscalResult()));
    assert.equal(form.casesNonAlimentees.length, 4, "218/254 sont dans cases, pas casesNonAlimentees — 360 rejoint 352/354/356 (audit fiscal ciblé, IS uniquement)");
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
