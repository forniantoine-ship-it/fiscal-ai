/**
 * A1 — cohérence du détail 2033-B, de bout en bout : vrai calcul F-012 → sortie persistée → F-006 → RFS → 2033-B
 * (et PDF). Les lignes publiées 242 + 244 + 254 doivent expliquer EXACTEMENT 264 ; aucune charge financière ne
 * doit entrer en 242/244 ; toute situation non explicable est signalée (jamais un détail qui ne tient pas).
 * Aucun montant de charges n'est codé en dur : les attentes sont lues sur la sortie F-012.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/detail-2033b-a1.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runDeclarationGeneration } from "./run-declaration-generation";
import { buildChargesAssistantOutput } from "../f012/charges-assistant-output";
import { generateCerfa2033BFromRfs } from "../liasse-pdf/generate-cerfa-2033b";
import { round2 } from "@/runtime/capabilities/f007/types";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import type { ComputeChargesExerciceInput } from "@/runtime/capabilities/f012/compute-charges-exercice";
import type { DeclarationDraft } from "../../types";
import { ALICE_YEAR, LOAN_RETIRE_AT, aliceDraft, aliceLoanThenNone, aliceWithLoan, f012Output, pretTest } from "./alice-test-draft";

function gen(draft: DeclarationDraft) {
  const g = runDeclarationGeneration(draft, ALICE_YEAR);
  assert.equal(g.status, "generated", "précondition : le dossier doit se générer");
  if (g.status !== "generated") throw new Error("unreachable");
  const form = g.liasseRfs.form2033B;
  const v = (id: string) => form.cases.find((c) => c.caseId === id)?.value as number | undefined;
  return { g, form, v, fr: g.rfs.fiscalResult };
}

/** L'équation qui explique 264 : 242 + 244 + 254 (lignes absentes = 0). */
function equation(v: (id: string) => number | undefined) {
  return round2((v("242") ?? 0) + (v("244") ?? 0) + (v("254") ?? 0));
}


/** Sortie F-012 telle que persistée AVANT A1 : sans les ventilations par catégorie. */
function sansVentilations(draft: DeclarationDraft): DeclarationDraft {
  const ancienne = { ...draft.chargesAssistant! } as Record<string, unknown>;
  delete ancienne.parCategoriePreExploitation;
  delete ancienne.parCategorieNonDeductible;
  return { ...draft, chargesAssistant: ancienne as unknown as DeclarationDraft["chargesAssistant"] };
}

const cat = (m: Partial<Record<string, number>> | undefined, key: string) => m?.[key] ?? 0;

