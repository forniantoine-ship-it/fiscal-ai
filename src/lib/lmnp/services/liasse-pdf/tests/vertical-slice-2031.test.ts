/**
 * P1-6A — Vertical slice 2031-SD et 2031-bis-SD / millésime 2026 : wrappers
 * publics generateCerfa2031FromRfs()/generateCerfa2031BisFromRfs(), même
 * patron de test que vertical-slice-2033-c.test.ts (P1-3).
 *
 * Complémentaire (pas redondant) de golden-master-technical-pipeline.test.ts
 * (fichier historique protégé, non modifié) : ce fichier-ci vérifie le
 * CONTRAT DES WRAPPERS avec de vraies RFS issues de runDeclarationGeneration()
 * — le golden master vérifie déjà exhaustivement le texte/positions réels
 * dessinés sur un dossier de référence construit à la main.
 *
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/vertical-slice-2031.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateCerfa2031FromRfs } from "../generate-cerfa-2031";
import { generateCerfa2031BisFromRfs } from "../generate-cerfa-2031-bis";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";

function draftBase(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2025-03-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    ...overrides,
  } as DeclarationDraft;
}

// Bénéfice : 9000 - 2000 - 1500 = 5500 > 0 → I_7A/C_L1_COL1/I_AUTRES_LMNP_BENEFICE.
function draftBenefice(): DeclarationDraft {
  return draftBase();
}

// Déficit : recettes très inférieures aux charges → I_7B/C_L1_COL2/I_AUTRES_LMNP_DEFICIT.
function draftDeficit(): DeclarationDraft {
  return draftBase({
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 100 } as never,
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 5000, totalPreExploitation: 0 } as never,
  });
}

const AUTHORIZED_2031 = new Set([
  "A_SIREN",
  "A_DENOMINATION",
  "A_ADRESSE_ENTREPRISE",
  "A_EXERCICE_DEBUT",
  "A_EXERCICE_FIN",
  "D_REGIME_REEL_SIMPLIFIE",
  "C_L1_COL1",
  "C_L1_COL2",
  "I_7A",
  "I_7B",
]);

const AUTHORIZED_2031BIS = new Set(["I_AUTRES_LMNP_BENEFICE", "I_AUTRES_LMNP_DEFICIT"]);

describe("generateCerfa2031FromRfs — vertical slice 2031-SD (P1-6A)", () => {
  it("cas nominal — bénéfice (RFS réelle via runDeclarationGeneration) : I_7A/C_L1_COL1 dessinées, I_7B/C_L1_COL2 absentes", async () => {
    const generation = runDeclarationGeneration(draftBenefice(), 2025);
    assert.equal(generation.status, "generated", "précondition — le fixture doit être générable");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2031FromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    assert.ok(result.pdfBytes.length > 0);
    assert.equal(result.pageCount, 1, "2031-SD occupe une seule page (page 1 de l'asset partagé)");
    assert.equal(result.form, "2031-SD");
    assert.equal(result.millesime, 2026);

    const drawnCaseIds = new Set(result.manifest.map((entry) => entry.caseId));
    assert.ok(drawnCaseIds.has("I_7A"), "I_7A (bénéfice) doit être dessinée");
    assert.ok(drawnCaseIds.has("C_L1_COL1"), "C_L1_COL1 (bénéfice) doit être dessinée");
    assert.ok(!drawnCaseIds.has("I_7B"), "I_7B (déficit) ne doit jamais apparaître en cas de bénéfice");
    assert.ok(!drawnCaseIds.has("C_L1_COL2"), "C_L1_COL2 (déficit) ne doit jamais apparaître en cas de bénéfice");
  });

  it("cas nominal — déficit (comportement différent du bénéfice) : I_7B dessinée, I_7A/C_L1_COL1 absentes ; C_L1_COL2 structurellement jamais alimentée par le F-006 actuel (map-2031-recapitulation.ts : condition resultatFiscal < 0, jamais vraie — resultatFiscal est toujours plafonné à 0, le déficit vit dans deficitNouveau)", async () => {
    const generation = runDeclarationGeneration(draftDeficit(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    assert.equal(generation.fiscalResult.resultatFiscal, 0, "précondition — resultatFiscal toujours plafonné à 0 (jamais négatif)");
    assert.ok(generation.fiscalResult.deficitNouveau > 0, "précondition — le déficit doit bien être réel, porté par deficitNouveau");

    const result = await generateCerfa2031FromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    const drawnCaseIds = new Set(result.manifest.map((entry) => entry.caseId));
    assert.ok(drawnCaseIds.has("I_7B"), "I_7B (déficit) doit être dessinée");
    assert.ok(!drawnCaseIds.has("I_7A"), "I_7A (bénéfice) ne doit jamais apparaître en cas de déficit");
    assert.ok(!drawnCaseIds.has("C_L1_COL1"), "C_L1_COL1 (bénéfice) ne doit jamais apparaître en cas de déficit");
    assert.ok(!drawnCaseIds.has("C_L1_COL2"), "C_L1_COL2 n'est jamais alimentée par le F-006 actuel (resultatFiscal n'est jamais négatif) — non-régression de ce constat, pas un bug de ce wrapper");
  });

  it("moteur bloqué (débordement réel — recettes extrêmes) → status 'blocked', form2031 exposée pour diagnostic, aucun pdfBytes", async () => {
    const generation = runDeclarationGeneration(
      draftBase({ revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 999999999999 } as never }),
      2025,
    );
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2031FromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });

    assert.equal(result.status, "blocked");
    if (result.status !== "blocked") return;
    assert.ok(result.violations.length > 0, "les violations du moteur doivent être exposées pour diagnostic");
    assert.ok(result.violations.every((v) => v.form === "2031-SD"));
    assert.ok("pdfBytes" in result === false, "aucun pdfBytes ne doit exister quand le statut est 'blocked'");
  });

  it("aucune case hors des 9 autorisées n'est jamais transmise au renderer — le mapper limite structurellement son propre périmètre", async () => {
    const generation = runDeclarationGeneration(draftBenefice(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2031FromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    for (const cerfaCase of result.form2031.cases) {
      assert.ok(AUTHORIZED_2031.has(cerfaCase.caseId), `case inattendue transmise au renderer : ${cerfaCase.caseId}`);
    }
  });

  it("délégation sans recalcul parallèle : deux appels avec la même RFS produisent le même PDF (SHA-256 identique)", async () => {
    const generation = runDeclarationGeneration(draftBenefice(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const first = await generateCerfa2031FromRfs({ rfs: generation.rfs, declarationVersionId: "v1", generatedAt: "2026-01-01T00:00:00.000Z" });
    const second = await generateCerfa2031FromRfs({ rfs: generation.rfs, declarationVersionId: "v1", generatedAt: "2026-01-01T00:00:00.000Z" });
    assert.equal(first.status, "generated");
    assert.equal(second.status, "generated");
    if (first.status !== "generated" || second.status !== "generated") return;

    assert.equal(first.sha256, second.sha256, "même RFS, même appel → même PDF octet pour octet");
  });
});

describe("generateCerfa2031BisFromRfs — vertical slice 2031-bis-SD (P1-6A)", () => {
  it("cas nominal — bénéfice : I_AUTRES_LMNP_BENEFICE dessinée, I_AUTRES_LMNP_DEFICIT absente", async () => {
    const generation = runDeclarationGeneration(draftBenefice(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2031BisFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    assert.ok(result.pdfBytes.length > 0);
    assert.equal(result.pageCount, 1, "2031-bis-SD occupe une seule page (page 2 de l'asset partagé)");
    assert.equal(result.form, "2031-bis-SD");

    const drawnCaseIds = new Set(result.manifest.map((entry) => entry.caseId));
    assert.ok(drawnCaseIds.has("I_AUTRES_LMNP_BENEFICE"));
    assert.ok(!drawnCaseIds.has("I_AUTRES_LMNP_DEFICIT"));
  });

  it("cas nominal — déficit (comportement différent du bénéfice) : I_AUTRES_LMNP_DEFICIT dessinée, I_AUTRES_LMNP_BENEFICE absente", async () => {
    const generation = runDeclarationGeneration(draftDeficit(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2031BisFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    const drawnCaseIds = new Set(result.manifest.map((entry) => entry.caseId));
    assert.ok(drawnCaseIds.has("I_AUTRES_LMNP_DEFICIT"));
    assert.ok(!drawnCaseIds.has("I_AUTRES_LMNP_BENEFICE"));
  });

  it("moteur bloqué (débordement réel — recettes extrêmes) → status 'blocked', form2031Bis exposée pour diagnostic, aucun pdfBytes", async () => {
    const generation = runDeclarationGeneration(
      draftBase({ revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 999999999999999999 } as never }),
      2025,
    );
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2031BisFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });

    assert.equal(result.status, "blocked");
    if (result.status !== "blocked") return;
    assert.ok(result.violations.length > 0);
    assert.ok(result.violations.every((v) => v.form === "2031-bis-SD"));
    assert.ok("pdfBytes" in result === false);
  });

  it("aucune case hors des 2 autorisées n'est jamais transmise au renderer", async () => {
    const generation = runDeclarationGeneration(draftBenefice(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2031BisFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    for (const cerfaCase of result.form2031Bis.cases) {
      assert.ok(AUTHORIZED_2031BIS.has(cerfaCase.caseId), `case inattendue transmise au renderer : ${cerfaCase.caseId}`);
    }
  });

  it("délégation sans recalcul parallèle : deux appels avec la même RFS produisent le même PDF (SHA-256 identique)", async () => {
    const generation = runDeclarationGeneration(draftBenefice(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const first = await generateCerfa2031BisFromRfs({ rfs: generation.rfs, declarationVersionId: "v1", generatedAt: "2026-01-01T00:00:00.000Z" });
    const second = await generateCerfa2031BisFromRfs({ rfs: generation.rfs, declarationVersionId: "v1", generatedAt: "2026-01-01T00:00:00.000Z" });
    assert.equal(first.status, "generated");
    assert.equal(second.status, "generated");
    if (first.status !== "generated" || second.status !== "generated") return;

    assert.equal(first.sha256, second.sha256, "même RFS, même appel → même PDF octet pour octet");
  });
});
