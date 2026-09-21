/**
 * Cycle 22 — porte de génération : le paiement ne doit jamais précéder
 * un F-006/F-007 qui échouerait, et un paiement déjà marqué ne doit pas
 * interdire un nouvel essai.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/declaration-generation-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDeclarationGenerationGate } from "./declaration-generation-gate";
import { runDeclarationGeneration } from "./run-declaration-generation";
import { LMNP_ROUTES } from "../../routes";
import type { DeclarationDraft, Property } from "../../types";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import { computeAmortizationPlan } from "@/runtime/capabilities/f010/compute-amortization-plan";

const PROPERTY: Property = {
  id: "prop-1",
  label: "Studio Lyon",
  address: "1 rue Test",
  city: "Lyon",
  postalCode: "69001",
};

/** Plan F-010 réel — jamais `lignes: []` + totalDotations > 0 (impossible produit). */
function coherentLogementAmortissement(dateMiseEnService = "2020-01-01", exerciceFiscal = 2025) {
  const computed = computeAmortizationPlan({
    prixAcquisition: 200000,
    mobilierInclus: false,
    fraisNotaire: 0,
    choixTraitementFrais: "deduction",
    typeBien: "appartement",
    ratioTerrain: 0.2,
    dateMiseEnService,
    exerciceFiscal,
  });
  return {
    computedAt: "2026-01-01T00:00:00.000Z",
    prixRevient: computed.prixRevient,
    valeurTerrain: computed.valeurTerrain,
    valeurBati: computed.valeurBati,
    baseAmortissableBati: computed.baseAmortissableBati,
    montantMobilier: computed.montantMobilierIsole,
    dotationAnnuelle: computed.plan.totalAnnuelExercice,
    dureeMoyenneAnnees: 30,
    prorataRatio: computed.prorataRatio,
    plan: computed.plan,
    fraisEnCharges: computed.fraisEnCharges,
    fieldSources: {},
  } satisfies NonNullable<DeclarationDraft["logementAmortissement"]>;
}

function completeFlags(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  const dateMiseEnService =
    typeof overrides.dateMiseEnService === "string" ? overrides.dateMiseEnService : "2020-01-01";
  const logementAmortissement =
    overrides.logementAmortissement ?? coherentLogementAmortissement(dateMiseEnService, 2025);
  const defaultDotations = logementAmortissement.plan.totalAnnuelExercice;
  return {
    completedSteps: [],
    inpiConfirmedAt: "2026-01-01T00:00:00.000Z",
    logementConfirmedAt: "2026-01-01T00:00:00.000Z",
    // V1 Bucket-1 fix (audit "readiness globale") — isLogementComplete() lit
    // désormais l'état canonique, pas seulement l'horodatage (même principe
    // que chargesAssistant/amortissementAssistant déjà fournis ci-dessous
    // par chaque test) : un fixture "complet" doit donc fournir une valeur,
    // exactement comme pour ces deux autres champs.
    // Lot 5 B2 — plan F-010 réel (lignes non vides) aligné sur la dotation.
    logementAmortissement,
    creditDeclaredNoneAt: "2026-01-01T00:00:00.000Z",
    revenusConfirmedAt: "2026-01-01T00:00:00.000Z",
    chargesConfirmedAt: "2026-01-01T00:00:00.000Z",
    amortissementConfirmedAt: "2026-01-01T00:00:00.000Z",
    amortissementAssistant: {
      exerciceFiscal: 2025,
      totalDotations: defaultDotations,
      status: "validated",
    },
    ...overrides,
    // Si overrides remplace dateMiseEnService/logement sans plan cohérent,
    // les tests qui fournissent explicitement logementAmortissement gardent la main.
  };
}

function generationReadyDraft(): DeclarationDraft {
  return completeFlags({
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
  } as DeclarationDraft);
}