describe("A1 — PNO et taxe foncière : chaque nature sur sa ligne, 242 + 244 + 254 = 264", () => {
  it("PNO normale (bien déjà en service, aucune pré-exploitation) → 242 = PNO, 244 absente", () => {
    const { charges } = f012Output({ assurancePno: 120, dateMiseEnService: "2024-06-01" });
    assert.equal(charges.totalPreExploitation, 0, "précondition : aucune pré-exploitation");
    const { v, form } = gen(aliceDraft({ assurancePno: 120 }, {}, "2024-06-01"));
    assert.equal(v("242"), cat(charges.parCategorie, "assurance_pno"));
    assert.equal(v("244"), undefined, "aucune taxe foncière : 244 non alimentée, jamais 0");
    assert.equal(form.conservationDetail.status, "CONSERVE");
    assert.equal(equation(v), v("264"));
  });

  it("taxe foncière normale (aucune pré-exploitation) → 244 = taxe foncière, 242 absente", () => {
    const { charges } = f012Output({ taxeFonciere: 600, dateMiseEnService: "2024-06-01" });
    const { v, form } = gen(aliceDraft({ taxeFonciere: 600 }, {}, "2024-06-01"));
    assert.equal(v("244"), cat(charges.parCategorie, "taxe_fonciere"));
    assert.equal(v("242"), undefined);
    assert.equal(form.conservationDetail.status, "CONSERVE");
    assert.equal(equation(v), v("264"));
  });

  it("PNO + taxe foncière AVEC pré-exploitation (dossier Alice) : quote-parts incluses, équation exacte", () => {
    const { charges } = f012Output({ taxeFonciere: 600, assurancePno: 120 });
    assert.ok(charges.totalPreExploitation > 0, "précondition : il y a de la pré-exploitation");
    const { v, form } = gen(aliceDraft());
    assert.equal(v("244"), round2(cat(charges.parCategorie, "taxe_fonciere") + cat(charges.parCategoriePreExploitation, "taxe_fonciere")));
    assert.equal(v("242"), round2(cat(charges.parCategorie, "assurance_pno") + cat(charges.parCategoriePreExploitation, "assurance_pno")));
    assert.equal(equation(v), v("264"), "242 + 244 + 254 = 264");
    assert.equal(form.conservationDetail.status, "CONSERVE");
    assert.equal(form.conservationDetail.ecart, 0);
    // 244 + 242 = charges d'exploitation totales (exercice + pré-exploitation), 254 = amortissements séparés.
    assert.equal(round2((v("242") ?? 0) + (v("244") ?? 0)), round2(charges.totalDeductible + charges.totalPreExploitation));
  });

  it("absence totale de pré-exploitation, taxe foncière + PNO : montants = parts de l'exercice, équation exacte", () => {
    const { v, form } = gen(aliceDraft({ taxeFonciere: 600, assurancePno: 120 }, {}, "2024-01-01"));
    assert.equal(v("244"), 600);
    assert.equal(v("242"), 120);
    assert.equal(equation(v), v("264"));
    assert.equal(form.conservationDetail.status, "CONSERVE");
  });

  it("le résultat fiscal ne dépend PAS de la ventilation : identique avec et sans les nouvelles ventilations persistées", () => {
    const avec = gen(aliceDraft());
    const sans = gen(sansVentilations(aliceDraft()));
    for (const k of ["resultatFiscal", "resultatAvantAmort", "amortDeduct", "amortReporte", "deficitNouveau"] as const) {
      assert.equal(avec.fr[k], sans.fr[k], k);
    }
    assert.equal(avec.v("264"), sans.v("264"), "264 (total) inchangée");
  });
});

describe("A1 — financement : intérêts/assurance/garantie en 294 ; frais de dossier en 242", () => {
  it("crédit présent : 294 = intérêts + assurance + garantie (+ pré-exploitation financière) ; frais dossier en 242 ; 310 = 270 − 294 − 300", () => {
    const sans = gen(aliceDraft(undefined, { creditDeclaredNoneAt: LOAN_RETIRE_AT }));
    const avec = gen(aliceWithLoan());
    const pret = pretTest();
    const expected294 = round2(
      pret.interetsEmpruntExercice +
        pret.interetsPreExploitation +
        pret.assuranceEmpruntExercice +
        pret.assurancePreExploitation +
        pret.garantieDeductible +
        pret.iraDeductible,
    );
    assert.equal(avec.v("294"), expected294);
    assert.equal(
      round2((avec.v("242") ?? 0) - (sans.v("242") ?? 0)),
      pret.fraisDossierDeductibles,
      "frais de dossier F-011 → 242",
    );
    assert.equal(avec.v("244"), sans.v("244"));
    assert.equal(equation(avec.v), avec.v("264"));
    assert.equal(round2((avec.v("270") ?? 0) - (avec.v("294") ?? 0) - (avec.v("300") ?? 0)), avec.v("310"), "arithmétique Cerfa avec crédit");
  });

  it("aucun crédit confirmé : 294 = 0, 242 inchangée (n'est plus artificiellement à 0)", () => {
    const r = gen(aliceDraft(undefined, { creditDeclaredNoneAt: LOAN_RETIRE_AT }));
    assert.equal(r.v("294"), 0);
    assert.notEqual(r.v("242"), 0);
    assert.equal(r.v("242") !== undefined, true);
    assert.equal(equation(r.v), r.v("264"));
  });

  it("crédit saisi puis explicitement retiré : strictement le même 2033-B que « aucun crédit » d'emblée", () => {
    const retire = gen(aliceLoanThenNone());
    const jamais = gen(aliceDraft(undefined, { creditDeclaredNoneAt: LOAN_RETIRE_AT }));
    for (const id of ["242", "244", "254", "264", "270", "294", "310"]) assert.equal(retire.v(id), jamais.v(id), id);
  });

  it("état crédit ambigu (document en attente) : le prêt reste déduit (294) — rien n'est effacé — et 242 monte des frais de dossier", () => {
    const ambigu = gen(aliceLoanThenNone({ creditDocumentId: "doc-1" }));
    const jamais = gen(aliceDraft(undefined, { creditDeclaredNoneAt: LOAN_RETIRE_AT }));
    assert.ok((ambigu.v("294") ?? 0) > 0, "le prêt en attente reste pris en compte");
    assert.equal(round2((ambigu.v("242") ?? 0) - (jamais.v("242") ?? 0)), pretTest().fraisDossierDeductibles);
    assert.equal(equation(ambigu.v), ambigu.v("264"));
  });
});

