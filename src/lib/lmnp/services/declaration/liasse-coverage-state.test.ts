import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatLiasseCoverageMessage, resolveLiasseCoverageState } from "./liasse-coverage-state";
import { runDeclarationGeneration } from "./run-declaration-generation";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";

/**
 * P0-2a (2026-09-03) — les fixtures ci-dessous sortent de runDeclarationGeneration()
 * (mêmes dossiers que les tests Cycle 26/31/35 déjà en place), jamais d'un
 * liasseRfs fabriqué à la main : on vérifie le calcul sur de vraies données,
 * pas sur un objet inventé pour faire passer le test.
 */
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

function draftAvecImmobilisationsEtEmprunts(): DeclarationDraft {
  return {
    ...draftReel(),
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
}

describe("P0-2a — resolveLiasseCoverageState() : décompte honnête, jamais fabriqué", () => {
  it("liasseRfs absent → undefined, jamais un décompte inventé", () => {
    assert.equal(resolveLiasseCoverageState(undefined), undefined);
  });

  it("dossier réel sans immobilisations/emprunts : le décompte reflète les cases réellement (non) alimentées", () => {
    const generation = runDeclarationGeneration(draftReel(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    const coverage = resolveLiasseCoverageState(generation.liasseRfs);
    assert.ok(coverage, "liasseRfs est présent dès qu'une génération aboutit");

    // Vérifié contre les données réelles de la fixture — jamais une valeur en dur
    // indépendante de ce que le RFS a effectivement produit.
    const { form2031, form2031Bis, form2033A, form2033B, form2033C } = generation.liasseRfs;
    const casesAlimenteesAttendues =
      form2031.cases.length + form2031Bis.cases.length + form2033A.cases.length + form2033B.cases.length + form2033C.cases.length;
    const casesNonAlimenteesAttendues =
      form2031Bis.casesNonAlimentees.length +
      form2033A.casesNonAlimentees.length +
      form2033B.casesNonAlimentees.length +
      form2033C.casesNonAlimentees.length;

    assert.equal(coverage!.casesAlimentees, casesAlimenteesAttendues);
    assert.equal(coverage!.casesNonAlimentees, casesNonAlimenteesAttendues);
    assert.equal(coverage!.formulairesGeneresCount, generation.liasseRfs.formulairesGeneres.length);
    assert.equal(coverage!.formulairesAttendusCount, generation.liasseRfs.formulairesAttendus.length);

    // Sans immobilisations/emprunts fournis, au moins une case de 2033-A/C doit
    // être non alimentée (donnée absente) — sinon ce test ne prouverait rien.
    assert.ok(coverage!.casesNonAlimentees > 0, "le cas nominal doit réellement démontrer une case non alimentée");
  });

  it("le décompte varie réellement selon les données du dossier — pas une valeur figée", () => {
    const sansImmo = runDeclarationGeneration(draftReel(), 2025);
    const avecImmo = runDeclarationGeneration(draftAvecImmobilisationsEtEmprunts(), 2025);
    assert.equal(sansImmo.status, "generated");
    assert.equal(avecImmo.status, "generated");
    if (sansImmo.status !== "generated" || avecImmo.status !== "generated") return;

    const coverageSansImmo = resolveLiasseCoverageState(sansImmo.liasseRfs);
    const coverageAvecImmo = resolveLiasseCoverageState(avecImmo.liasseRfs);

    assert.notDeepEqual(
      coverageSansImmo,
      coverageAvecImmo,
      "fournir immobilisations/emprunts doit changer le décompte de cases alimentées/non alimentées",
    );
  });
});

describe("P0-2a — formatLiasseCoverageMessage() : jamais 'liasse complète', jamais les raisons détaillées", () => {
  function assertJamaisLiasseComplete(message: { coverageLine: string; disclaimer: string }) {
    const texte = `${message.coverageLine} ${message.disclaimer}`;
    assert.ok(
      !/liasse (fiscale )?compl[eè]te/i.test(texte),
      `le texte ne doit jamais affirmer une liasse complète : "${texte}"`,
    );
    assert.ok(!/documents? officiels?/i.test(texte), `le texte ne doit jamais parler de "document(s) officiel(s)" : "${texte}"`);
  }

  it("cas sans coverage (liasseRfs absent) : message honnête, pas de décompte inventé, pas de mention de complétude", () => {
    const message = formatLiasseCoverageMessage(undefined);
    assertJamaisLiasseComplete(message);
    assert.match(message.disclaimer, /Cerfa officiel/);
    assert.match(message.disclaimer, /t[ée]l[ée]transmission EDI/);
  });

  it("cas nominal (dossier réel généré) : le décompte de formulaires/cases est présent et jamais présenté comme une complétude", () => {
    const generation = runDeclarationGeneration(draftReel(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    const coverage = resolveLiasseCoverageState(generation.liasseRfs);
    const message = formatLiasseCoverageMessage(coverage);
    assertJamaisLiasseComplete(message);

    assert.match(message.coverageLine, new RegExp(`${coverage!.formulairesGeneresCount} formulaire`));
    assert.match(message.coverageLine, new RegExp(`${coverage!.casesAlimentees} case`));
  });

  it("les casesNonAlimentees ne sont jamais exposées telles quelles (pas de caseId, pas de raison, pas de catégorie)", () => {
    const generation = runDeclarationGeneration(draftReel(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    const coverage = resolveLiasseCoverageState(generation.liasseRfs);
    const message = formatLiasseCoverageMessage(coverage);
    const texte = `${message.coverageLine} ${message.disclaimer}`;

    for (const raison of generation.liasseRfs.form2033A.casesNonAlimentees) {
      assert.ok(!texte.includes(raison.caseId), `le caseId "${raison.caseId}" ne doit jamais apparaître dans le message client`);
      assert.ok(!texte.includes(raison.raison), `la raison technique ne doit jamais apparaître dans le message client`);
    }
    // Seul le compte agrégé doit apparaître, jamais le détail.
    assert.match(message.coverageLine, new RegExp(`${coverage!.casesNonAlimentees} en attente de compl`));
  });

  it("quand casesNonAlimentees === 0, le message ne mentionne pas 'en attente de complément' (pas de mention fabriquée)", () => {
    const message = formatLiasseCoverageMessage({
      formulairesGeneresCount: 4,
      formulairesAttendusCount: 4,
      casesAlimentees: 12,
      casesNonAlimentees: 0,
    });
    assert.ok(!message.coverageLine.includes("en attente"), "aucune mention d'attente si tout est alimenté");
    assertJamaisLiasseComplete(message);
  });
});