describe("Cycle 22 — porte de génération déclaration", () => {
  it("étapes confirmées mais dateMiseEnService absente → pas de checkout, anomalies visibles, lien de récupération", () => {
    const gate = resolveDeclarationGenerationGate({
      draft: completeFlags({
        siret: "12345678901234",
        siren: "123456789",
        exploitantFirstName: "Marie",
        exploitantLastName: "Dupont",
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 0, totalPreExploitation: 0 },
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 0, status: "validated" },
      } as DeclarationDraft),
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: false,
      generated: false,
    });

    assert.equal(gate.snapshot.isComplete, true, "les drapeaux *ConfirmedAt suffisent à l'écran de synthèse");
    assert.equal(gate.canCheckout, false, "le paiement ne doit pas s'ouvrir si F-006 bloquerait");
    assert.equal(gate.canGenerate, false);
    assert.ok(
      gate.blockingAnomalies.some((a) => a.field === "dateMiseEnService"),
      "l'utilisateur doit voir la raison fiscale réelle",
    );
    assert.ok(
      gate.recoveryItems.some((item) => item.href === LMNP_ROUTES.activite),
      "une action de récupération doit renvoyer vers F-009",
    );
  });

  it("étapes confirmées mais SIRET/SIREN absents → pas de checkout, récupération Activité", () => {
    const gate = resolveDeclarationGenerationGate({
      draft: completeFlags({
        dateMiseEnService: "2020-01-01",
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 0, totalPreExploitation: 0 },
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 0, status: "validated" },
      } as DeclarationDraft),
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: false,
      generated: false,
    });

    assert.equal(gate.canCheckout, false);
    assert.ok(gate.blockingAnomalies.some((a) => a.field === "identite.siret"));
    assert.ok(gate.recoveryItems.some((item) => item.href === LMNP_ROUTES.activite));
  });

  it("dossier prêt → checkout autorisé, pas encore de retry", () => {
    const gate = resolveDeclarationGenerationGate({
      draft: generationReadyDraft(),
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: false,
      generated: false,
    });

    assert.equal(gate.canCheckout, true);
    assert.equal(gate.canRetryAfterPayment, false);
    assert.equal(gate.canGenerate, true);
    assert.equal(gate.blockingAnomalies.length, 0);
  });

  it("paiement déjà marqué, génération bloquée → pas de bouton mort : anomalies + récupération", () => {
    const gate = resolveDeclarationGenerationGate({
      draft: completeFlags({
        siret: "12345678901234",
        exploitantFirstName: "Marie",
        exploitantLastName: "Dupont",
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 0, totalPreExploitation: 0 },
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 0, status: "validated" },
      } as DeclarationDraft),
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: false,
    });

    assert.equal(gate.canCheckout, false);
    assert.equal(gate.canRetryAfterPayment, false);
    assert.equal(gate.canGenerate, false, "on n'autorise pas un nouvel essai tant que F-006/F-007 bloque");
    assert.ok(gate.blockingAnomalies.length > 0);
    assert.ok(gate.recoveryItems.length > 0, "l'utilisateur doit pouvoir quitter l'état bloqué");
  });

  it("paiement déjà marqué, données maintenant valides → nouvel essai sans re-payer", () => {
    const gate = resolveDeclarationGenerationGate({
      draft: generationReadyDraft(),
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: false,
    });

    assert.equal(gate.canCheckout, false, "pas de second paiement");
    assert.equal(gate.canRetryAfterPayment, true);
    assert.equal(gate.canGenerate, true);
  });

  it("déclaration déjà générée, montants alignés → plus aucune action de génération", () => {
    const draft = generationReadyDraft();
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const gate = resolveDeclarationGenerationGate({
      draft: { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canCheckout, false);
    assert.equal(gate.canRetryAfterPayment, false);
    assert.equal(gate.canGenerate, false);
    assert.equal(gate.referenceGenerationStatus, "current");
  });

  it("Cycle 23 — déclaration déjà générée mais recettes corrigées → régénération sans re-paiement", () => {
    const draft = generationReadyDraft();
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const gate = resolveDeclarationGenerationGate({
      draft: {
        ...draft,
        fiscalResult: generation.fiscalResult,
        rfs: generation.rfs,
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 4780.9 },
      } as DeclarationDraft,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canCheckout, false, "pas de second paiement");
    assert.equal(gate.canRetryAfterPayment, true);
    assert.equal(gate.canGenerate, true, "la 2031-SD ne doit pas rester figée sur l'ancien total");
    assert.equal(gate.referenceGenerationStatus, "stale");
  });

  it("déclaration déjà générée mais charges corrigées (recettes inchangées) → régénération sans re-paiement", () => {
    const draft = generationReadyDraft();
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const gate = resolveDeclarationGenerationGate({
      draft: {
        ...draft,
        fiscalResult: generation.fiscalResult,
        rfs: generation.rfs,
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 6000, totalPreExploitation: 0 },
      } as DeclarationDraft,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canCheckout, false, "pas de second paiement");
    assert.equal(gate.canRetryAfterPayment, true, "la dérive des charges doit être détectée, pas seulement les recettes");
    assert.equal(gate.canGenerate, true);
    assert.equal(gate.referenceGenerationStatus, "stale");
  });

  it("déclaration déjà générée mais amortissement corrigé (recettes inchangées) → régénération sans re-paiement", () => {
    const draft = generationReadyDraft();
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const gate = resolveDeclarationGenerationGate({
      draft: {
        ...draft,
        fiscalResult: generation.fiscalResult,
        rfs: generation.rfs,
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 4200, status: "validated" },
      } as DeclarationDraft,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canCheckout, false, "pas de second paiement");
    assert.equal(
      gate.canRetryAfterPayment,
      true,
      "la dérive de l'amortissement doit être détectée, pas seulement les recettes",
    );
    assert.equal(gate.canGenerate, true);
    assert.equal(gate.referenceGenerationStatus, "stale");
  });

  /**
   * P0-5.1 (audit read-only P0-5, anomalie P1) — dans la branche
   * `generated === true` avec dérive détectée, `preview.fiscalResult` était
   * calculé (ligne juste au-dessus, pour détecter la dérive elle-même) mais
   * jamais renvoyé : `gate.fiscalResult` restait `undefined`. Or
   * `ValidationDocumentStep.tsx` rend bien `ValidationFiscalSummary` dans cet
   * état (`showMainContent` est vrai dès que `gate.canGenerate === true`),
   * qui retombait alors sur `buildFiscalSummary()` — une estimation qui ne
   * lit jamais `financementCharges.totalChargesFinancementExercice` ni
   * `chargesPreExploitation`, et ignore le moteur 39C/déficits antérieurs.
   */
  it("P0-5.1 — dérive après génération (financement ajouté) : gate.fiscalResult est le FiscalResult exact recalculé, jamais undefined", () => {
    const draftBase = generationReadyDraft();
    const generation = runDeclarationGeneration(draftBase, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const draft = {
      ...draftBase,
      fiscalResult: generation.fiscalResult,
      rfs: generation.rfs,
      financementCharges: {
        exerciceFiscal: 2025,
        totalChargesFinancementExercice: 1200,
        totalInteretsPreExploitation: 0,
      },
    } as DeclarationDraft;

    const gate = resolveDeclarationGenerationGate({
      draft,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canRetryAfterPayment, true, "l'ajout du financement doit être détecté comme une dérive");
    assert.equal(gate.canGenerate, true);
    assert.equal(gate.referenceGenerationStatus, "stale");
    assert.ok(gate.fiscalResult, "le FiscalResult exact (déjà calculé pour détecter la dérive) doit être exposé, jamais undefined");

    // Le FiscalResult exposé doit être EXACTEMENT celui réellement recalculé —
    // jamais une seconde formule, jamais une reconstruction séparée.
    const attendu = runDeclarationGeneration(draft, 2025);
    assert.equal(attendu.status, "generated");
    if (attendu.status !== "generated") return;
    assert.equal(gate.fiscalResult!.totalRecettes, attendu.fiscalResult.totalRecettes);
    assert.equal(gate.fiscalResult!.totalCharges, attendu.fiscalResult.totalCharges);
    assert.equal(gate.fiscalResult!.amortDeduct, attendu.fiscalResult.amortDeduct);

    // Preuve que le fallback buildFiscalSummary() aurait perdu cette donnée :
    // il ne lit que chargesAssistant.totalDeductible (2000), jamais
    // financementCharges.totalChargesFinancementExercice (1200).
    assert.equal(gate.fiscalResult!.totalCharges, 3200, "2000 (F-012) + 1200 (financement F-011) — visible uniquement via le FiscalResult exact");
    assert.notEqual(
      gate.fiscalResult!.totalCharges,
      draft.chargesAssistant!.totalDeductible,
      "si le fallback buildFiscalSummary() était utilisé à la place, le financement serait invisible (il ne lit que chargesAssistant.totalDeductible)",
    );
  });
});

/**
 * Cycle 24 — une seule source de vérité : le résultat fiscal exposé par la porte
 * (affiché avant paiement) doit être EXACTEMENT `runDeclarationGeneration(...).fiscalResult`
 * (celui qui sert à la génération finale) — jamais une seconde formule. Chaque cas
 * compare gate.fiscalResult à un appel indépendant de runDeclarationGeneration, ET
 * vérifie la valeur fiscale attendue, pour ne pas se contenter d'une égalité vide.
 */
describe("Cycle 24 — gate.fiscalResult === preview.fiscalResult === résultat de génération", () => {
  // gate et generation appellent runDeclarationGeneration() à quelques millisecondes
  // d'écart : seuls trace.computedAt / computedAt (horodatage de calcul) peuvent
  // légitimement différer. Tout le reste — les montants fiscaux eux-mêmes — doit
  // être rigoureusement identique.
  function withoutTimestamps(fr: DeclarationDraft["fiscalResult"]) {
    if (!fr) return fr;
    const { computedAt: _computedAt, trace, ...rest } = fr;
    const { computedAt: _traceComputedAt, ...traceRest } = trace;
    return { ...rest, trace: traceRest };
  }

  function assertSameFiscalResult(draft: DeclarationDraft, fiscalYear: number) {
    const gate = resolveDeclarationGenerationGate({
      draft,
      properties: [PROPERTY],
      fiscalYear,
      paid: false,
      generated: false,
    });
    const generation = runDeclarationGeneration(draft, fiscalYear);
    assert.equal(generation.status, "generated", "le cas de test doit être un dossier générable");
    if (generation.status !== "generated") throw new Error("unreachable");
    assert.ok(gate.fiscalResult, "la porte doit exposer un FiscalResult dès que le dossier est complet");
    assert.deepEqual(
      withoutTimestamps(gate.fiscalResult),
      withoutTimestamps(generation.fiscalResult),
      "le résultat affiché avant paiement doit être structurellement identique à celui qui génère la liasse — pas une approximation qui leur ressemble",
    );
    return gate.fiscalResult!;
  }

  it("bénéfice — amortissement intégralement déductible", () => {
    const fiscalResult = assertSameFiscalResult(
      generationReadyDraft(), // 9000 recettes, 2000 charges, 1500 amortissement
      2025,
    );
    assert.equal(fiscalResult.totalRecettes, 9000);
    assert.equal(fiscalResult.totalCharges, 2000);
    assert.equal(fiscalResult.amortDeduct, 1500, "amortissement entièrement déductible (7000 de résultat avant amort disponible)");
    assert.equal(fiscalResult.amortReporte, 0);
    assert.equal(fiscalResult.deficitNouveau, 0);
    assert.equal(fiscalResult.resultatFiscal, 5500, "9000 - 2000 - 1500");
  });

  it("déficit — résultat avant amortissement déjà négatif : amortissement intégralement reporté (art. 39C), jamais de resultatFiscal négatif", () => {
    // Lot 5 B2 — plan F-010 cohérent avec totalDotations=3720 (premier exercice).
    // L'ancienne fixture `lignes: []` + 3720 était impossible en parcours produit.
    const draft = completeFlags({
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Elsa",
      exploitantLastName: "Bouvard",
      dateMiseEnService: "2025-02-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 5100 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 14962, totalPreExploitation: 0 },
      logementAmortissement: {
        computedAt: "2026-01-01T00:00:00.000Z",
        prixRevient: 200000,
        valeurTerrain: 40000,
        valeurBati: 160000,
        baseAmortissableBati: 160000,
        montantMobilier: 0,
        dotationAnnuelle: 3720,
        dureeMoyenneAnnees: 30,
        plan: {
          lignes: [
            {
              label: "Bâti",
              montant: 160000,
              dureeAnnees: 30,
              dotationAnnuelle: 5333.33,
              dotationExercice: 3720,
              amortissementsCumules: 3720,
              vnc: 156280,
            },
          ],
          totalAnnuelExercice: 3720,
          totalBrut: 160000,
        },
        fieldSources: {},
      },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 3720, status: "validated" },
    } as DeclarationDraft);

    const fiscalResult = assertSameFiscalResult(draft, 2025);
    assert.equal(fiscalResult.resultatAvantAmort, -9862, "5100 - 14962");
    assert.equal(fiscalResult.resultatFiscal, 0, "jamais négatif — le déficit vit dans deficitNouveau, pas dans resultatFiscal");
    assert.equal(fiscalResult.deficitNouveau, 9862);
    assert.equal(fiscalResult.amortDeduct, 0, "aucun amortissement déductible sur un résultat avant amort déjà négatif");
    assert.equal(fiscalResult.amortReporte, 3720, "amortissement intégralement reporté, cf. cas Elsa Bouvard (référence PDF)");
  });

  it("amortissement partiellement limité par l'article 39C — une partie déduite, le surplus reporté, résultat ramené exactement à 0", () => {
    const draft = generationReadyDraft();
    const fiscalResult = assertSameFiscalResult(
      {
        ...draft,
        // 9000 recettes - 2000 charges = 7000 de résultat avant amort disponible,
        // mais 8000 d'amortissement calculé : la limitation ne joue que sur le surplus.
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 8000, status: "validated" },
      } as DeclarationDraft,
      2025,
    );
    assert.equal(fiscalResult.resultatAvantAmort, 7000);
    assert.equal(fiscalResult.amortDeduct, 7000, "plafonné au résultat avant amort disponible");
    assert.equal(fiscalResult.amortReporte, 1000, "8000 calculé - 7000 déduit = 1000 reporté");
    assert.equal(fiscalResult.resultatFiscal, 0);
    assert.equal(fiscalResult.deficitNouveau, 0, "un résultat avant amort positif ne crée jamais de déficit, même limité par le 39C");
  });

  it("déficits antérieurs — imputés avant l'amortissement de l'exercice, résultat fiscal net de l'imputation (P1-1 : stocks d'ouverture transmis via le paramètre dédié de runDeclarationGeneration, jamais via draft.fiscalResult — cf. FiscalYear.stocksOuverture, persistFiscalYearClosureAndTransition())", () => {
    const draft = {
      ...generationReadyDraft(),
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 7000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1000, status: "validated" },
    } as unknown as DeclarationDraft;

    // P1-1 — le stock d'ouverture (résolu et persisté sur FiscalYear N+1 à sa
    // création, jamais dérivé de draft.fiscalResult) est le SEUL vecteur de
    // continuité inter-exercices : la porte de génération elle-même
    // (resolveDeclarationGenerationGate, inchangée) n'a pas accès à ce
    // paramètre — cette assertion vise directement runDeclarationGeneration(),
    // pas la cohérence gate/génération testée par les cas ci-dessus.
    const generation = runDeclarationGeneration(draft, 2025, {
      deficits: [{ millesime: 2023, montant: 2000 }],
      amortissementsReportes: 0,
    });
    assert.equal(generation.status, "generated", "le cas de test doit être un dossier générable");
    if (generation.status !== "generated") throw new Error("unreachable");
    const fiscalResult = generation.fiscalResult;

    assert.equal(fiscalResult.resultatAvantAmort, 5000, "7000 - 2000");
    assert.equal(
      fiscalResult.resultatFiscal,
      2000,
      "5000 - 2000 (déficit antérieur imputé en premier) - 1000 (amortissement) = 2000 — jamais 3000 (déficit antérieur ignoré)",
    );
    assert.deepEqual(
      fiscalResult.stocks.deficits,
      [],
      "le déficit antérieur de 2000 a été intégralement imputé — le stock ne doit plus le porter",
    );
  });
});

