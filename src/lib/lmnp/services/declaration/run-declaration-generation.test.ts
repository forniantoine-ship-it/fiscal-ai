import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  declarationCompletude,
  resolveFormulairesManquants,
  runDeclarationGeneration,
} from "./run-declaration-generation";
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

function totalRecettesValue(draft: DeclarationDraft): number | "BLOQUE" {
  const generation = runDeclarationGeneration(draft, 2025);
  if (generation.status !== "generated") return "BLOQUE";
  return generation.fiscalResult.totalRecettes;
}

/**
 * Cycle 18 — section 8 : jusqu'ici (Cycles 15A-17), le montant avait été
 * vérifié jusqu'à `produceFiscalResult()` mais jamais jusqu'au point de
 * connexion réel `runDeclarationGeneration()` (F-006 → F-007), qui n'avait
 * aucun test dédié. Ce test suit un montant réel, issu d'un vrai classeur
 * Excel, jusqu'à `fiscalResult.totalRecettes` exposé par F-007.
 *
 * Audit fiscal 2031-SD 2026 : la case "AB" n'a jamais existé sur ce
 * formulaire (« Production vendue » appartient au 2033-B-SD, rubrique 218) —
 * la trace ne vise donc plus une case Cerfa du 2031-SD, mais la donnée
 * FiscalResult elle-même, disponible sur `generation.fiscalResult`.
 */
describe("Cycle 18 — trace Excel → F-006 → F-007, montant exact", () => {
  it("un montant Excel réel arrive inchangé dans fiscalResult.totalRecettes après runDeclarationGeneration()", async () => {
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
    assert.equal(totalRecettesValue(draftFor(session)), 1000, "après A");

    session = await uploadSequentially(session, fileA, 2025, "docA-bis");
    assert.equal(totalRecettesValue(draftFor(session)), 1000, "après réimport strict de A — doublon bloqué");

    session = await uploadSequentially(session, fileB, 2025, "docB");
    assert.equal(totalRecettesValue(draftFor(session)), 3000, "après A+B");

    session = await uploadSequentially(session, fileC, 2025, "docC");
    assert.equal(totalRecettesValue(draftFor(session)), 5000, "après A+B+C — C (nom différent, contenu=B) jamais dédupliqué avec B");

    session = removeDocumentFromRevenueSession(session, "docB", 2025);
    assert.equal(totalRecettesValue(draftFor(session)), 3000, "après suppression de B — reste A+C");

    session = await uploadSequentially(session, fileB, 2025, "docB-bis");
    assert.equal(totalRecettesValue(draftFor(session)), 5000, "après réimport de B — jamais bloqué en doublon permanent");

    session = removeDocumentFromRevenueSession(session, "docA", 2025);
    assert.equal(totalRecettesValue(draftFor(session)), 4000, "après suppression de A — reste B+C");

    session = await uploadSequentially(session, fileA, 2025, "docA-ter");
    assert.equal(totalRecettesValue(draftFor(session)), 5000, "après réimport de A — retour à l'état complet A+B+C");
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
    // P0-2 — declarationCompletude() est désormais une fonction pure sur un
    // tableau de caseId, découplée du type LiasseEngineOutput (F-007).
    const completude = declarationCompletude(["2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"]);
    assert.equal(completude, "partielle");
  });

  it("declarationCompletude() === 'complete' seulement quand formulairesManquants est vide", () => {
    const completude = declarationCompletude([]);
    assert.equal(completude, "complete");
  });

  it("runDeclarationGeneration() sur un dossier réel expose completude: 'complete' (P1-1 : 2033-D-SD retiré du périmètre LMNP réel simplifié à l'IR — les 4 formulaires attendus sont tous générés via la RFS)", async () => {
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
      "complete",
      "2033-D-SD n'est plus attendu (P1-1) : un dossier où les 4 formulaires du périmètre IR sont générés via la RFS n'est plus considéré incomplet",
    );
  });
});

