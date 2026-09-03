/**
 * P0 — DeclarationVersion (Level 2). Scénario obligatoire R1 -> R2 -> R3 -> R4 :
 * append-only, aucune version écrasée, snapshot exact, currentVersionId à jour.
 *
 * Les artefacts de chaque "génération" proviennent d'un vrai appel à
 * runDeclarationGeneration() (même fonction que ValidationDocumentStep.tsx en
 * production) avec des données différentes à chaque fois — jamais construits
 * à la main, pour ne pas inventer une forme de RFS/Liasse.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/append-declaration-version.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { appendDeclarationVersion } from "./append-declaration-version";
import { runDeclarationGeneration } from "./run-declaration-generation";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";

const FISCAL_YEAR_ID = "fy-001";
const FISCAL_YEAR = 2025;

function draftWithRecettes(totalRecettes: number): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: {
      exerciceFiscal: FISCAL_YEAR,
      totalRecettes,
      loyersEncaisses: totalRecettes,
      indemnitesAssurance: 0,
      recettesPlateforme: 0,
      ajustementsJanDec: 0,
      moisLocationEffectifs: 12,
      fieldSources: {},
      computedAt: "2025-01-01T00:00:00.000Z",
    },
    chargesAssistant: {
      exerciceFiscal: FISCAL_YEAR,
      totalDeductible: 2000,
      totalNonDeductible: 0,
      totalAmortissable: 0,
      totalPreExploitation: 0,
      parCategorie: {},
      composantsNouveaux: [],
      fieldSources: {},
      computedAt: "2025-01-01T00:00:00.000Z",
    },
    amortissementAssistant: {
      exerciceFiscal: FISCAL_YEAR,
      totalDotations: 1500,
      status: "validated",
      planVersion: "v1",
      profil: "PROF-001",
      validatedAt: "2025-01-01T00:00:00.000Z",
    },
  } as DeclarationDraft;
}

function generate(totalRecettes: number) {
  const outcome = runDeclarationGeneration(draftWithRecettes(totalRecettes), FISCAL_YEAR);
  assert.equal(outcome.status, "generated", "précondition — le fixture doit être générable");
  if (outcome.status !== "generated") throw new Error("unreachable");
  return outcome;
}

describe("appendDeclarationVersion() — R1 -> R2 -> R3 -> R4", () => {
  it("A. append-only — le compteur de versions et versionNumber avancent correctement", () => {
    const r1 = generate(9000);
    const step1 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: undefined,
      existingVersions: undefined,
      ...r1,
      now: "2025-03-01T00:00:00.000Z",
    });
    assert.equal(step1.declarationVersions.length, 1);
    assert.equal(step1.declarationVersions[0]?.versionNumber, 1);

    const r2 = generate(9500);
    const step2 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: step1.declaration,
      existingVersions: step1.declarationVersions,
      ...r2,
      now: "2025-03-05T00:00:00.000Z",
    });
    assert.equal(step2.declarationVersions.length, 2);
    assert.equal(step2.declarationVersions[0]?.versionNumber, 1);
    assert.equal(step2.declarationVersions[1]?.versionNumber, 2);

    const r3 = generate(9700);
    const step3 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: step2.declaration,
      existingVersions: step2.declarationVersions,
      ...r3,
      now: "2025-03-08T00:00:00.000Z",
    });
    assert.equal(step3.declarationVersions.length, 3);
    assert.deepEqual(
      step3.declarationVersions.map((v) => v.versionNumber),
      [1, 2, 3],
    );

    const r4 = generate(9800);
    const step4 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: step3.declaration,
      existingVersions: step3.declarationVersions,
      ...r4,
      now: "2025-03-10T00:00:00.000Z",
    });
    assert.equal(step4.declarationVersions.length, 4);
    assert.deepEqual(
      step4.declarationVersions.map((v) => v.versionNumber),
      [1, 2, 3, 4],
    );
  });

  it("B. aucune version antérieure n'est écrasée — R1 capturé avant R2/R3/R4 reste identique", () => {
    const r1 = generate(9000);
    const step1 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: undefined,
      existingVersions: undefined,
      ...r1,
      now: "2025-03-01T00:00:00.000Z",
    });
    const r1Snapshot = structuredClone(step1.declarationVersions[0]);

    const step2 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: step1.declaration,
      existingVersions: step1.declarationVersions,
      ...generate(9500),
      now: "2025-03-05T00:00:00.000Z",
    });
    assert.deepStrictEqual(step2.declarationVersions[0], r1Snapshot, "R1 inchangé après R2");

    const step3 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: step2.declaration,
      existingVersions: step2.declarationVersions,
      ...generate(9700),
      now: "2025-03-08T00:00:00.000Z",
    });
    assert.deepStrictEqual(step3.declarationVersions[0], r1Snapshot, "R1 inchangé après R3");

    const step4 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: step3.declaration,
      existingVersions: step3.declarationVersions,
      ...generate(9800),
      now: "2025-03-10T00:00:00.000Z",
    });
    assert.deepStrictEqual(step4.declarationVersions[0], r1Snapshot, "R1 inchangé après R4");
  });

  it("C. snapshot exact — chaque version conserve les artefacts produits lors de sa propre génération", () => {
    const r1 = generate(9000);
    const step1 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: undefined,
      existingVersions: undefined,
      ...r1,
      now: "2025-03-01T00:00:00.000Z",
    });

    const r2 = generate(9500);
    const step2 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: step1.declaration,
      existingVersions: step1.declarationVersions,
      ...r2,
      now: "2025-03-05T00:00:00.000Z",
    });

    assert.notEqual(
      step2.declarationVersions[0]?.fiscalResult.totalRecettes,
      step2.declarationVersions[1]?.fiscalResult.totalRecettes,
      "R1 et R2 doivent différer puisque les données fiscales source ont changé",
    );
    assert.equal(step2.declarationVersions[0]?.fiscalResult.totalRecettes, r1.fiscalResult.totalRecettes);
    assert.equal(step2.declarationVersions[1]?.fiscalResult.totalRecettes, r2.fiscalResult.totalRecettes);
    // Les 4 artefacts sont bien ceux de LEUR propre génération, pas partagés.
    assert.equal(step2.declarationVersions[1]?.rfs.fiscalResult.recettes.total, r2.fiscalResult.totalRecettes);
  });

  it("D. source canonique — le snapshot stocké est exactement celui produit par runDeclarationGeneration(), transporté sans reconstruction", () => {
    const r1 = generate(9000);
    const step1 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: undefined,
      existingVersions: undefined,
      ...r1,
      now: "2025-03-01T00:00:00.000Z",
    });

    // appendDeclarationVersion() n'appelle jamais fiscalResultFromDraft() — elle
    // ne fait que transporter ce qu'on lui donne. La garantie que l'appelant
    // fournit bien outcome.fiscalResult/outcome.rfs (et non une reconstruction
    // indépendante) est structurelle : fiscalResultFromDraft() retourne un
    // FiscalResult complet (type différent, incompatible avec le paramètre
    // `fiscalResult: FiscalEngineOutput` attendu ici) — TypeScript refuserait
    // de compiler un appelant qui s'y tromperait.
    assert.deepStrictEqual(step1.declarationVersions[0]?.fiscalResult, r1.fiscalResult);
    assert.deepStrictEqual(step1.declarationVersions[0]?.rfs, r1.rfs);
    assert.deepStrictEqual(step1.declarationVersions[0]?.liasseResult, r1.liasseResult);
    assert.deepStrictEqual(step1.declarationVersions[0]?.liasseRfs, r1.liasseRfs);
  });

  it("E. currentVersionId pointe toujours vers la dernière version après chaque génération", () => {
    const step1 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: undefined,
      existingVersions: undefined,
      ...generate(9000),
      now: "2025-03-01T00:00:00.000Z",
    });
    assert.equal(step1.declaration.currentVersionId, step1.declarationVersions[0]?.id);

    const step2 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: step1.declaration,
      existingVersions: step1.declarationVersions,
      ...generate(9500),
      now: "2025-03-05T00:00:00.000Z",
    });
    assert.equal(step2.declaration.currentVersionId, step2.declarationVersions[1]?.id);
    assert.notEqual(step2.declaration.currentVersionId, step1.declarationVersions[0]?.id);
  });

  it("F. l'historique n'est jamais reconstruit à partir du miroir courant — versions antérieures indépendantes des générations suivantes", () => {
    const step1 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: undefined,
      existingVersions: undefined,
      ...generate(9000),
      now: "2025-03-01T00:00:00.000Z",
    });
    const versionsRefBeforeStep2 = step1.declarationVersions;

    appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: step1.declaration,
      existingVersions: step1.declarationVersions,
      ...generate(9999),
      now: "2025-03-05T00:00:00.000Z",
    });

    // Le tableau passé en entrée n'est jamais muté par l'append.
    assert.equal(versionsRefBeforeStep2.length, 1);
    assert.equal(versionsRefBeforeStep2[0]?.fiscalResult.totalRecettes, 9000);
  });

  it("G. première génération d'un dossier sans version → exactement la version #1", () => {
    const step1 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: undefined,
      existingVersions: undefined,
      ...generate(9000),
      now: "2025-03-01T00:00:00.000Z",
    });
    assert.equal(step1.declarationVersions.length, 1);
    assert.equal(step1.declarationVersions[0]?.versionNumber, 1);
    assert.equal(step1.declaration.createdAt, "2025-03-01T00:00:00.000Z");
    assert.equal(step1.declaration.fiscalYearId, FISCAL_YEAR_ID);
  });

  it("H. le paiement n'empêche jamais la création d'une nouvelle version — appendDeclarationVersion ne connaît pas `paid`", () => {
    // Reproduit canRetryAfterPayment : paid -> modification -> dérive détectée
    // -> retry -> nouvelle génération. appendDeclarationVersion n'a aucun
    // paramètre `paid`/`generated` : rien ne peut structurellement bloquer
    // l'ajout d'une version suivante depuis cette fonction.
    const step1 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: undefined,
      existingVersions: undefined,
      ...generate(9000),
      now: "2025-03-01T00:00:00.000Z",
    });

    // "paid" est simulé côté FiscalYear (hors périmètre de cette fonction) —
    // la correction post-paiement produit simplement une version #2 normale.
    const step2 = appendDeclarationVersion({
      fiscalYearId: FISCAL_YEAR_ID,
      existingDeclaration: step1.declaration,
      existingVersions: step1.declarationVersions,
      ...generate(9600), // données corrigées après paiement
      now: "2025-03-06T00:00:00.000Z",
    });

    assert.equal(step2.declarationVersions.length, 2);
    assert.equal(step2.declarationVersions[1]?.versionNumber, 2);
    assert.equal(step2.declarationVersions[0]?.fiscalResult.totalRecettes, 9000, "R1 (pré-paiement) conservé");
    assert.equal(step2.declarationVersions[1]?.fiscalResult.totalRecettes, 9600, "R2 (post-retry) ajoutée normalement");
  });
});
