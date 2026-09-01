import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { declarationCompletude, runDeclarationGeneration } from "./run-declaration-generation";
import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import { removeDocumentFromRevenueSession } from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import {
  buildWorkbook,
  uploadSequentially,
  workbookToFile,
} from "@/lib/lmnp/services/pipelines/revenus/spreadsheet-revenue.fixtures";
import type { DeclarationDraft, RevenueGptSession } from "@/lib/lmnp/types/domain";

function draftFor(session: RevenueGptSession): DeclarationDraft {
  const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant,
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 0, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 0, status: "validated" },
  } as unknown as DeclarationDraft;
}

function caseABValue(draft: DeclarationDraft): number | "BLOQUE" {
  const generation = runDeclarationGeneration(draft, 2025);
  if (generation.status !== "generated") return "BLOQUE";
  return generation.liasseResult.cases.find((c) => c.caseId === "AB")?.value as number;
}

/**
 * Cycle 18 — section 8 : jusqu'ici (Cycles 15A-17), le montant avait été
 * vérifié jusqu'à `produceFiscalResult()` mais jamais jusqu'au point de
 * connexion réel `runDeclarationGeneration()` (F-006 → F-007 → 2031-SD), qui
 * n'avait aucun test dédié. Ce test suit un montant réel, issu d'un vrai
 * classeur Excel, jusqu'à la case "AB" du formulaire 2031-SD généré.
 */
describe("Cycle 18 — trace Excel → F-006 → F-007 → 2031-SD, montant exact", () => {
  it("un montant Excel réel arrive inchangé en case AB du formulaire 2031-SD généré", async () => {
    const file = workbookToFile(
      buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 4500], ["Février", 4500]] }),
      "revenus.xlsx",
    );
    const session = await uploadSequentially(undefined, file, 2025, "docA");
    const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");
    assert.equal(revenusAssistant.totalRecettes, 9000, "vérification intermédiaire : le pont F-013→F-006 donne 9000€");

    const draft: DeclarationDraft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant,
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated", "la génération ne doit pas être bloquée avec des entrées valides");
    if (generation.status !== "generated") return;

    assert.equal(generation.fiscalResult.totalRecettes, 9000, "F-006 : aucune perte ni ajout entre le pont F-013 et FiscalResult");

    const caseAB = generation.liasseResult.cases.find((c) => c.caseId === "AB");
    assert.equal(caseAB?.value, 9000, "F-007 : la case AB du 2031-SD reporte le montant exact, sans recalcul ni altération");
  });

  it("une anomalie bloquante (dateMiseEnService manquante) empêche réellement la génération — jamais de liasse silencieusement produite", async () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      siret: "12345678901234",
      // dateMiseEnService volontairement absente
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "blocked", "une entrée invalide ne doit jamais produire de liasse");
    if (generation.status !== "blocked") return;
    assert.ok(
      generation.anomalies.some((a) => a.severity === "error" || a.severity === "fatal"),
      "le blocage doit être justifié par une anomalie explicite, jamais silencieux",
    );
  });

  it("une identité incomplète (SIRET manquant) bloque au niveau F-007, même si F-006 a réussi", async () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      // siret volontairement absent
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "blocked", "F-007 doit bloquer sans identité complète, même avec un F-006 valide");
  });
});

/**
 * Cycle 19 — section 9 : séquence complète A, A(doublon), B, C(=B renommé),
 * suppression B, réimport B, suppression A, réimport A — vérifiée à la fois
 * jusqu'à F-006 ET jusqu'à la case AB du 2031-SD généré (F-007), à chaque
 * étape. Jamais testée jusqu'à F-007 auparavant (seulement jusqu'à
 * revenusAssistant/F-006, Cycles 15B/17).
 */
describe("Cycle 19 — séquence multi-upload complète, jusqu'à F-007 à chaque étape", () => {
  it("A, A(doublon), B, C(contenu=B), suppression B, réimport B, suppression A, réimport A", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 1000]] }), "a.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Février", 2000]] }), "b.xlsx");
    const fileC = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Février", 2000]] }), "c.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    assert.equal(caseABValue(draftFor(session)), 1000, "après A");

    session = await uploadSequentially(session, fileA, 2025, "docA-bis");
    assert.equal(caseABValue(draftFor(session)), 1000, "après réimport strict de A — doublon bloqué");

    session = await uploadSequentially(session, fileB, 2025, "docB");
    assert.equal(caseABValue(draftFor(session)), 3000, "après A+B");

    session = await uploadSequentially(session, fileC, 2025, "docC");
    assert.equal(caseABValue(draftFor(session)), 5000, "après A+B+C — C (nom différent, contenu=B) jamais dédupliqué avec B");

    session = removeDocumentFromRevenueSession(session, "docB", 2025);
    assert.equal(caseABValue(draftFor(session)), 3000, "après suppression de B — reste A+C");

    session = await uploadSequentially(session, fileB, 2025, "docB-bis");
    assert.equal(caseABValue(draftFor(session)), 5000, "après réimport de B — jamais bloqué en doublon permanent");

    session = removeDocumentFromRevenueSession(session, "docA", 2025);
    assert.equal(caseABValue(draftFor(session)), 4000, "après suppression de A — reste B+C");

    session = await uploadSequentially(session, fileA, 2025, "docA-ter");
    assert.equal(caseABValue(draftFor(session)), 5000, "après réimport de A — retour à l'état complet A+B+C");
  });
});