describe("A1 — invariant de conservation : détecté dès que les lignes n'expliquent pas le total", () => {
  const MATRICE: Array<[string, Partial<ComputeChargesExerciceInput>, string]> = [
    ["taxe foncière seule, pré-exploitation", { taxeFonciere: 1234.56 }, "2025-04-15"],
    ["PNO + GLI + honoraires + frais bancaires", { assurancePno: 130.4, assuranceGli: 210.99, honorairesGestion: 300.1, fraisBancaires: 45.5 }, "2025-02-01"],
    ["copropriété avec fonds de travaux (non déductible externe)", { coproLignes: [{ type: "provisions", montant: 800.33 }, { type: "fonds_travaux", montant: 210.5, description: "Fonds ALUR" }] }, "2025-03-01"],
    ["tout ensemble, bien déjà en service", { taxeFonciere: 900, assurancePno: 150, honorairesComptable: 400, coproLignes: [{ type: "provisions", montant: 700 }, { type: "fonds_travaux", montant: 100 }] }, "2024-01-01"],
    ["divers déductible", { divers: [{ id: "d1", description: "Entretien", montant: 275.75 }] }, "2025-06-01"],
  ];

  for (const [label, input, date] of MATRICE) {
    it(`${label} : Σ ventilations = totaux F-012, conservation établie, 242 + 244 + 254 = 264`, () => {
      const { charges } = f012Output({ ...input, dateMiseEnService: date });
      const sum = (m: Partial<Record<string, number>> | undefined) => round2(Object.values(m ?? {}).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) as number);
      assert.equal(sum(charges.parCategoriePreExploitation), charges.totalPreExploitation, "Σ pré-exploitation par catégorie = totalPreExploitation");
      assert.equal(sum(charges.parCategorieNonDeductible), charges.totalNonDeductible, "Σ non déductible par catégorie = totalNonDeductible");
      const r = gen(aliceDraft(input, {}, date));
      assert.equal(r.form.conservationDetail.status, "CONSERVE", r.form.conservationDetail.raisons.join(" ; "));
      assert.equal(equation(r.v), r.v("264"));
    });
  }

  it("dossier persisté AVANT A1 (pré-exploitation > 0, ventilations absentes) : 242/244 non publiées avec raison, 264/254 inchangées ; reconfirmer F-012 les publie", () => {
    const recent = aliceDraft();
    const legacy = gen(sansVentilations(recent));
    assert.equal(legacy.v("242"), undefined);
    assert.equal(legacy.v("244"), undefined);
    assert.equal(legacy.form.conservationDetail.status, "ECART");
    assert.ok(legacy.form.conservationDetail.raisons.some((r) => r.includes("non persistée")));
    assert.ok(legacy.form.casesNonAlimentees.some((c) => c.caseId === "242"), "l'absence est tracée, pas silencieuse");
    const reconfirme = gen(recent);
    assert.equal(reconfirme.v("264"), legacy.v("264"), "264 identique avant/après reconfirmation");
    assert.equal(reconfirme.form.conservationDetail.status, "CONSERVE");
  });

  it("frais d'acquisition déduits immédiatement : nature non ventilée → 242/244 non publiées, écart = frais, 264 les inclut", () => {
    const base = aliceDraft();
    const r = gen({ ...base, logementAmortissement: { ...base.logementAmortissement!, fraisEnCharges: 800 } });
    assert.equal(r.form.conservationDetail.status, "ECART");
    assert.equal(r.form.conservationDetail.ecart, 800);
    assert.equal(r.v("242"), undefined);
    assert.equal(r.v("244"), undefined);
    assert.equal(r.v("264"), round2(gen(base).v("264")! + 800), "264 inclut bien les 800 € de frais d'acquisition");
  });

  it("assurance emprunteur saisie en charges diverses SANS contrepartie F-011 : jamais neutralisée sur son libellé — comptée normalement en 242, conservation établie", () => {
    const avecLigne = gen(
      aliceDraft({ taxeFonciere: 600, divers: [{ id: "dv", description: "Assurance emprunteur", montant: 90, financementOverlap: "assurance_emprunteur" }] }),
    );
    const temoin = gen(aliceDraft({ taxeFonciere: 600 }));
    assert.equal(avecLigne.form.conservationDetail.status, "CONSERVE");
    assert.equal(round2((avecLigne.v("242") ?? 0) - (temoin.v("242") ?? 0)), 90, "la dépense de 90 € n'est pas perdue : elle suit le traitement normal F-012 (autres charges externes)");
    assert.equal(equation(avecLigne.v), avecLigne.v("264"));
  });

  it("dossier persisté AVANT la correction du double comptage (totalNonDeductible « divers » déjà persisté, assurance F-011) : le mapper ne l'attribue jamais à 242/244 — écart signalé", () => {
    const base = aliceDraft({ taxeFonciere: 600 });
    const legacy = gen({
      ...base,
      chargesAssistant: {
        ...base.chargesAssistant!,
        totalNonDeductible: 90,
        parCategorieNonDeductible: { divers: 90 },
      },
    });
    assert.equal(legacy.form.conservationDetail.status, "ECART");
    assert.equal(legacy.form.conservationDetail.ecart, 90);
    assert.equal(legacy.v("242"), undefined);
    assert.ok(legacy.form.casesNonAlimentees.find((c) => c.caseId === "242")?.raison.includes("charge financière"));
  });

  it("contre-épreuve d'incohérence de transport : une ventilation qui ne retrouve pas chargesExploitation est détectée", () => {
    const base = aliceDraft();
    const g = gen(base);
    const fr = { ...g.fr, charges: { ...g.fr.charges, chargesExploitation: g.fr.charges.chargesExploitation + 50 } };
    // Même mapper, même RFS, un total qui diverge de 50 € de la ventilation.
    const form = map2033BFromRfs({ ...g.rfs, fiscalResult: fr });
    assert.equal(form.conservationDetail.status, "ECART");
    assert.equal(form.conservationDetail.ecart, 50);
  });
});