/**
 * P0-1 (audit 2026-09-03) — TEST 6 / TEST 7. Un dossier "generated" doit
 * exposer un draft dont `fiscalResult` ET `rfs` reflètent réellement une
 * génération passée (comme le fait ValidationDocumentStep.tsx après un appel
 * réel à runDeclarationGeneration) — jamais des fragments partiels.
 */
describe("P0-1 — TEST 7 : aucune donnée modifiée après génération → pas de CTA de régénération", () => {
  function draftGenere() {
    const draft = generationReadyDraft();
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    return { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
  }

  it("dossier généré, paiement effectué, retour sur l'écran sans aucune modification → canGenerate/canRetryAfterPayment restent false", () => {
    const gate = resolveDeclarationGenerationGate({
      draft: draftGenere(),
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canGenerate, false, "aucune donnée pertinente n'a changé : pas de nouvelle génération proposée");
    assert.equal(gate.canRetryAfterPayment, false, "pas de CTA de régénération sans modification réelle");
    assert.equal(gate.canCheckout, false);
  });
});

describe("P0-1 — TEST 6 : correction d'identité après génération → régénération autorisée sans re-paiement", () => {
  function draftGenere() {
    const draft = generationReadyDraft();
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    return { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
  }

  it("SIREN corrigé après génération (aucune donnée fiscale changée) → canGenerate: true", () => {
    const draftApresGeneration = draftGenere();
    const draftCorrige = { ...draftApresGeneration, siren: "987654321" } as DeclarationDraft;

    const gate = resolveDeclarationGenerationGate({
      draft: draftCorrige,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canGenerate, true, "un SIREN corrigé doit débloquer une régénération, même sans dérive fiscale");
    assert.equal(gate.canRetryAfterPayment, true, "pas de second paiement pour une simple correction d'identité");
  });

  it("dénomination (nom/prénom) corrigée après génération → canGenerate: true", () => {
    const draftApresGeneration = draftGenere();
    const draftCorrige = { ...draftApresGeneration, exploitantLastName: "Martin" } as DeclarationDraft;

    const gate = resolveDeclarationGenerationGate({
      draft: draftCorrige,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canGenerate, true);
    assert.equal(gate.canRetryAfterPayment, true);
  });

  it("SIRET corrigé après génération → la nouvelle génération contient effectivement la nouvelle identité", () => {
    const draftApresGeneration = draftGenere();
    const draftCorrige = { ...draftApresGeneration, siret: "98765432109876" } as DeclarationDraft;

    const gate = resolveDeclarationGenerationGate({
      draft: draftCorrige,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });
    assert.equal(gate.canGenerate, true);

    const regeneration = runDeclarationGeneration(draftCorrige, 2025);
    assert.equal(regeneration.status, "generated");
    if (regeneration.status !== "generated") return;
    assert.equal(regeneration.rfs.identite.siret, "98765432109876");
  });
});

/**
 * P0-1A (2026-09-07) — bug confirmé par l'audit P0-1 : le preview de cette
 * porte tournait TOUJOURS avec `stocksOuverture: undefined`, même quand la
 * génération réelle avait été produite avec un stock d'ouverture non nul
 * (exercice en continuité, déficits antérieurs/amortissements reportés). La
 * comparaison portait alors sur deux résultats structurellement différents.
 *
 * Fixture volontairement choisie pour que la dérive touche `amortDeduct`/
 * `amortReporte` (les deux champs comparés par cette porte, cf.
 * declaration-generation-gate.ts) : resultatAvantAmort = 7000 (9000 - 2000),
 * amortissement calculé = 8000.
 *  - AVEC le déficit antérieur de 3000 (stock réel) : base disponible après
 *    imputation = 4000 → amortDeduct = 4000, amortReporte = 4000.
 *  - SANS ce déficit (bug — preview `undefined`) : base = 7000 →
 *    amortDeduct = 7000, amortReporte = 1000.
 * Les deux résultats diffèrent bien sur les champs comparés : avant
 * correction, ce test aurait échoué (`canGenerate` serait resté `true`).
 */
describe("P0-1A — cohérence stocksOuverture entre le preview de la porte et la génération réelle", () => {
  const STOCKS_OUVERTURE_DEFICIT = {
    deficits: [{ millesime: 2024, montant: 3000 }],
    amortissementsReportes: 0,
  };

  function draftContinuite(): DeclarationDraft {
    return completeFlags({
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 8000, status: "validated" },
    } as DeclarationDraft);
  }

  function genererAvecStock(draft: DeclarationDraft) {
    const generation = runDeclarationGeneration(draft, 2025, STOCKS_OUVERTURE_DEFICIT);
    assert.equal(generation.status, "generated", "précondition — le fixture doit être générable");
    if (generation.status !== "generated") throw new Error("unreachable");
    return generation;
  }

  it("TEST A (régression) — stocksOuverture non nul, aucune modification → canGenerate === false", () => {
    const draft = draftContinuite();
    const generation = genererAvecStock(draft);
    // Précondition — confirme que le stock d'ouverture a réellement un effet
    // sur les deux champs comparés (sinon le test ne prouverait rien).
    assert.equal(generation.fiscalResult.amortDeduct, 4000);
    assert.equal(generation.fiscalResult.amortReporte, 4000);

    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult } as DeclarationDraft;
    const gate = resolveDeclarationGenerationGate({
      draft: draftGenere,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
      stocksOuverture: STOCKS_OUVERTURE_DEFICIT,
    });

    assert.equal(
      gate.canGenerate,
      false,
      "un exercice en continuité sans aucune modification ne doit jamais réclamer de régénération",
    );
    assert.equal(gate.canRetryAfterPayment, false);
  });

  it("TEST B (modification réelle) — même stocksOuverture, recettes corrigées → canGenerate === true", () => {
    const draft = draftContinuite();
    const generation = genererAvecStock(draft);
    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult } as DeclarationDraft;

    const draftModifie = {
      ...draftGenere,
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 15000 },
    } as DeclarationDraft;

    const gate = resolveDeclarationGenerationGate({
      draft: draftModifie,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
      stocksOuverture: STOCKS_OUVERTURE_DEFICIT,
    });

    assert.equal(
      gate.canGenerate,
      true,
      "une vraie modification fiscale doit rester détectée — la correction ne doit pas rendre la porte 'toujours valide'",
    );
  });

  it("TEST C (compatibilité historique) — stocksOuverture absent → comportement inchangé", () => {
    const draft = generationReadyDraft();
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult } as DeclarationDraft;

    const gate = resolveDeclarationGenerationGate({
      draft: draftGenere,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
      // stocksOuverture volontairement omis — un exercice sans continuité
      // doit se comporter exactement comme avant P0-1A.
    });

    assert.equal(gate.canGenerate, false);
  });

  it("TEST D (non-mutation) — le preview ne mute ni draft ni stocksOuverture", () => {
    const draft = draftContinuite();
    const generation = genererAvecStock(draft);
    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult } as DeclarationDraft;
    const draftSnapshot = JSON.stringify(draftGenere);
    const stocksSnapshot = JSON.stringify(STOCKS_OUVERTURE_DEFICIT);

    resolveDeclarationGenerationGate({
      draft: draftGenere,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
      stocksOuverture: STOCKS_OUVERTURE_DEFICIT,
    });

    assert.equal(JSON.stringify(draftGenere), draftSnapshot, "le draft fourni ne doit jamais être muté par le preview");
    assert.equal(
      JSON.stringify(STOCKS_OUVERTURE_DEFICIT),
      stocksSnapshot,
      "le stocksOuverture fourni ne doit jamais être muté par le preview",
    );
  });
});