/**
 * Cycle 25 — le statut ne doit jamais dire "prêt"/"generated" tant que des
 * formulaires obligatoires manquent. `status: "generated"` (F-006/F-007 ont
 * tourné sans erreur) et `completude` (liasse réellement complète ou non) sont
 * deux informations distinctes — tout wording utilisateur doit se baser sur
 * `completude`, jamais sur `status` seul.
 */
describe("Cycle 25 — completude reflète réellement formulairesManquants", () => {
  it("declarationCompletude() === 'partielle' tant qu'il reste des formulaires attendus non générés", () => {
    const completude = declarationCompletude({
      exercice: 2025,
      form2031Generated: true,
      caseCount: 4,
      cases: [],
      formulairesManquants: ["2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"],
      trace: { ksArtifacts: [], generatedAt: "2026-08-31T00:00:00.000Z", sourceFiscalResultAt: "2026-08-31T00:00:00.000Z" },
      generatedAt: "2026-08-31T00:00:00.000Z",
    });
    assert.equal(completude, "partielle");
  });

  it("declarationCompletude() === 'complete' seulement quand formulairesManquants est vide", () => {
    const completude = declarationCompletude({
      exercice: 2025,
      form2031Generated: true,
      caseCount: 4,
      cases: [],
      formulairesManquants: [],
      trace: { ksArtifacts: [], generatedAt: "2026-08-31T00:00:00.000Z", sourceFiscalResultAt: "2026-08-31T00:00:00.000Z" },
      generatedAt: "2026-08-31T00:00:00.000Z",
    });
    assert.equal(completude, "complete");
  });

  it("runDeclarationGeneration() sur un dossier réel expose completude: 'partielle' (F-007 ne produit que le 2031-SD aujourd'hui)", async () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    assert.equal(
      generation.completude,
      "partielle",
      "tant que 2033-A/B/C/D ne sont pas générés, aucun wording ne doit dire la déclaration complète",
    );
  });
});

/**
 * Cycle 26 — le pipeline doit exposer une RFS assemblée depuis LE MÊME calcul
 * F-006 que fiscalResult/liasseResult, jamais depuis un second appel à
 * produceFiscalResult().
 */
describe("Cycle 26 — runDeclarationGeneration() expose une RFS", () => {
  it("generation.rfs.fiscalResult est structurellement identique au FiscalResult F-006 (recettes/charges/résultat)", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    assert.ok(generation.rfs, "la RFS doit être exposée dès qu'une déclaration est générée");
    assert.equal(generation.rfs.fiscalResult.recettes.total, 9000);
    assert.equal(generation.rfs.fiscalResult.charges.totalDeductible, 2000);
    assert.equal(generation.rfs.fiscalResult.resultatFiscal, 5500, "9000 - 2000 - 1500");
    // Même résultat que le champ historique déjà consommé par Validation/gate —
    // les deux viennent du même calcul, ni l'un ni l'autre n'est recalculé.
    assert.equal(generation.rfs.fiscalResult.resultatFiscal, generation.fiscalResult.resultatFiscal);
    assert.equal(generation.rfs.fiscalResult.recettes.total, generation.fiscalResult.totalRecettes);
  });

  it("immobilisations/emprunts absents du draft → RFS.immobilisations/emprunts undefined, jamais une valeur inventée", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    assert.equal(generation.rfs.immobilisations, undefined);
    assert.equal(generation.rfs.emprunts, undefined);
  });

  it("immobilisations/emprunts présents dans le draft → RFS les porte tels quels, sans transformation", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
      logementAmortissement: {
        prixRevient: 125136,
        valeurTerrain: 17960,
        valeurBati: 107176,
        baseAmortissableBati: 107176,
        montantMobilier: 5400,
        dotationAnnuelle: 1500,
        dureeMoyenneAnnees: 30,
        prorataRatio: 1,
        plan: {
          lignes: [
            { label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 },
          ],
          totalAnnuelExercice: 372,
          totalBrut: 37186,
        },
        fieldSources: {},
        computedAt: "2026-08-31T00:00:00.000Z",
      },
      financementCharges: {
        exerciceFiscal: 2025,
        totalInteretsEmprunt: 4602,
        totalInteretsPreExploitation: 0,
        totalAssurance: 601,
        totalCapitalRembourse: 496,
        totalChargesFinancementExercice: 5203,
        prets: [
          {
            pretId: "pret-1",
            typePret: "amortissable",
            interetsEmpruntExercice: 4602,
            interetsPreExploitation: 0,
            assuranceEmpruntExercice: 601,
            capitalRembourseExercice: 496,
            capitalRestantDu31_12: 130256,
            fraisDossierDeductibles: 0,
            garantieDeductible: 1763,
            iraDeductible: 0,
          },
        ],
        fieldSources: {},
        computedAt: "2026-08-31T00:00:00.000Z",
      },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    // Cycle 35 : rfs.immobilisations n'est plus la MÊME référence que
    // draft.logementAmortissement.plan — elle est désormais fusionnée avec
    // valeurTerrain (champ frère de .plan, perdu jusqu'ici en route vers la
    // RFS). Aucune valeur n'est recalculée : lignes/totalBrut/
    // totalAnnuelExercice restent structurellement identiques (deepEqual),
    // et valeurTerrain est transporté tel quel.
    assert.deepEqual(
      { lignes: generation.rfs.immobilisations?.lignes, totalBrut: generation.rfs.immobilisations?.totalBrut, totalAnnuelExercice: generation.rfs.immobilisations?.totalAnnuelExercice },
      draft.logementAmortissement!.plan,
      "aucune ligne/total recalculé — seule valeurTerrain est ajoutée",
    );
    assert.equal(
      generation.rfs.immobilisations?.valeurTerrain,
      draft.logementAmortissement!.valeurTerrain,
      "valeurTerrain (F-010) transportée jusqu'à la RFS sans perte (Cycle 35)",
    );
    assert.equal(
      generation.rfs.emprunts?.[0]?.capitalRestantDu31_12,
      130256,
      "solde d'emprunt persisté par F-011, jamais recalculé par la RFS",
    );
  });
});