/**
 * P0-2 (audit 2026-09-02) — resolveFormulairesManquants() est la source de
 * vérité unique consommée par DeclarationReadyView/ValidationDocumentStep :
 * préfère liasseRfs à liasseResult, jamais de fusion, jamais de recalcul.
 */
describe("P0-2 — resolveFormulairesManquants() préfère liasseRfs à liasseResult (jamais de fusion)", () => {
  function liasseResultFixture(formulairesManquants: string[]) {
    return {
      exercice: 2025,
      form2031Generated: true,
      caseCount: 4,
      cases: [],
      formulairesManquants,
      trace: { ksArtifacts: [], generatedAt: "2026-08-31T00:00:00.000Z", sourceFiscalResultAt: "2026-08-31T00:00:00.000Z" },
      generatedAt: "2026-08-31T00:00:00.000Z",
    } as unknown as DeclarationDraft["liasseResult"];
  }

  function liasseRfsFixture(formulairesManquants: string[]) {
    return {
      exercice: 2025,
      form2031: { formId: "2031-SD", millésime: 2025, cases: [] },
      form2031Bis: { formId: "2031-Bis-SD", millésime: 2025, cases: [], casesNonAlimentees: [] },
      form2033A: { formId: "2033-A-SD", millésime: 2025, cases: [], casesNonAlimentees: [] },
      form2033B: { formId: "2033-B-SD", millésime: 2025, cases: [], casesNonAlimentees: [] },
      form2033C: { formId: "2033-C-SD", millésime: 2025, cases: [], casesNonAlimentees: [] },
      formulairesAttendus: ["2031-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"],
      formulairesGeneres: ["2031-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD"],
      formulairesManquants,
      trace: { ksArtifacts: [], assembledAt: "2026-08-31T00:00:00.000Z", sourceFiscalResultAt: "2026-08-31T00:00:00.000Z" },
    } as unknown as DeclarationDraft["liasseRfs"];
  }

  it("quand liasseRfs est présent, utilise liasseRfs.formulairesManquants — jamais les 4 valeurs F-007", () => {
    // Valeurs réelles observées en production (cf. audit P0-2) : F-007 liste
    // toujours les 4 formulaires hors 2031-SD, la RFS ne liste plus que 2033-D-SD.
    const liasseResult = liasseResultFixture(["2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"]);
    const liasseRfs = liasseRfsFixture(["2033-D-SD"]);

    const result = resolveFormulairesManquants(liasseResult, liasseRfs);

    assert.deepEqual(result, ["2033-D-SD"]);
    assert.notDeepEqual(result, liasseResult!.formulairesManquants, "ne doit jamais retomber sur la liste F-007 quand liasseRfs existe");
  });

  it("n'effectue jamais de fusion des deux tableaux", () => {
    const liasseResult = liasseResultFixture(["2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"]);
    const liasseRfs = liasseRfsFixture(["2033-D-SD"]);

    const result = resolveFormulairesManquants(liasseResult, liasseRfs);

    assert.equal(result.length, 1, "pas de concaténation des deux sources — seule la RFS doit apparaître");
  });

  it("fallback : quand liasseRfs est absent, conserve le comportement historique (liasseResult, F-007)", () => {
    const liasseResult = liasseResultFixture(["2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"]);

    const result = resolveFormulairesManquants(liasseResult, undefined);

    assert.deepEqual(result, ["2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"]);
  });

  it("liasseResult et liasseRfs tous deux absents → tableau vide, jamais une valeur inventée", () => {
    const result = resolveFormulairesManquants(undefined, undefined);
    assert.deepEqual(result, []);
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
    // P1-1 : 2033-D-SD retiré du périmètre attendu — les 4 formulaires du
    // périmètre IR sont générés via la RFS, donc completude est "complete".
    assert.equal(generation.completude, "complete");
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
    // P1-1 : 2033-D-SD retiré du périmètre attendu, des deux côtés (F-007 et RFS).
    assert.equal(generation.completude, "complete");
    assert.equal(generation.liasseResult.formulairesManquants.length, 3);
    assert.equal(generation.fiscalResult.resultatFiscal, 5500);
  });
});

