/**
 * P1 — découplage paiement / génération Cerfa (SIREN/SIRET manquant).
 * Run: npx tsx --test src/lib/lmnp/services/declaration/payment-readiness.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDeclarationGenerationGate } from "./declaration-generation-gate";
import {
  canOfferPaymentWithoutCerfa,
  isBlockingAnomaliesInpiOnly,
  resolveDossierReadyForPaymentWithoutCerfa,
} from "./payment-readiness";
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

/** Dossier complet hormis SIREN/SIRET : dates connues (inpiConfirmedAt donc
 * déjà vrai), identité et calcul fiscal complets, seul le SIREN manque. */
function draftReadyExceptSiren(): DeclarationDraft {
  return completeFlags({
    dateMiseEnService: "2020-01-01",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
  } as DeclarationDraft);
}

function gateFor(draft: DeclarationDraft, paid = false) {
  return resolveDeclarationGenerationGate({
    draft,
    properties: [PROPERTY],
    fiscalYear: 2025,
    paid,
    generated: false,
  });
}

describe("P1 — resolveDossierReadyForPaymentWithoutCerfa", () => {
  it("Scénario A — SIREN/SIRET absents, reste du dossier complet → prêt pour paiement", () => {
    const gate = gateFor(draftReadyExceptSiren());

    assert.equal(gate.canGenerate, false, "précondition : le Cerfa n'est pas générable (SIREN manquant)");
    assert.ok(
      gate.blockingAnomalies.some((a) => a.field === "identite.siret"),
      "précondition : le gate bloque bien sur identite.siret, inchangé",
    );
    assert.equal(resolveDossierReadyForPaymentWithoutCerfa(gate), true);
  });

  it("Scénario B — anomalie fiscale réelle en plus du SIREN manquant → reste bloqué", () => {
    const gate = gateFor(
      completeFlags({
        // dateMiseEnService absente : anomalie fiscale réelle (F-006),
        // indépendante du SIREN — ne doit jamais être masquée.
        exploitantFirstName: "Marie",
        exploitantLastName: "Dupont",
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 0, totalPreExploitation: 0 },
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 0, status: "validated" },
      } as DeclarationDraft),
    );

    assert.ok(
      gate.blockingAnomalies.some((a) => a.field === "dateMiseEnService"),
      "précondition : une vraie anomalie fiscale est bien présente",
    );
    assert.equal(
      resolveDossierReadyForPaymentWithoutCerfa(gate),
      false,
      "une anomalie non liée au SIREN doit continuer à bloquer le paiement",
    );
  });

  it("dossier déjà entièrement prêt (SIREN présent) → également considéré prêt pour paiement", () => {
    const gate = gateFor(
      completeFlags({
        siret: "12345678901234",
        siren: "123456789",
        exploitantFirstName: "Marie",
        exploitantLastName: "Dupont",
        dateMiseEnService: "2020-01-01",
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
      } as DeclarationDraft),
    );

    assert.equal(gate.canGenerate, true);
    assert.equal(resolveDossierReadyForPaymentWithoutCerfa(gate), true);
  });

  it("dossier multi-bien → jamais prêt pour paiement, même sans anomalie", () => {
    const gate = resolveDeclarationGenerationGate({
      draft: draftReadyExceptSiren(),
      properties: [PROPERTY, { ...PROPERTY, id: "prop-2" }],
      fiscalYear: 2025,
      paid: false,
      generated: false,
    });

    assert.equal(gate.snapshot.isMultiProperty, true);
    assert.equal(resolveDossierReadyForPaymentWithoutCerfa(gate), false);
  });
});

describe("P1 — canOfferPaymentWithoutCerfa (garde d'affichage)", () => {
  it("Scénario C — dossier déjà payé → jamais réoffrir le paiement, même prêt hors INPI", () => {
    const gate = gateFor(draftReadyExceptSiren(), true);

    assert.equal(
      canOfferPaymentWithoutCerfa({ gate, paid: true, phaseIsIdle: true }),
      false,
      "aucun second paiement",
    );
  });

  it("prêt hors INPI, pas encore payé, phase idle → paiement proposé", () => {
    const gate = gateFor(draftReadyExceptSiren());

    assert.equal(canOfferPaymentWithoutCerfa({ gate, paid: false, phaseIsIdle: true }), true);
  });

  it("prêt hors INPI mais phase déjà en cours (checkout/generating) → pas de second déclenchement", () => {
    const gate = gateFor(draftReadyExceptSiren());

    assert.equal(canOfferPaymentWithoutCerfa({ gate, paid: false, phaseIsIdle: false }), false);
  });
});

describe("P1 — isBlockingAnomaliesInpiOnly (bloc rouge Validation)", () => {
  it("Test 7 — blocage exclusivement SIREN/SIRET → true (bloc rouge doit devenir informatif, pas une erreur)", () => {
    const gate = gateFor(draftReadyExceptSiren());

    assert.ok(gate.blockingAnomalies.some((a) => a.field === "identite.siret"), "précondition");
    assert.equal(isBlockingAnomaliesInpiOnly(gate), true);
  });

  it("Test 6 — vraie anomalie fiscale (dateMiseEnService absente) → false, reste une erreur bloquante rouge", () => {
    const gate = gateFor(
      completeFlags({
        exploitantFirstName: "Marie",
        exploitantLastName: "Dupont",
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 0, totalPreExploitation: 0 },
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 0, status: "validated" },
      } as DeclarationDraft),
    );

    assert.ok(gate.blockingAnomalies.some((a) => a.field === "dateMiseEnService"), "précondition");
    assert.equal(
      isBlockingAnomaliesInpiOnly(gate),
      false,
      "une vraie anomalie fiscale ne doit jamais être présentée comme un simple manque INPI",
    );
  });

  it("aucune anomalie bloquante (dossier complet, SIREN présent) → false (rien à afficher, ni rouge ni orange)", () => {
    const gate = gateFor(
      completeFlags({
        siret: "12345678901234",
        siren: "123456789",
        exploitantFirstName: "Marie",
        exploitantLastName: "Dupont",
        dateMiseEnService: "2020-01-01",
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
      } as DeclarationDraft),
    );

    assert.equal(gate.blockingAnomalies.length, 0, "précondition");
    assert.equal(isBlockingAnomaliesInpiOnly(gate), false);
  });
});