/**
 * Cycle 35 — liasseRfs.form2033A est un champ additif : il ne doit rien
 * changer aux champs historiques, et doit utiliser valeurTerrain transportée
 * depuis draft.logementAmortissement pour fiabiliser les cases 028/030.
 */
describe("Cycle 35 — runDeclarationGeneration() expose form2033A avec l'immobilisation corporelle fiabilisée", () => {
  it("liasseRfs.form2033A.cases contient 028/030 quand logementAmortissement.valeurTerrain est fourni, sans rien changer aux champs historiques", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      // totalDotations doit concorder avec plan.totalAnnuelExercice (3720) : sinon
      // la garde d'invariant F-010/F-014 (Cycle 37) bloquerait 028/030.
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 3720, status: "validated" },
      logementAmortissement: {
        prixRevient: 125136,
        valeurTerrain: 17960.39,
        valeurBati: 107175.61,
        baseAmortissableBati: 107175.61,
        montantMobilier: 5400,
        dotationAnnuelle: 1500,
        dureeMoyenneAnnees: 30,
        prorataRatio: 1,
        plan: {
          lignes: [{ label: "Gros œuvre", montant: 101775.61, dureeAnnees: 30, dotationExercice: 3720, amortissementsCumules: 3720, vnc: 98055.61 }, { label: "Mobilier", montant: 5400, dureeAnnees: 7, dotationExercice: 0, amortissementsCumules: 0, vnc: 5400 }],
          totalAnnuelExercice: 3720,
          totalBrut: 107175.61,
        },
        fieldSources: {},
        computedAt: "2026-08-31T00:00:00.000Z",
      },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    assert.ok(generation.liasseRfs.form2033A, "form2033A doit être présent");
    const case028 = generation.liasseRfs.form2033A.cases.find((c) => c.caseId === "028");
    const case030 = generation.liasseRfs.form2033A.cases.find((c) => c.caseId === "030");
    assert.ok(case028, "028 doit être alimentée grâce à valeurTerrain transportée jusqu'à la RFS");
    assert.equal(case028?.value, 125136, "107175.61 + 17960.39, arrondi");
    assert.ok(case030, "030 doit être alimentée");
    assert.equal(case030?.value, 121416, "125136 − 3720");

    // Champs historiques inchangés par cet ajout additif.
    assert.equal(generation.completude, "partielle");
    assert.equal(generation.fiscalResult.resultatFiscal, 3280, "9000 - 2000 - 3720 (totalDotations aligné sur plan.totalAnnuelExercice)");
  });
});

/**
 * Cycle 31 — liasseRfs est un champ additif : il ne doit rien changer aux
 * champs historiques (fiscalResult/liasseResult/completude/rfs).
 */
describe("Cycle 31 — runDeclarationGeneration() expose liasseRfs sans casser le contrat existant", () => {
  it("liasseRfs est présent, cohérent avec rfs, et les champs historiques restent inchangés", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    assert.ok(generation.liasseRfs, "liasseRfs doit être présent");
    assert.equal(generation.liasseRfs.form2031.formId, "2031-SD");
    assert.equal(generation.liasseRfs.form2033B.formId, "2033-B-SD");
    assert.equal(
      generation.liasseRfs.form2033B.cases.find((c) => c.caseId === "232")?.value,
      generation.rfs.fiscalResult.recettes.total,
      "cohérent avec rfs — même source, aucun second calcul",
    );

    // Champs historiques inchangés — ce que testait déjà le Cycle 18 avant l'ajout de liasseRfs.
    assert.equal(generation.completude, "partielle");
    assert.equal(generation.liasseResult.formulairesManquants.length, 4);
    assert.equal(generation.fiscalResult.resultatFiscal, 5500);
  });
});