/**
 * P0-1 (audit 2026-09-02) — jusqu'ici `liasseRfs` était calculé par
 * runDeclarationGeneration() (Cycle 31/35 ci-dessus) mais son résultat
 * n'était jamais persisté ni exposé à l'utilisateur : ces tests couvrent le
 * branchement, pas un nouveau calcul.
 */
describe("P0-1 — liasseRfs expose les 4 formulaires complémentaires (2031-bis, 2033-A/B/C)", () => {
  function draftReel(): DeclarationDraft {
    return {
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
  }

  it("generation.liasseRfs contient les 4 formulaires (2031-bis, 2033-A, 2033-B, 2033-C) avec leurs identifiants attendus", () => {
    const generation = runDeclarationGeneration(draftReel(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    assert.equal(generation.liasseRfs.form2031Bis.formId, "2031-Bis-SD");
    assert.equal(generation.liasseRfs.form2033A.formId, "2033-A-SD");
    assert.equal(generation.liasseRfs.form2033B.formId, "2033-B-SD");
    assert.equal(generation.liasseRfs.form2033C.formId, "2033-C-SD");
    assert.ok(Array.isArray(generation.liasseRfs.form2031Bis.cases));
    assert.ok(Array.isArray(generation.liasseRfs.form2033A.cases));
    assert.ok(Array.isArray(generation.liasseRfs.form2033B.cases));
    assert.ok(Array.isArray(generation.liasseRfs.form2033C.cases));
  });

  it("le 2031-SD (liasseResult, F-007) reste inchangé par la présence de liasseRfs — même dossier, mêmes cases", () => {
    const generation = runDeclarationGeneration(draftReel(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    assert.equal(generation.fiscalResult.totalRecettes, 9000, "F-007/2031-SD non affecté par le branchement de liasseRfs");
    assert.equal(generation.liasseResult.formulairesManquants.length, 3, "P1-1 : 2033-D-SD retiré du périmètre attendu — F-007 ne liste plus que 2033-A/B/C comme manquants");
  });
});

/**
 * P0-1 (audit 2026-09-03) — invariant d'idempotence : à données source
 * inchangées, une nouvelle génération du MÊME exercice ne doit jamais
 * modifier resultatFiscal/stocks. Avant le fix, `draft.fiscalResult.stocks`
 * (la CLÔTURE persistée après R1) était relu comme OUVERTURE de R2 — un
 * déficit ou un amortissement reporté de l'exercice courant se réinjectait
 * alors dans son propre calcul, faisant dériver amortReporte à chaque
 * régénération et dupliquant les lignes de stock de déficits.
 */
describe("P0-1 — idempotence : régénération du même exercice sans modification de données source", () => {
  function regenerate(draft: DeclarationDraft, fiscalYear: number) {
    const generation = runDeclarationGeneration(draft, fiscalYear);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    return generation;
  }

  // Reproduit exactement ce que ValidationDocumentStep.tsx écrit sur le
  // draft après une génération : le miroir fiscalResult est mis à jour.
  function apresGeneration(draft: DeclarationDraft, generation: ReturnType<typeof regenerate>): DeclarationDraft {
    return { ...draft, fiscalResult: generation.fiscalResult } as DeclarationDraft;
  }

  function draftAvecDeficit(): DeclarationDraft {
    return {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Elsa",
      exploitantLastName: "Bouvard",
      dateMiseEnService: "2025-02-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 5100 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 14962, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 3720, status: "validated" },
    } as unknown as DeclarationDraft;
  }

  it("TEST 1 — R1 → R2 sans modification : resultatFiscal, deficitNouveau, amortReporte et stocks strictement identiques", () => {
    const draft = draftAvecDeficit();
    const r1 = regenerate(draft, 2025);
    const r2 = regenerate(apresGeneration(draft, r1), 2025);

    assert.equal(r2.fiscalResult.resultatFiscal, r1.fiscalResult.resultatFiscal);
    assert.equal(r2.fiscalResult.deficitNouveau, r1.fiscalResult.deficitNouveau);
    assert.equal(r2.fiscalResult.amortDeduct, r1.fiscalResult.amortDeduct);
    assert.equal(
      r2.fiscalResult.amortReporte,
      r1.fiscalResult.amortReporte,
      "l'amortissement reporté ne doit pas s'accumuler à chaque régénération du même exercice",
    );
    assert.deepEqual(
      r2.fiscalResult.stocks.deficits,
      r1.fiscalResult.stocks.deficits,
      "le déficit de l'exercice courant ne doit jamais être réinjecté comme stock antérieur de lui-même",
    );
    assert.equal(r2.fiscalResult.stocks.amortissementsReportes, r1.fiscalResult.stocks.amortissementsReportes);
  });

  it("TEST 2 — R1 → R2 → R3 sans modification : les trois générations sont strictement identiques", () => {
    const draft = draftAvecDeficit();
    const r1 = regenerate(draft, 2025);
    const r2 = regenerate(apresGeneration(draft, r1), 2025);
    const r3 = regenerate(apresGeneration(draft, r2), 2025);

    assert.deepEqual(r2.fiscalResult.stocks, r1.fiscalResult.stocks);
    assert.deepEqual(r3.fiscalResult.stocks, r2.fiscalResult.stocks);
    assert.equal(r3.fiscalResult.amortReporte, r1.fiscalResult.amortReporte);
    assert.equal(r3.fiscalResult.resultatFiscal, r1.fiscalResult.resultatFiscal);
    assert.equal(r3.fiscalResult.deficitNouveau, r1.fiscalResult.deficitNouveau);
  });

  it("TEST 3 — un déficit produit en R1 n'est jamais dupliqué/réinjecté dans le stock de R2", () => {
    const draft = draftAvecDeficit();
    const r1 = regenerate(draft, 2025);
    assert.equal(r1.fiscalResult.stocks.deficits.length, 1);
    assert.equal(r1.fiscalResult.stocks.deficits[0]?.millesime, 2025);
    assert.equal(r1.fiscalResult.stocks.deficits[0]?.montant, 9862, "5100 - 14962, en valeur absolue");

    const r2 = regenerate(apresGeneration(draft, r1), 2025);
    assert.equal(r2.fiscalResult.stocks.deficits.length, 1, "jamais deux lignes pour le même millésime après régénération");
    assert.deepEqual(r2.fiscalResult.stocks.deficits, r1.fiscalResult.stocks.deficits);
  });

  it("TEST 4 — un amortissement reporté (39C) produit en R1 ne s'additionne pas à lui-même en R2", () => {
    const draft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 8000, status: "validated" },
    } as unknown as DeclarationDraft;

    const r1 = regenerate(draft, 2025);
    assert.equal(r1.fiscalResult.amortReporte, 1000, "8000 calculé - 7000 déduit (résultat avant amort = 7000)");

    const r2 = regenerate(apresGeneration(draft, r1), 2025);
    assert.equal(r2.fiscalResult.amortReporte, 1000, "ne doit jamais devenir 2000 (1000 + 1000) après régénération du même exercice");
    assert.equal(r2.fiscalResult.resultatFiscal, r1.fiscalResult.resultatFiscal);
  });

  it("TEST 5 — modification fiscale réelle entre R1 et R2 : le résultat change bien en conséquence", () => {
    const draft = draftAvecDeficit();
    const r1 = regenerate(draft, 2025);

    const draftModifie = {
      ...apresGeneration(draft, r1),
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 20000 },
    } as unknown as DeclarationDraft;
    const r2 = regenerate(draftModifie, 2025);

    assert.notEqual(
      r2.fiscalResult.resultatFiscal,
      r1.fiscalResult.resultatFiscal,
      "une vraie modification de donnée source doit produire un résultat différent",
    );
  });
});
