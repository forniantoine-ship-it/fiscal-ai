/**
 * P0-2a — Vérité immédiate de la liasse — tests de resolveDeclarationOutOfDate().
 * Réutilise resolveDeclarationGenerationGate() (P0-1) tel quel — ces tests ne
 * réévaluent PAS la logique de dérive elle-même (déjà couverte par
 * declaration-generation-gate.test.ts), seulement que le signal de fraîcheur
 * en dérive correctement, sans jamais exposer/recalculer de valeur fiscale.
 * Run: npx tsx --test --env-file=.env.local src/lib/lmnp/services/declaration/declaration-freshness.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDeclarationOutOfDate } from "./declaration-freshness";
import { runDeclarationGeneration } from "./run-declaration-generation";
import type { DeclarationDraft, FiscalYear, Property } from "../../types/domain";

const NOW = "2026-09-04T00:00:00.000Z";

const PROPERTY: Property = {
  id: "prop-1",
  label: "Studio Lyon",
  address: "1 rue Test",
  city: "Lyon",
  postalCode: "69001",
};

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
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

function completeFlags(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    inpiConfirmedAt: NOW,
    logementConfirmedAt: NOW,
    creditDeclaredNoneAt: NOW,
    revenusConfirmedAt: NOW,
    chargesConfirmedAt: NOW,
    amortissementConfirmedAt: NOW,
    ...overrides,
  } as DeclarationDraft;
}

function generationReadyDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return completeFlags({
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    exploitantEmail: "marie.dupont@example.com",
    exploitantTelephone: "0601020304",
    personalAddress: "10 rue des Lilas",
    personalCity: "Lyon",
    personalPostalCode: "69001",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    ...overrides,
  } as DeclarationDraft);
}

// Reproduit exactement ce que ValidationDocumentStep.tsx écrit sur le draft
// après une génération — même helper que fiscal-year-cycle.test.ts (P0-1).
function apresGeneration(draft: DeclarationDraft): DeclarationDraft {
  const generation = runDeclarationGeneration(draft, 2025);
  assert.equal(generation.status, "generated", "le fixture doit produire une génération réelle");
  if (generation.status !== "generated") throw new Error("unreachable");
  return {
    ...draft,
    fiscalResult: generation.fiscalResult,
    liasseResult: generation.liasseResult,
    rfs: generation.rfs,
    liasseRfs: generation.liasseRfs,
  } as DeclarationDraft;
}

describe("resolveDeclarationOutOfDate — P0-2a", () => {
  it("R1 — génération valide, aucune modification → false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const result = resolveDeclarationOutOfDate({
      fiscalYear: baseFiscalYear(),
      declarationDraft: draft,
      properties: [PROPERTY],
    });
    assert.equal(result, false);
  });

  it("R2 — dérive fiscale (amortissement modifié) → true", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = {
      ...draft,
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 3000, status: "validated" as const },
    } as DeclarationDraft;
    const result = resolveDeclarationOutOfDate({
      fiscalYear: baseFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result, true);
  });

  it("R2 — dérive fiscale (financement/charges modifié) → true", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = {
      ...draft,
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000 + 1200, totalPreExploitation: 0 },
    } as DeclarationDraft;
    const result = resolveDeclarationOutOfDate({
      fiscalYear: baseFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result, true);
  });

  it("R3 — dérive identité (nom/prénom) → true", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, exploitantLastName: "Martin" } as DeclarationDraft;
    const result = resolveDeclarationOutOfDate({
      fiscalYear: baseFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result, true);
  });

  it("R3 — dérive identité (adresse) → true", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, personalAddress: "22 avenue Neuve" } as DeclarationDraft;
    const result = resolveDeclarationOutOfDate({
      fiscalYear: baseFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result, true);
  });

  it("R4 — après régénération réelle sur le draft corrigé, le signal redevient false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, exploitantLastName: "Martin" } as DeclarationDraft;

    const avantRegeneration = resolveDeclarationOutOfDate({
      fiscalYear: baseFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(avantRegeneration, true);

    const regenere = apresGeneration(corrige);
    const apresRegeneration = resolveDeclarationOutOfDate({
      fiscalYear: baseFiscalYear(),
      declarationDraft: regenere,
      properties: [PROPERTY],
    });
    assert.equal(apresRegeneration, false);
  });

  it("R5 — le signal est un booléen pur : jamais de valeur fiscale exposée, jamais de mutation du draft fourni", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, exploitantLastName: "Martin" } as DeclarationDraft;
    const snapshotAvant = JSON.stringify(corrige);

    const result = resolveDeclarationOutOfDate({
      fiscalYear: baseFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });

    assert.equal(typeof result, "boolean", "la fonction ne retourne jamais autre chose qu'un booléen — jamais un fiscalResult recalculé");
    assert.equal(JSON.stringify(corrige), snapshotAvant, "le declarationDraft fourni (donc fiscalResult/liasseResult/rfs/liasseRfs, « B ») n'est jamais muté par ce calcul");
  });

  it("rien n'a encore été généré (declarationGeneratedAt absent) → false, jamais périmé sans génération de référence", () => {
    const result = resolveDeclarationOutOfDate({
      fiscalYear: baseFiscalYear({ declarationGeneratedAt: undefined }),
      declarationDraft: generationReadyDraft(),
      properties: [PROPERTY],
    });
    assert.equal(result, false);
  });
});
