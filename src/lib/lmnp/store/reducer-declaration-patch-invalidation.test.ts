import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  AmortissementAssistantOutput,
  FinancementChargesOutput,
  FiscalYear,
  LogementAmortissementOutput,
  Property,
  RevenusAssistantOutput,
} from "../types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import type { BilanInputs, VentilationTiersInputs } from "@/runtime/capabilities/bilan/types";
import {
  buildVentilationTiersInputs,
  deriveVentilationTiersIntakeState,
  EMPTY_VENTILATION_TIERS_INTAKE_STATE,
} from "../services/declaration/ventilation-tiers-intake";

/**
 * P2-2 — reducer.ts importe transitivement src/lib/supabase.ts (client créé
 * au chargement du module) : import dynamique après avoir posé des valeurs
 * factices, même pattern que reducer-declaration-invalidation.test.ts (P2-1.1).
 */
async function loadReducer() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const mod = await import("./reducer");
  return mod.lmnpReducer;
}

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-1",
    year: 2026,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function baseProperty(): Property {
  return { id: "prop-1", label: "", address: "", city: "", postalCode: "" };
}

type ReducerState = Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

function baseState(
  declarationDraft: ReducerState["declarationDraft"],
  fiscalYear: FiscalYear = baseFiscalYear(),
): ReducerState {
  return {
    fiscalYear,
    properties: [baseProperty()],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft,
    fileRegistry: new Map(),
  } as unknown as ReducerState;
}

const GENERATED_AT = "2026-06-01T10:00:00Z";
const PAID_AT = "2026-06-01T09:00:00Z";