/**
 * P0-1B (2026-09-07) — audit P0-1 : le mécanisme B (cette porte) ne compare
 * que 4 scalaires de FiscalEngineOutput (totalRecettes/totalCharges/
 * amortDeduct/amortReporte) + l'identité. Le patrimoine (068/072/164/166/
 * 172, tresorerie.provisionsAmortissements, compte exploitant, RAN...) vit
 * entièrement dans `rfs.patrimoine` (assemblePatrimoine()) et peut changer
 * SANS toucher aucun de ces scalaires — une correction patrimoniale seule
 * pouvait donc échapper à ce mécanisme si le mécanisme A (reducer) était
 * contourné ou incomplet. Chaque test ci-dessous vérifie explicitement en
 * précondition que les 4 scalaires restent identiques, pour prouver que la
 * détection vient bien de `patrimoineChanged()` et non d'un effet de bord.
 */
describe("P0-1B — patrimoine (rfs.patrimoine) comme défense indépendante du mécanisme B", () => {
  function bilanInputsDeBase(overrides: Partial<BilanInputs> = {}): BilanInputs {
    return {
      tresorerie: { bankMode: "INCONNU" },
      compteExploitant: {},
      ran: { situation: "NATIF" },
      ...overrides,
    };
  }

  function genererAvecPatrimoine(bilanPatrimonial: BilanInputs) {
    const draft = { ...generationReadyDraft(), bilanPatrimonial } as DeclarationDraft;
    const generation = runDeclarationGeneration(draft, 2025, undefined, bilanPatrimonial);
    assert.equal(generation.status, "generated", "précondition — le fixture doit être générable");
    if (generation.status !== "generated") throw new Error("unreachable");
    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
    return { draftGenere, generation };
  }

  /** Vérifie qu'une correction patrimoniale ne modifie aucun des 4 scalaires historiquement comparés — sinon le test ne prouverait rien de spécifique au patrimoine. */
  function assertScalairesInchanges(
    draftCorrige: DeclarationDraft,
    bilanCorrige: BilanInputs,
    reference: { fiscalResult: { totalRecettes: number; totalCharges: number; amortDeduct: number; amortReporte: number } },
  ) {
    const previewScalaires = runDeclarationGeneration(draftCorrige, 2025, undefined, bilanCorrige);
    assert.equal(previewScalaires.status, "generated");
    if (previewScalaires.status !== "generated") throw new Error("unreachable");
    assert.equal(previewScalaires.fiscalResult.totalRecettes, reference.fiscalResult.totalRecettes);
    assert.equal(previewScalaires.fiscalResult.totalCharges, reference.fiscalResult.totalCharges);
    assert.equal(previewScalaires.fiscalResult.amortDeduct, reference.fiscalResult.amortDeduct);
    assert.equal(previewScalaires.fiscalResult.amortReporte, reference.fiscalResult.amortReporte);
  }

  it("P0-1B-1 — correction 068/072 (créances : LOYER_DU_PAR_LOCATAIRE/AUTRE_CREANCE_ACTIVITE) → canGenerate === true", () => {
    const { draftGenere, generation } = genererAvecPatrimoine(
      bilanInputsDeBase({ ventilationTiers: { postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }] } }),
    );
    const bilanCorrige = bilanInputsDeBase({
      ventilationTiers: {
        postes: [
          { nature: "LOYER_DU_PAR_LOCATAIRE", montant: 800 },
          { nature: "AUTRE_CREANCE_ACTIVITE", montant: 200 },
        ],
      },
    });
    const draftCorrige = { ...draftGenere, bilanPatrimonial: bilanCorrige } as DeclarationDraft;
    assertScalairesInchanges(draftCorrige, bilanCorrige, generation);

    const gate = resolveDeclarationGenerationGate({
      draft: draftCorrige,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });
    assert.equal(gate.canGenerate, true, "une correction 068/072 doit être détectée même sans dérive des 4 scalaires");
  });

  it("P0-1B-2 — correction 164/166/172 (dettes : ACOMPTE_RECU_SUR_COMMANDE/FOURNISSEUR_NON_PAYE/DETTE_FISCALE_OU_SOCIALE) → canGenerate === true", () => {
    const { draftGenere, generation } = genererAvecPatrimoine(
      bilanInputsDeBase({ ventilationTiers: { postes: [{ nature: "FOURNISSEUR_NON_PAYE", montant: 300 }] } }),
    );
    const bilanCorrige = bilanInputsDeBase({
      ventilationTiers: {
        postes: [
          { nature: "FOURNISSEUR_NON_PAYE", montant: 300 },
          { nature: "DETTE_FISCALE_OU_SOCIALE", montant: 150 },
          { nature: "ACOMPTE_RECU_SUR_COMMANDE", montant: 90 },
        ],
      },
    });
    const draftCorrige = { ...draftGenere, bilanPatrimonial: bilanCorrige } as DeclarationDraft;
    assertScalairesInchanges(draftCorrige, bilanCorrige, generation);

    const gate = resolveDeclarationGenerationGate({
      draft: draftCorrige,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });
    assert.equal(gate.canGenerate, true, "une correction 164/166/172 doit être détectée même sans dérive des 4 scalaires");
  });

  it("P0-1B-3 — correction d'une composante amortissements/provisions patrimoniale (tresorerie.provisionsAmortissements, case 086) → canGenerate === true", () => {
    const { draftGenere, generation } = genererAvecPatrimoine(
      bilanInputsDeBase({ tresorerie: { bankMode: "INCONNU", provisionsAmortissements: { status: "DECLARE", montant: 400 } } }),
    );
    const bilanCorrige = bilanInputsDeBase({
      tresorerie: { bankMode: "INCONNU", provisionsAmortissements: { status: "DECLARE", montant: 650 } },
    });
    const draftCorrige = { ...draftGenere, bilanPatrimonial: bilanCorrige } as DeclarationDraft;
    assertScalairesInchanges(draftCorrige, bilanCorrige, generation);

    const gate = resolveDeclarationGenerationGate({
      draft: draftCorrige,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });
    assert.equal(gate.canGenerate, true, "une correction des provisions-amortissements patrimoniales (086) doit être détectée");
  });

  it("P0-1B-4 — correction du compte exploitant (apports) → canGenerate === true", () => {
    const { draftGenere, generation } = genererAvecPatrimoine(
      bilanInputsDeBase({ compteExploitant: { ouverture: 1000, apports: 0, prelevements: 0 } }),
    );
    const bilanCorrige = bilanInputsDeBase({ compteExploitant: { ouverture: 1000, apports: 500, prelevements: 0 } });
    const draftCorrige = { ...draftGenere, bilanPatrimonial: bilanCorrige } as DeclarationDraft;
    assertScalairesInchanges(draftCorrige, bilanCorrige, generation);

    const gate = resolveDeclarationGenerationGate({
      draft: draftCorrige,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });
    assert.equal(
      gate.canGenerate,
      true,
      "une correction du compte exploitant (apports, contributif à 120/compte exploitant) doit être détectée",
    );
  });

  it("P0-1B-5 — dossier généré, patrimoine strictement inchangé → canGenerate === false", () => {
    const bilan = bilanInputsDeBase({ ventilationTiers: { postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }] } });
    const { draftGenere } = genererAvecPatrimoine(bilan);

    const gate = resolveDeclarationGenerationGate({
      draft: draftGenere,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });
    assert.equal(gate.canGenerate, false, "aucune modification patrimoniale ne doit jamais réclamer de régénération");
  });

  it("P0-1B-6 — patrimoine inchangé, modification réellement non contributive (progression UI) → canGenerate reste false", () => {
    const bilan = bilanInputsDeBase({ ventilationTiers: { postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }] } });
    const { draftGenere } = genererAvecPatrimoine(bilan);
    // `completedSteps` est un marqueur de progression du parcours, jamais lu
    // par runDeclarationGeneration()/identiteFromDeclarationDraft() ni par la
    // liste des 8 clés contributives du reducer — ne doit produire aucune
    // dérive, patrimoniale ou non.
    const draftNonContributif = { ...draftGenere, completedSteps: [...draftGenere.completedSteps, "extra-marker"] } as DeclarationDraft;

    const gate = resolveDeclarationGenerationGate({
      draft: draftNonContributif,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });
    assert.equal(gate.canGenerate, false, "une donnée non contributive ne doit jamais déclencher de fausse dérive");
  });

  it("P0-1B-7 — continuité N+1 (stocksOuverture réel) + patrimoine inchangé → canGenerate reste false (P0-1A intact)", () => {
    const stocksOuverture = { deficits: [{ millesime: 2024, montant: 3000 }], amortissementsReportes: 0 };
    const bilan = bilanInputsDeBase({ ventilationTiers: { postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }] } });
    const draft = { ...generationReadyDraft(), bilanPatrimonial: bilan } as DeclarationDraft;
    const generation = runDeclarationGeneration(draft, 2025, stocksOuverture, bilan);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;

    const gate = resolveDeclarationGenerationGate({
      draft: draftGenere,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
      stocksOuverture,
    });
    assert.equal(
      gate.canGenerate,
      false,
      "la combinaison stocksOuverture (P0-1A) + patrimoine (P0-1B) ne doit jamais produire de fausse dérive quand rien n'a changé",
    );
  });

  it("P0-1B-9 — non-mutation : le preview ne mute ni draft, ni patrimoine, ni historique de versions", () => {
    const bilan = bilanInputsDeBase({ ventilationTiers: { postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }] } });
    const { draftGenere } = genererAvecPatrimoine(bilan);
    const draftAvecHistorique = {
      ...draftGenere,
      declarationVersions: [{ id: "v1", createdAt: "2026-01-01T00:00:00.000Z", fiscalResult: draftGenere.fiscalResult }],
    } as DeclarationDraft;
    const draftSnapshot = JSON.stringify(draftAvecHistorique);
    const bilanSnapshot = JSON.stringify(bilan);

    resolveDeclarationGenerationGate({
      draft: draftAvecHistorique,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(
      JSON.stringify(draftAvecHistorique),
      draftSnapshot,
      "le draft fourni (fiscalResult/rfs/patrimoine/declarationVersions) ne doit jamais être muté par le preview",
    );
    assert.equal(JSON.stringify(bilan), bilanSnapshot, "le bilanPatrimonial fourni ne doit jamais être muté par le preview");
  });
});

