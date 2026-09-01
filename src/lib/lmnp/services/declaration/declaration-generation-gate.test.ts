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

const PROPERTY: Property = {
  id: "prop-1",
  label: "Studio Lyon",
  address: "1 rue Test",
  city: "Lyon",
  postalCode: "69001",
};

function completeFlags(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    inpiConfirmedAt: "2026-01-01T00:00:00.000Z",
    logementConfirmedAt: "2026-01-01T00:00:00.000Z",
    creditDeclaredNoneAt: "2026-01-01T00:00:00.000Z",
    revenusConfirmedAt: "2026-01-01T00:00:00.000Z",
    chargesConfirmedAt: "2026-01-01T00:00:00.000Z",
    amortissementConfirmedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
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
    const gate = resolveDeclarationGenerationGate({
      draft: {
        ...generationReadyDraft(),
        // Valeurs F-006 réellement produites par generationReadyDraft() (9000 - 2000
        // de charges, 1500 d'amortissement intégralement déductible, rien reporté).
        fiscalResult: { totalRecettes: 9000, totalCharges: 2000, amortDeduct: 1500, amortReporte: 0 },
      } as DeclarationDraft,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canCheckout, false);
    assert.equal(gate.canRetryAfterPayment, false);
    assert.equal(gate.canGenerate, false);
  });

  it("Cycle 23 — déclaration déjà générée mais recettes corrigées → régénération sans re-paiement", () => {
    const gate = resolveDeclarationGenerationGate({
      draft: {
        ...generationReadyDraft(),
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 4780.9 },
        fiscalResult: { totalRecettes: 9561.8 },
      } as DeclarationDraft,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canCheckout, false, "pas de second paiement");
    assert.equal(gate.canRetryAfterPayment, true);
    assert.equal(gate.canGenerate, true, "la 2031-SD ne doit pas rester figée sur l'ancien total");
  });

  it("déclaration déjà générée mais charges corrigées (recettes inchangées) → régénération sans re-paiement", () => {
    const gate = resolveDeclarationGenerationGate({
      draft: {
        ...generationReadyDraft(),
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 6000, totalPreExploitation: 0 },
        fiscalResult: { totalRecettes: 9000, totalCharges: 2000, amortDeduct: 1500, amortReporte: 0 },
      } as DeclarationDraft,
      properties: [PROPERTY],
      fiscalYear: 2025,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canCheckout, false, "pas de second paiement");
    assert.equal(gate.canRetryAfterPayment, true, "la dérive des charges doit être détectée, pas seulement les recettes");
    assert.equal(gate.canGenerate, true);
  });

  it("déclaration déjà générée mais amortissement corrigé (recettes inchangées) → régénération sans re-paiement", () => {
    const gate = resolveDeclarationGenerationGate({
      draft: {
        ...generationReadyDraft(),
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 4200, status: "validated" },
        fiscalResult: { totalRecettes: 9000, totalCharges: 2000, amortDeduct: 1500, amortReporte: 0 },
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
    const draft = completeFlags({
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Elsa",
      exploitantLastName: "Bouvard",
      dateMiseEnService: "2025-02-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 5100 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 14962, totalPreExploitation: 0 },
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

  it("déficits antérieurs — imputés avant l'amortissement de l'exercice, résultat fiscal net de l'imputation", () => {
    const draft = {
      ...generationReadyDraft(),
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 7000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1000, status: "validated" },
      // Stock antérieur lu par run-declaration-generation.ts depuis draft.fiscalResult.stocks.deficits.
      fiscalResult: { stocks: { deficits: [{ millesime: 2023, montant: 2000 }] } },
    } as unknown as DeclarationDraft;

    const fiscalResult = assertSameFiscalResult(draft, 2025);
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