function financementFixture(overrides: Partial<FinancementChargesOutput> = {}): FinancementChargesOutput {
  return {
    exerciceFiscal: 2026,
    totalInteretsEmprunt: 1000,
    totalInteretsPreExploitation: 0,
    totalCapitalRembourse: 2000,
    totalChargesFinancementExercice: 1000,
    prets: [],
    fieldSources: {},
    computedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function revenusFixture(overrides: Partial<RevenusAssistantOutput> = {}): RevenusAssistantOutput {
  return {
    exerciceFiscal: 2026,
    totalRecettes: 12000,
    loyersEncaisses: 12000,
    indemnitesAssurance: 0,
    recettesPlateforme: 0,
    ajustementsJanDec: 0,
    moisLocationEffectifs: 12,
    fieldSources: {},
    computedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function amortissementFixture(
  overrides: Partial<AmortissementAssistantOutput> = {},
): AmortissementAssistantOutput {
  return {
    exerciceFiscal: 2026,
    totalDotations: 5000,
    status: "validated",
    planVersion: "v1",
    profil: "PROF-001",
    validatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function logementAmortissementFixture(
  overrides: Partial<LogementAmortissementOutput> = {},
): LogementAmortissementOutput {
  return {
    prixRevient: 200000,
    valeurTerrain: 40000,
    valeurBati: 160000,
    baseAmortissableBati: 160000,
    montantMobilier: 10000,
    dotationAnnuelle: 4000,
    dureeMoyenneAnnees: 25,
    prorataRatio: 1,
    plan: { composants: [] } as unknown as LogementAmortissementOutput["plan"],
    fieldSources: {},
    computedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("DECLARATION_PATCH_DRAFT — invalidation de declarationGeneratedAt sur modification contributive (P2-2)", () => {
  it("#1 financementCharges modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: financementFixture(), creditConfirmedAt: "2026-01-01T00:00:00Z" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { financementCharges: financementFixture({ totalInteretsEmprunt: 1500 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#2 revenusAssistant modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: revenusFixture(), revenusConfirmedAt: "2026-01-01T00:00:00Z" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: revenusFixture({ totalRecettes: 13000 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#3 amortissementAssistant modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      {
        completedSteps: ["amortissement"],
        amortissementAssistant: amortissementFixture(),
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { amortissementAssistant: amortissementFixture({ totalDotations: 6000 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#4a financementCharges — même valeur qu'avant → pas d'invalidation inutile", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = financementFixture();
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    // Même valeur, nouvel objet (pas la même référence) — l'égalité doit être structurelle.
    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { financementCharges: { ...fixture } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("#4b revenusAssistant — même valeur qu'avant → pas d'invalidation inutile", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = revenusFixture();
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: { ...fixture } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("#4c amortissementAssistant — même valeur qu'avant → pas d'invalidation inutile", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = amortissementFixture();
    const state = baseState(
      { completedSteps: ["amortissement"], amortissementAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { amortissementAssistant: { ...fixture } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("#5 patch non contributif (ex. logementDocumentId) → declarationGeneratedAt conservé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: [] },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { logementDocumentId: "doc-logement-1" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
    assert.equal(next.declarationDraft?.logementDocumentId, "doc-logement-1");
  });

  it("#6a financementCharges modifié, declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: financementFixture() },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { financementCharges: financementFixture({ totalInteretsEmprunt: 1500 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#6b revenusAssistant modifié, declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: revenusFixture() },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: revenusFixture({ totalRecettes: 13000 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#6c amortissementAssistant modifié, declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["amortissement"], amortissementAssistant: amortissementFixture() },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { amortissementAssistant: amortissementFixture({ totalDotations: 6000 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#7 paidAt défini dans tous les scénarios de modification contributive → jamais modifié", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      {
        completedSteps: ["credit", "revenus", "amortissement"],
        financementCharges: financementFixture(),
        revenusAssistant: revenusFixture(),
        amortissementAssistant: amortissementFixture(),
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: {
        financementCharges: financementFixture({ totalInteretsEmprunt: 1500 }),
        revenusAssistant: revenusFixture({ totalRecettes: 13000 }),
        amortissementAssistant: amortissementFixture({ totalDotations: 6000 }),
      },
    });

    assert.equal(next.fiscalYear.paidAt, PAID_AT, "le paiement déjà effectué n'est jamais remis en cause");
    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
  });

  it("#8 revenusAssistant remis à undefined (reset) après génération → invalidation également déclenchée", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: revenusFixture(), revenusConfirmedAt: "2026-01-01T00:00:00Z" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: undefined, revenusConfirmedAt: undefined },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });
});

describe("DECLARATION_PATCH_DRAFT — invalidation étendue à Logement/Activité (P2-3)", () => {
  it("#9 logementAmortissement modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      {
        completedSteps: ["logement"],
        logementAmortissement: logementAmortissementFixture(),
        logementConfirmedAt: "2026-01-01T00:00:00Z",
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { logementAmortissement: logementAmortissementFixture({ dotationAnnuelle: 4500 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#10 logementAmortissement — même valeur qu'avant → pas d'invalidation inutile", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = logementAmortissementFixture();
    const state = baseState(
      { completedSteps: ["logement"], logementAmortissement: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { logementAmortissement: { ...fixture } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("#11 logementAmortissement modifié, declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["logement"], logementAmortissement: logementAmortissementFixture() },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { logementAmortissement: logementAmortissementFixture({ dotationAnnuelle: 4500 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#12 siret modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["siren"], siret: "12345678900011", inpiConfirmedAt: "2026-01-01T00:00:00Z" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { siret: "98765432100022" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#13 dateMiseEnService modifiée + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["siren"], dateMiseEnService: "2025-03-01" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { dateMiseEnService: "2025-04-15" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#14 activityType modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["siren"], activityType: "LMNP" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { activityType: "LMP" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#15 siret/dateMiseEnService/activityType — même valeur qu'avant → pas d'invalidation inutile", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      {
        completedSteps: ["siren"],
        siret: "12345678900011",
        dateMiseEnService: "2025-03-01",
        activityType: "LMNP",
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { siret: "12345678900011", dateMiseEnService: "2025-03-01", activityType: "LMNP" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("#16 siret/dateMiseEnService/activityType modifiés, declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["siren"], siret: "12345678900011" },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { siret: "98765432100022" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#17 F-012 Charges reste hors périmètre : chargesAssistant modifié + declarationGeneratedAt posé → aucune invalidation (non couvert, comme avant P2-2/P2-3)", async () => {
    const lmnpReducer = await loadReducer();
    const chargesFixture = {
      exerciceFiscal: 2026,
      totalDeductible: 1000,
      totalNonDeductible: 0,
      totalAmortissable: 0,
      totalPreExploitation: 0,
      parCategorie: {},
      composantsNouveaux: [],
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00Z",
    };
    const state = baseState(
      { completedSteps: ["charges"], chargesAssistant: chargesFixture, chargesConfirmedAt: "2026-01-01T00:00:00Z" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { chargesAssistant: { ...chargesFixture, totalDeductible: 2000 } },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      GENERATED_AT,
      "F-012 est verrouillé en lecture seule une fois confirmé (audit P2-2/P2-3) — volontairement hors périmètre",
    );
  });
});

function pretFixture(overrides: Partial<PretFinancementExercice> = {}): PretFinancementExercice {
  return {
    pretId: "pret-1",
    typePret: "amortissable",
    interetsEmpruntExercice: 4602,
    interetsPreExploitation: 0,
    assuranceEmpruntExercice: 601,
    assurancePreExploitation: 0,
    capitalRembourseExercice: 496,
    capitalRestantDu31_12: 130256,
    fraisDossierDeductibles: 0,
    garantieDeductible: 1763,
    iraDeductible: 0,
    ...overrides,
  };
}

function bilanInputsAvecPostes(postes: VentilationTiersInputs["postes"]): BilanInputs {
  return {
    tresorerie: { bankMode: "INCONNU" },
    compteExploitant: {},
    ran: { situation: "NATIF" },
    ventilationTiers: { postes },
  };
}

/**
 * P0-1C — audit du mécanisme A (invalidation immédiate du reducer,
 * `DECLARATION_PATCH_DRAFT` / `isDeepEqualDraftValue`). Vérifie les
 * propriétés démontrées par l'audit : `computedAt` est un horodatage
 * technique jamais fiscal (correction de production, cf. reducer.ts),
 * les tableaux (`prets[]`) sont comparés structurellement et non par
 * référence, une vraie modification reste toujours détectée, le round-trip
 * `deriveVentilationTiersIntakeState()` → `buildVentilationTiersInputs()`
 * est stable, et la comparaison ne mute aucun des deux états comparés.
 *
 * `undefined` vs propriété absente (C4) : démontré à l'exécution de C6
 * ci-dessous AVANT correction (échec reproductible) — le round-trip
 * `versPosteEconomiqueInput()` reconstruit `libelle: undefined` explicitement
 * pour un poste sans libellé, alors que le poste d'origine ne porte jamais
 * cette clé avant sa première réhydratation. Corrigé dans `isDeepEqualDraftValue`
 * (`definedKeys()`, reducer.ts) — une clé `undefined` et une clé absente sont
 * désormais équivalentes, alignées sur la sémantique JSON réelle de la
 * persistance (IndexedDB/Supabase ne conservent jamais une clé `undefined`).
 *
 * Non trouvés par l'audit (documentés, non testés/non corrigés) :
 * - `bilanPatrimonial.ventilationTiers.postes[].id` (crypto.randomUUID,
 *   régénéré uniquement lors d'une suppression + recréation d'un poste
 *   équivalent) : risque réel mais étroit (aucun contrôle de réordonnancement
 *   dans l'UI), déjà neutralisé côté fiscal par le mécanisme B (P0-1B compare
 *   `rfs.patrimoine`, une sortie résolue par somme, insensible à cet id) —
 *   non corrigé ici pour ne pas dupliquer la sémantique de
 *   `resolveVentilationTiers()` dans le reducer ;
 * - `amortissementAssistant.validatedAt` : même nature qu'un `computedAt`
 *   potentiel, mais aucun chemin réel démontré où il varierait sans
 *   changement fiscal (contrairement à `computedAt`, tracé concrètement
 *   dans `RevenusDocumentStep.tsx`/`F011FinancementAssistantPanel.tsx`) —
 *   non exclu, faute de preuve.
 */
describe("P0-1C — robustesse du deep-equal du reducer (audit 2026-09-07)", () => {
  it("C1 — revenusAssistant : computedAt seul modifié (reconfirmation sans changement fiscal) → aucune invalidation", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = revenusFixture({ computedAt: "2026-01-01T00:00:00Z" });
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: { ...fixture, computedAt: "2026-06-15T08:30:00Z" } },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      GENERATED_AT,
      "computedAt est un horodatage technique — reconfirmer le même exercice sans rien changer ne doit pas invalider (chemin réel : RevenusDocumentStep.tsx handleConfirm)",
    );
  });

  it("C1 — financementCharges : computedAt seul modifié → aucune invalidation", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = financementFixture({ computedAt: "2026-01-01T00:00:00Z" });
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { financementCharges: { ...fixture, computedAt: "2026-06-15T08:30:00Z" } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("C1 — logementAmortissement : computedAt seul modifié → aucune invalidation", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = logementAmortissementFixture({ computedAt: "2026-01-01T00:00:00Z" });
    const state = baseState(
      { completedSteps: ["logement"], logementAmortissement: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { logementAmortissement: { ...fixture, computedAt: "2026-06-15T08:30:00Z" } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("C2 — computedAt modifié EN MÊME TEMPS qu'une vraie donnée fiscale → invalidation conservée (l'exclusion ne masque jamais une vraie modification)", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = revenusFixture({ computedAt: "2026-01-01T00:00:00Z" });
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: { ...fixture, totalRecettes: 13000, computedAt: "2026-06-15T08:30:00Z" } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
  });

  it("C3 — financementCharges.prets[] : même contenu, nouveaux objets, même ordre → aucune invalidation (comparaison structurelle, pas par référence)", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = financementFixture({ prets: [pretFixture({ pretId: "pret-1" }), pretFixture({ pretId: "pret-2", capitalRestantDu31_12: 45000 })] });
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: {
        financementCharges: {
          ...fixture,
          prets: [pretFixture({ pretId: "pret-1" }), pretFixture({ pretId: "pret-2", capitalRestantDu31_12: 45000 })],
        },
      },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT, "des objets fraîchement recréés mais structurellement identiques ne doivent jamais invalider");
  });

  it("C8 — financementCharges.prets[] : deux prêts réellement différents intervertis de position → invalidation conservée (l'ordre reste un signal valide quand le contenu diffère réellement)", async () => {
    const lmnpReducer = await loadReducer();
    const pretA = pretFixture({ pretId: "pret-1", capitalRestantDu31_12: 130256 });
    const pretB = pretFixture({ pretId: "pret-2", capitalRestantDu31_12: 45000 });
    const fixture = financementFixture({ prets: [pretA, pretB] });
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      // Intervertis : position 0 porte désormais le CRD de pret-2 et vice versa.
      patch: { financementCharges: { ...fixture, prets: [pretB, pretA] } },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      undefined,
      "deux prêts de contenu différent échangés de position doivent rester détectés — ne pas neutraliser la sensibilité à l'ordre par défaut",
    );
  });

  it("C4 — bilanPatrimonial.ventilationTiers.postes[].libelle : undefined vs propriété absente → aucune invalidation (équivalence démontrée par C6)", async () => {
    const lmnpReducer = await loadReducer();
    // Poste d'origine sans la clé `libelle` du tout — forme produite avant
    // toute réhydratation (versPosteEconomiqueInput() ne l'ajoute qu'au
    // premier round-trip, cf. C6 ci-dessous).
    const bilanPatrimonial = bilanInputsAvecPostes([{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }]);
    const state = baseState(
      { completedSteps: [], bilanPatrimonial },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    // Même poste, mais `libelle` explicitement présent avec la valeur `undefined`.
    const bilanAvecLibelleUndefined: BilanInputs = {
      ...bilanPatrimonial,
      ventilationTiers: { postes: [{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500, libelle: undefined }] },
    };

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { bilanPatrimonial: bilanAvecLibelleUndefined },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      GENERATED_AT,
      "libelle: undefined et l'absence de la clé libelle représentent le même fait fiscal (aucun libellé) — jamais une invalidation",
    );
  });

  it("C6 — round-trip deriveVentilationTiersIntakeState() → buildVentilationTiersInputs() : un état fiscal identique ne devient jamais artificiellement différent (postes seuls)", async () => {
    const lmnpReducer = await loadReducer();
    const bilanPatrimonial = bilanInputsAvecPostes([{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }]);
    const state = baseState(
      { completedSteps: [], bilanPatrimonial },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    // Round-trip réel : UI state dérivé depuis la valeur persistée, puis
    // reconstruit — exactement ce que rejoue PatrimonialIntakeCard à chaque
    // rendu, sans aucune édition utilisateur entre les deux.
    const uiState = deriveVentilationTiersIntakeState(bilanPatrimonial.ventilationTiers);
    const ventilationTiersReconstruite = buildVentilationTiersInputs(uiState);
    const bilanReconstruit: BilanInputs = { ...bilanPatrimonial, ventilationTiers: ventilationTiersReconstruite };

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { bilanPatrimonial: bilanReconstruit },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      GENERATED_AT,
      "un round-trip sans édition utilisateur ne doit jamais faire apparaître une différence artificielle",
    );
  });

  it("C6 (complément) — round-trip avec confirmation de liste vide (naturesConfirmeesVides) : stable également", async () => {
    const lmnpReducer = await loadReducer();
    const bilanPatrimonial: BilanInputs = {
      tresorerie: { bankMode: "INCONNU" },
      compteExploitant: {},
      ran: { situation: "NATIF" },
      ventilationTiers: {
        postes: [{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }],
        naturesConfirmeesVides: ["AUTRE_CREANCE_ACTIVITE"],
      },
    };
    const state = baseState(
      { completedSteps: [], bilanPatrimonial },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const uiState = deriveVentilationTiersIntakeState(bilanPatrimonial.ventilationTiers);
    const ventilationTiersReconstruite = buildVentilationTiersInputs(uiState);
    const bilanReconstruit: BilanInputs = { ...bilanPatrimonial, ventilationTiers: ventilationTiersReconstruite };

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { bilanPatrimonial: bilanReconstruit },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("C6 (état vide) — round-trip depuis EMPTY_VENTILATION_TIERS_INTAKE_STATE ne produit jamais un objet vide artificiel", () => {
    // Garde de non-régression sur la doctrine B-FAMILY elle-même (lue, non modifiée) :
    // un état UI vide ne doit jamais construire {postes: []}/{} qui laisserait
    // croire à une saisie — condition nécessaire pour que C6 ci-dessus soit valide.
    assert.equal(buildVentilationTiersInputs(EMPTY_VENTILATION_TIERS_INTAKE_STATE), undefined);
  });

  it("C7 — non-mutation : la comparaison ne modifie ni l'état avant, ni le patch fourni", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = revenusFixture({ computedAt: "2026-01-01T00:00:00Z" });
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );
    const patch = { revenusAssistant: { ...fixture, computedAt: "2026-06-15T08:30:00Z" } };
    const stateSnapshot = JSON.stringify(state.declarationDraft);
    const patchSnapshot = JSON.stringify(patch);

    lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", patch });

    assert.equal(JSON.stringify(state.declarationDraft), stateSnapshot, "l'état d'origine ne doit jamais être muté par la comparaison");
    assert.equal(JSON.stringify(patch), patchSnapshot, "le patch fourni ne doit jamais être muté par la comparaison");
  });
});