describe("A1 — persistance et rendu PDF", () => {
  it("la sortie persistée de F-012 porte les ventilations (un champ oublié n'atteindrait jamais la 2033-B)", () => {
    const { charges } = f012Output({ taxeFonciere: 600, assurancePno: 120 });
    const persisted = buildChargesAssistantOutput(charges, {}, "2026-01-01T00:00:00.000Z");
    assert.deepEqual(persisted.parCategoriePreExploitation, charges.parCategoriePreExploitation);
    assert.deepEqual(persisted.parCategorieNonDeductible, charges.parCategorieNonDeductible);
    assert.deepEqual(persisted.parCategorie, charges.parCategorie);
    assert.equal(persisted.totalPreExploitation, charges.totalPreExploitation);
  });

  it("PDF 2033-B : 242 et 244 sont dessinées avec les valeurs de la RFS (arrondies à l'euro), sans blocage de génération", async () => {
    const { g, v } = gen(aliceDraft());
    const pdf = await generateCerfa2033BFromRfs({ rfs: g.rfs, declarationVersionId: "a1", generatedAt: "2026-01-01T00:00:00.000Z" });
    assert.equal(pdf.status, "generated");
    if (pdf.status !== "generated") return;
    const drawn = (id: string) => pdf.manifest.find((m) => m.caseId === id)?.text;
    const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ");
    assert.equal(drawn("242")?.replace(/[  ]/g, " "), fmt(v("242")!));
    assert.equal(drawn("244")?.replace(/[  ]/g, " "), fmt(v("244")!));
  });
});
