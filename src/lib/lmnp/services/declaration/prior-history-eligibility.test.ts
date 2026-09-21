/**
 * P0 launch safety — antériorité LMNP au réel non reprise.
 *
 * Prouve qu'un exercice qui n'est pas une première année réelle et qui n'a pas
 * de source d'ouverture Fiscal AI valide ne peut jamais atteindre le paiement
 * ni la génération (F-006 retomberait sinon sur des stocks `[]` / `0`).
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/prior-history-eligibility.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolvePriorHistoryEligibility } from "./prior-history-eligibility";
import { resolveDeclarationGenerationGate } from "./declaration-generation-gate";
import { runDeclarationGeneration } from "./run-declaration-generation";
import { canOfferPaymentWithoutCerfa, resolveDossierReadyForPaymentWithoutCerfa } from "./payment-readiness";
import {
  applyStocksOuvertureResult,
  canCloseFiscalYear,
  createNextFiscalYear,
  resolveStocksOuverture,
} from "../dossier/fiscal-year-cycle";
import type { DeclarationDraft, FiscalYear, Property } from "../../types";

const NOW = "2026-09-04T00:00:00.000Z";

const VALID_OPENING = {
  sourceClosureId: "closure-1",
  stocks: { deficits: [{ millesime: 2024, montant: 1200 }], amortissementsReportes: 500 },
};

// -- Résolveur pur -----------------------------------------------------------

describe("resolvePriorHistoryEligibility — première année réelle", () => {
  it("1 — aucun prédécesseur + réponse « première déclaration au réel » → éligible, déclarée (jamais présentée comme prouvée)", () => {
    const result = resolvePriorHistoryEligibility({
      priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    });
    assert.deepEqual(result, { eligible: true, status: "FIRST_REAL_YEAR", basis: "declared_by_client" });
  });

  it("2 — aucun prédécesseur, aucune réponse → BLOQUÉ (la situation n'est pas prouvée par les données), la question est requise", () => {
    const result = resolvePriorHistoryEligibility({});
    assert.equal(result.eligible, false);
    assert.equal(result.eligible === false && result.reason, "ANSWER_REQUIRED");
    assert.equal(result.eligible === false && result.needsAnswer, true);
  });

  it("2b — previousFiscalYearId null ou vide = aucun prédécesseur (jamais une continuité)", () => {
    for (const previousFiscalYearId of [null, "", undefined]) {
      const result = resolvePriorHistoryEligibility({ previousFiscalYearId });
      assert.equal(result.eligible, false);
      assert.equal(result.eligible === false && result.reason, "ANSWER_REQUIRED");
    }
  });

  it("2c — une réponse corrompue/inconnue est traitée comme absente → bloqué", () => {
    const result = resolvePriorHistoryEligibility({
      priorHistoryDeclaration: { status: "N_IMPORTE_QUOI" as never, declaredAt: NOW },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.eligible === false && result.reason, "ANSWER_REQUIRED");
  });
});

describe("resolvePriorHistoryEligibility — historique externe", () => {
  it("3 — comptabilité réelle externe déclarée → BLOQUÉ", () => {
    const result = resolvePriorHistoryEligibility({
      priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.status, "EXTERNAL_HISTORY");
    assert.equal(result.eligible === false && result.reason, "EXTERNAL_HISTORY_DECLARED");
  });

  it("3b — l'historique externe déclaré bloque même face à une continuité Fiscal AI valide (fail-closed, aucun arbitrage silencieux)", () => {
    const result = resolvePriorHistoryEligibility({
      previousFiscalYearId: "fy-0",
      stocksOuverture: VALID_OPENING,
      priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.eligible === false && result.reason, "EXTERNAL_HISTORY_DECLARED");
  });
});

describe("resolvePriorHistoryEligibility — continuité native", () => {
  it("4 — prédécesseur + stocks d'ouverture réellement persistés → éligible SANS question, prouvée par les données", () => {
    const result = resolvePriorHistoryEligibility({
      previousFiscalYearId: "fy-0",
      stocksOuverture: VALID_OPENING,
    });
    assert.deepEqual(result, { eligible: true, status: "NATIVE_CONTINUITY", basis: "proven_by_data" });
  });

  it("4b — une réponse « première année » ne change rien quand la continuité native est prouvée", () => {
    const result = resolvePriorHistoryEligibility({
      previousFiscalYearId: "fy-0",
      stocksOuverture: VALID_OPENING,
      priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    });
    assert.equal(result.eligible, true);
    assert.equal(result.eligible && result.status, "NATIVE_CONTINUITY");
  });

  it("5 — « déjà réalisé avec Fiscal AI » SANS continuité réelle → toujours BLOQUÉ (la réponse seule ne prouve rien)", () => {
    const result = resolvePriorHistoryEligibility({
      priorHistoryDeclaration: { status: "FISCAL_AI_PREVIOUS", declaredAt: NOW },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.eligible === false && result.reason, "FISCAL_AI_CLAIM_WITHOUT_CONTINUITY");
  });

  it("5b — « déjà réalisé avec Fiscal AI » avec un prédécesseur mais sans stocks d'ouverture → BLOQUÉ", () => {
    const result = resolvePriorHistoryEligibility({
      previousFiscalYearId: "fy-0",
      priorHistoryDeclaration: { status: "FISCAL_AI_PREVIOUS", declaredAt: NOW },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.eligible === false && result.reason, "NATIVE_CONTINUITY_MISSING");
  });

  it("7 — prédécesseur sans stocks d'ouverture → BLOQUÉ quelle que soit la réponse (aucun `[]`/`0` par défaut ne peut autoriser), raison conservée", () => {
    for (const status of ["FIRST_REAL_YEAR", "FISCAL_AI_PREVIOUS"] as const) {
      const result = resolvePriorHistoryEligibility({
        previousFiscalYearId: "fy-0",
        stocksOuvertureUnavailableReason: "L'exercice précédent n'est pas clôturé.",
        priorHistoryDeclaration: { status, declaredAt: NOW },
      });
      assert.equal(result.eligible, false, status);
      assert.equal(result.eligible === false && result.reason, "NATIVE_CONTINUITY_MISSING");
      assert.equal(result.eligible === false && result.needsAnswer, false, "aucune réponse ne peut réparer une continuité absente");
      assert.equal(result.eligible === false && result.detail, "L'exercice précédent n'est pas clôturé.");
    }
  });

  it("7b — stocks d'ouverture malformés (sourceClosureId vide, déficits non tableau, montant non fini) → BLOQUÉ", () => {
    const malformed = [
      { sourceClosureId: "", stocks: VALID_OPENING.stocks },
      { sourceClosureId: "c", stocks: { deficits: "x", amortissementsReportes: 0 } },
      { sourceClosureId: "c", stocks: { deficits: [], amortissementsReportes: Number.NaN } },
      { sourceClosureId: "c", stocks: undefined },
      // Stocks corrompus (stockage altéré) : jamais une continuité valide.
      { sourceClosureId: "c", stocks: { deficits: [null], amortissementsReportes: 0 } },
      { sourceClosureId: "c", stocks: { deficits: [{ millesime: 2024, montant: -10 }], amortissementsReportes: 0 } },
      { sourceClosureId: "c", stocks: { deficits: [{ millesime: Number.NaN, montant: 10 }], amortissementsReportes: 0 } },
      { sourceClosureId: "c", stocks: { deficits: [], amortissementsReportes: -5 } },
    ];
    for (const stocksOuverture of malformed) {
      const result = resolvePriorHistoryEligibility({
        previousFiscalYearId: "fy-0",
        stocksOuverture: stocksOuverture as never,
      });
      assert.equal(result.eligible, false, JSON.stringify(stocksOuverture));
    }
  });

  it("6 — changer la réponse recalcule l'éligibilité (première année → externe → première année)", () => {
    const base = { previousFiscalYearId: undefined as string | undefined };
    const first = resolvePriorHistoryEligibility({
      ...base,
      priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    });
    const external = resolvePriorHistoryEligibility({
      ...base,
      priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW },
    });
    const backToFirst = resolvePriorHistoryEligibility({
      ...base,
      priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    });
    assert.equal(first.eligible, true);
    assert.equal(external.eligible, false);
    assert.equal(backToFirst.eligible, true);
  });
});

// -- Porte de génération -----------------------------------------------------

const PROPERTY: Property = { id: "prop-1", label: "Studio Lyon", address: "1 rue Test", city: "Lyon", postalCode: "69001" };

function generableDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    inpiConfirmedAt: NOW,
    logementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW,
      prixRevient: 200000,
      valeurTerrain: 40000,
      valeurBati: 160000,
      baseAmortissableBati: 160000,
      montantMobilier: 0,
      dotationAnnuelle: 5333,
      dureeMoyenneAnnees: 30,
      plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 },
    } as DeclarationDraft["logementAmortissement"],
    creditDeclaredNoneAt: NOW,
    revenusConfirmedAt: NOW,
    chargesConfirmedAt: NOW,
    amortissementConfirmedAt: NOW,
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    ...overrides,
  } as DeclarationDraft;
}

function gateWith(
  priorHistory: ReturnType<typeof resolvePriorHistoryEligibility> | undefined,
  opts: { draft?: DeclarationDraft; paid?: boolean; generated?: boolean } = {},
) {
  return resolveDeclarationGenerationGate({
    draft: opts.draft ?? generableDraft(),
    properties: [PROPERTY],
    fiscalYear: 2025,
    paid: opts.paid ?? false,
    generated: opts.generated ?? false,
    priorHistory,
  });
}

describe("porte de génération — l'éligibilité d'antériorité ferme paiement et génération", () => {
  it("contrôle — dossier générable, sans éligibilité fournie → comportement historique (paiement ouvert)", () => {
    const gate = gateWith(undefined);
    assert.equal(gate.canCheckout, true);
    assert.equal(gate.canGenerate, true);
  });

  it("1 — première année déclarée → même résultat que le contrôle (aucun client légitime n'est pénalisé)", () => {
    const gate = gateWith(
      resolvePriorHistoryEligibility({ priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW } }),
    );
    assert.equal(gate.canCheckout, true);
    assert.equal(gate.canGenerate, true);
    assert.ok(gate.fiscalResult);
  });

  it("4 — continuité native prouvée → éligible sans question, dossier générable inchangé", () => {
    const gate = gateWith(
      resolvePriorHistoryEligibility({ previousFiscalYearId: "fy-0", stocksOuverture: VALID_OPENING }),
    );
    assert.equal(gate.canCheckout, true);
    assert.equal(gate.canGenerate, true);
  });

  it("2 — historique inconnu → ni paiement, ni génération, ni régénération après paiement, même si le dossier est fiscalement complet", () => {
    for (const paid of [false, true]) {
      const gate = gateWith(resolvePriorHistoryEligibility({}), { paid });
      assert.equal(gate.canCheckout, false, `paid=${paid}`);
      assert.equal(gate.canRetryAfterPayment, false, `paid=${paid}`);
      assert.equal(gate.canGenerate, false, `paid=${paid}`);
      assert.equal(gate.priorHistory?.eligible, false);
    }
  });

  it("3 — historique externe déclaré → ni paiement ni génération", () => {
    const gate = gateWith(
      resolvePriorHistoryEligibility({ priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW } }),
    );
    assert.equal(gate.canCheckout, false);
    assert.equal(gate.canGenerate, false);
    assert.equal(gate.canRetryAfterPayment, false);
  });

  it("changement de réponse après une génération déjà produite → toute régénération est fermée", () => {
    const draft = generableDraft();
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    const generatedDraft = { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;

    const stillEligible = gateWith(
      resolvePriorHistoryEligibility({ priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW } }),
      { draft: generatedDraft, paid: true, generated: true },
    );
    assert.equal(stillEligible.canGenerate, false, "aucune dérive, aucune régénération nécessaire");

    const flipped = gateWith(
      resolvePriorHistoryEligibility({ priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW } }),
      { draft: generatedDraft, paid: true, generated: true },
    );
    assert.equal(flipped.priorHistory?.eligible, false, "l'éligibilité est recalculée, jamais mémorisée");
    assert.equal(flipped.canRetryAfterPayment, false);
    assert.equal(flipped.canCheckout, false);
  });
});

describe("7 — cause racine : un exercice non-première-année sans stocks d'ouverture ne devient jamais un « zéro » légitime", () => {
  it("documente le défaut : sans stocks, F-006 génère avec [] / 0 sans aucun signal…", () => {
    const generation = runDeclarationGeneration(generableDraft(), 2025, undefined);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    assert.deepEqual(generation.fiscalResult.stocks.deficits, []);
    assert.equal(generation.fiscalResult.amortReporte, 0);
  });

  it("…mais l'exercice qui a un prédécesseur et aucun stock valide est désormais BLOQUÉ à la porte (paiement et génération)", () => {
    const fiscalYearFacts = {
      previousFiscalYearId: "fy-0",
      stocksOuverture: undefined,
      stocksOuvertureUnavailableReason: "Aucune closure exploitable sur l'exercice précédent.",
    };
    const gate = gateWith(resolvePriorHistoryEligibility(fiscalYearFacts));
    assert.equal(gate.canCheckout, false);
    assert.equal(gate.canGenerate, false);
    assert.equal(gate.priorHistory?.eligible === false && gate.priorHistory.detail, "Aucune closure exploitable sur l'exercice précédent.");
  });
});

// -- Paiement sans génération (SIREN/SIRET manquant) --------------------------

describe("paiement « sans génération » — même fermeture", () => {
  const draftWithoutSiret = () => generableDraft({ siret: undefined, siren: undefined });

  it("contrôle — éligible : le paiement sans génération reste proposé quand seul le SIREN manque", () => {
    const gate = gateWith(
      resolvePriorHistoryEligibility({ priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW } }),
      { draft: draftWithoutSiret() },
    );
    assert.equal(resolveDossierReadyForPaymentWithoutCerfa(gate), true);
    assert.equal(canOfferPaymentWithoutCerfa({ gate, paid: false, phaseIsIdle: true }), true);
  });

  it("historique non établi → le paiement sans génération est fermé", () => {
    const gate = gateWith(resolvePriorHistoryEligibility({}), { draft: draftWithoutSiret() });
    assert.equal(resolveDossierReadyForPaymentWithoutCerfa(gate), false);
    assert.equal(canOfferPaymentWithoutCerfa({ gate, paid: false, phaseIsIdle: true }), false);
  });

  it("historique externe → le paiement sans génération est fermé", () => {
    const gate = gateWith(
      resolvePriorHistoryEligibility({ priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW } }),
      { draft: draftWithoutSiret() },
    );
    assert.equal(canOfferPaymentWithoutCerfa({ gate, paid: false, phaseIsIdle: true }), false);
  });
});

// -- Clôture -----------------------------------------------------------------

describe("clôture — un exercice dont l'antériorité n'est pas établie ne se clôture pas (pas de blanchiment en « continuité native »)", () => {
  function closable(overrides: Partial<FiscalYear> = {}): FiscalYear {
    return {
      id: "fy-1",
      year: 2025,
      status: "ready_to_close",
      regime: "reel",
      propertyIds: ["prop-1"],
      declarationGeneratedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  // Lot 1 — clôture positive : l'antériorité n'est testable indépendamment
  // que si une génération de référence valide et fraîche est déjà présente.
  const draftBase = generableDraft();
  const generation = runDeclarationGeneration(draftBase, 2025);
  assert.equal(generation.status, "generated");
  if (generation.status !== "generated") throw new Error("unreachable");
  const freshDraft = {
    ...draftBase,
    fiscalResult: generation.fiscalResult,
    rfs: generation.rfs,
  } as DeclarationDraft;

  const close = (fiscalYear: FiscalYear) =>
    canCloseFiscalYear({
      fiscalYear,
      declarationDraft: freshDraft,
      properties: [PROPERTY],
    });

  it("première année déclarée → clôture autorisée", () => {
    assert.equal(close(closable({ priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW } })).ok, true);
  });

  it("continuité native prouvée → clôture autorisée", () => {
    const stocksOuverture = VALID_OPENING;
    const draftContinuity = generableDraft({
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 8000, status: "validated" },
    });
    const gen = runDeclarationGeneration(draftContinuity, 2025, stocksOuverture.stocks);
    assert.equal(gen.status, "generated");
    if (gen.status !== "generated") throw new Error("unreachable");
    const result = canCloseFiscalYear({
      fiscalYear: closable({ previousFiscalYearId: "fy-0", stocksOuverture }),
      declarationDraft: { ...draftContinuity, fiscalResult: gen.fiscalResult, rfs: gen.rfs } as DeclarationDraft,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, true);
  });

  it("aucune réponse / externe / prédécesseur sans stocks → clôture refusée", () => {
    assert.equal(close(closable()).ok, false);
    assert.equal(close(closable({ priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW } })).ok, false);
    assert.equal(close(closable({ previousFiscalYearId: "fy-0" })).ok, false);
  });
});

// -- Raison d'indisponibilité préservée, aucune valeur fabriquée ----------------

describe("raison d'indisponibilité des stocks d'ouverture — conservée, jamais remplacée par un zéro", () => {
  const nextYear = (): FiscalYear =>
    createNextFiscalYear(
      { id: "fy-0", year: 2025, status: "closed", regime: "reel", propertyIds: ["p"], dossierId: "d", createdAt: NOW, updatedAt: NOW },
      "d",
      NOW,
    );

  it("unavailable → la raison est persistée sur N+1, aucun objet stocksOuverture n'est fabriqué", () => {
    const applied = applyStocksOuvertureResult(nextYear(), { status: "unavailable", reason: "Aucune closure exploitable sur l'exercice précédent." });
    assert.equal(applied.stocksOuvertureUnavailableReason, "Aucune closure exploitable sur l'exercice précédent.");
    assert.equal(applied.stocksOuverture, undefined);
    const eligibility = resolvePriorHistoryEligibility(applied);
    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.eligible === false && eligibility.detail, "Aucune closure exploitable sur l'exercice précédent.");
  });

  it("available → stocksOuverture persistés (comportement inchangé), aucune raison, éligible sans question", () => {
    const applied = applyStocksOuvertureResult(nextYear(), {
      status: "available",
      sourceClosureId: "closure-9",
      stocks: VALID_OPENING.stocks,
    });
    assert.deepEqual(applied.stocksOuverture, { sourceClosureId: "closure-9", stocks: VALID_OPENING.stocks });
    assert.equal(applied.stocksOuvertureUnavailableReason, undefined);
    assert.equal(resolvePriorHistoryEligibility(applied).eligible, true);
  });

  it("resolveStocksOuverture réel : un précédent non clos → unavailable → N+1 bloqué", () => {
    const previous: FiscalYear = { id: "fy-0", year: 2025, status: "ready_to_close", regime: "reel", propertyIds: ["p"], dossierId: "d", createdAt: NOW, updatedAt: NOW };
    const current = createNextFiscalYear(previous, "d", NOW);
    const applied = applyStocksOuvertureResult(current, resolveStocksOuverture(current, previous));
    assert.equal(applied.stocksOuvertureUnavailableReason, "L'exercice précédent n'est pas clôturé.");
    assert.equal(resolvePriorHistoryEligibility(applied).eligible, false);
  });
});

describe("la réponse est propre à l'exercice — jamais reportée automatiquement sur N+1", () => {
  it("N+1 créé depuis un N déclaré « première année » ne porte aucune réponse et n'hérite d'aucune éligibilité", () => {
    const n: FiscalYear = {
      id: "fy-0",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["p"],
      dossierId: "d",
      createdAt: NOW,
      updatedAt: NOW,
      priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    };
    const next = createNextFiscalYear(n, "d", NOW);
    assert.equal(next.priorHistoryDeclaration, undefined);
    assert.equal(resolvePriorHistoryEligibility(next).eligible, false, "sans stocks d'ouverture, N+1 est bloqué, pas éligible par héritage");
  });
});