// ---------------------------------------------------------------------------
// Lot 1 / F1 — preuve de fraîcheur = projection sémantique complète de
// FiscalEngineOutput (pas les 4 scalaires historiques seuls).
// ---------------------------------------------------------------------------
describe("Lot 1 / F1 — fraîcheur fiscale sémantique (totalPreExploitation et voisinage)", () => {
  function apresGeneration(draft: DeclarationDraft): DeclarationDraft {
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    return { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
  }

  it("F1 blocker — totalPreExploitation modifié après génération → stale (les 4 scalaires historiques resteraient égaux)", () => {
    const draft = apresGeneration(
      generationReadyDraft({
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      } as DeclarationDraft),
    );
    assert.equal(draft.fiscalResult!.resultatFiscal, 5500);
    assert.equal(draft.fiscalResult!.chargesPreExploitation ?? 0, 0);

    const reouvertF012 = {
      ...draft,
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 2500 },
    } as DeclarationDraft;
    const recomputed = runDeclarationGeneration(reouvertF012, 2025);
    assert.equal(recomputed.status, "generated");
    if (recomputed.status !== "generated") throw new Error("unreachable");
    assert.equal(recomputed.fiscalResult.resultatFiscal, 3000, "précondition métier : résultat fiscal a vraiment changé");

    // Preuve que l'ANCIENNE frontière (4 scalaires) aurait autorisé un faux-current :
    assert.equal(draft.fiscalResult!.totalRecettes, recomputed.fiscalResult.totalRecettes);
    assert.equal(draft.fiscalResult!.totalCharges, recomputed.fiscalResult.totalCharges);
    assert.equal(draft.fiscalResult!.amortDeduct, recomputed.fiscalResult.amortDeduct);
    assert.equal(draft.fiscalResult!.amortReporte, recomputed.fiscalResult.amortReporte);

    const gate = resolveDeclarationGenerationGate({
      draft: reouvertF012,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });
    assert.equal(gate.referenceGenerationStatus, "stale");
    assert.equal(gate.canGenerate, true);
  });

  it("A — seul computedAt / trace différent → current (pas de faux stale technique)", () => {
    const draft = apresGeneration(generationReadyDraft());
    const technique = {
      ...draft,
      fiscalResult: {
        ...draft.fiscalResult!,
        computedAt: "2099-12-31T23:59:59.000Z",
        trace: {
          ...draft.fiscalResult!.trace,
          computedAt: "2099-12-31T23:59:59.000Z",
          journal: [...draft.fiscalResult!.trace.journal, { trf: "TECH", label: "noop", value: 0 }],
        },
      },
    } as DeclarationDraft;
    const gate = resolveDeclarationGenerationGate({
      draft: technique,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });
    assert.equal(gate.referenceGenerationStatus, "current");
  });

  it("B — resultatFiscal réellement différent (patch direct du miroir stocké) → stale", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = {
      ...draft,
      fiscalResult: { ...draft.fiscalResult!, resultatFiscal: draft.fiscalResult!.resultatFiscal - 2500 },
    } as DeclarationDraft;
    const gate = resolveDeclarationGenerationGate({
      draft: corrige,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });
    assert.equal(gate.referenceGenerationStatus, "stale");
  });

  it("C — resultatAvantAmort / chargesPreExploitation divergents → stale", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrigeAvantAmort = {
      ...draft,
      fiscalResult: {
        ...draft.fiscalResult!,
        resultatAvantAmort: draft.fiscalResult!.resultatAvantAmort - 1000,
        // garder resultatFiscal volontairement égal pour isoler la frontière
        resultatFiscal: draft.fiscalResult!.resultatFiscal,
      },
    } as DeclarationDraft;
    assert.equal(
      resolveDeclarationGenerationGate({
        draft: corrigeAvantAmort,
        properties: [PROPERTY],
        fiscalYear: 2025,
        paid: true,
        generated: true,
      }).referenceGenerationStatus,
      "stale",
    );

    const corrigePreEx = {
      ...draft,
      fiscalResult: {
        ...draft.fiscalResult!,
        chargesPreExploitation: (draft.fiscalResult!.chargesPreExploitation ?? 0) + 500,
        resultatFiscal: draft.fiscalResult!.resultatFiscal,
        resultatAvantAmort: draft.fiscalResult!.resultatAvantAmort,
      },
    } as DeclarationDraft;
    assert.equal(
      resolveDeclarationGenerationGate({
        draft: corrigePreEx,
        properties: [PROPERTY],
        fiscalYear: 2025,
        paid: true,
        generated: true,
      }).referenceGenerationStatus,
      "stale",
    );
  });
});
