/**
 * P1-3 — Vertical slice 2033-C-SD / millésime 2026 : wrapper public
 * generateCerfa2033CFromRfs(), exactement le même patron de test que
 * vertical-slice-2033-b.test.ts.
 *
 * Complémentaire (pas redondant) de position-oracle.test.ts, describe
 * "Oracle de position indépendant — 2033-C-SD" : ce fichier-ci vérifie le
 * CONTRAT DU WRAPPER (statuts generated/blocked, RFS issue d'un vrai
 * runDeclarationGeneration(), pas de scope superflu) ; position-oracle.test.ts
 * vérifie déjà exhaustivement la GÉOMÉTRIE (boîtes de valeur officielles vs
 * registre) — non dupliquée ici.
 *
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/vertical-slice-2033-c.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateCerfa2033CFromRfs } from "../generate-cerfa-2033c";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";

function draftAvecImmobilisations(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
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
    logementAmortissement: {
      prixRevient: 123500,
      valeurTerrain: 18000,
      valeurBati: 105500,
      baseAmortissableBati: 105500,
      montantMobilier: 5000,
      dotationAnnuelle: 1500,
      dureeMoyenneAnnees: 4,
      prorataRatio: 1,
      plan: {
        lignes: [
          { label: "Gros œuvre", montant: 105500, dureeAnnees: 4, dotationExercice: 1500, amortissementsCumules: 1500, vnc: 104000 },
        ],
        totalAnnuelExercice: 1500,
        totalBrut: 105500,
      },
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00Z",
    },
    ...overrides,
  } as DeclarationDraft;
}

describe("generateCerfa2033CFromRfs — vertical slice 2033-C-SD (P1-3)", () => {
  it("cas nominal — RFS réelle (runDeclarationGeneration), premier exercice de mise en service : les 8 cases sont générées et dessinées", async () => {
    const generation = runDeclarationGeneration(draftAvecImmobilisations(), 2025);
    assert.equal(generation.status, "generated", "précondition — le fixture doit être générable");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2033CFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });

    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    assert.ok(result.pdfBytes.length > 0);
    assert.equal(result.pageCount, 1, "2033-C-SD occupe une seule page (page 3 de l'asset partagé)");
    assert.equal(result.form, "2033-C-SD");
    assert.equal(result.millesime, 2026);

    const drawnCaseIds = result.manifest.map((entry) => entry.caseId).sort();
    assert.deepEqual(
      drawnCaseIds,
      ["426", "476", "490", "492", "496", "570", "572", "576"].sort(),
      "les 8 cases calibrées du registre doivent toutes être dessinées pour ce dossier (premier exercice, aucune divergence F-010/F-014)",
    );
  });

  it("cas nominal — exercice ultérieur (pas le premier de mise en service) : 490/492/570 absentes, 426/476/496/572/576 toujours dessinées", async () => {
    const generation = runDeclarationGeneration(draftAvecImmobilisations({ dateMiseEnService: "2018-01-01" }), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2033CFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    const drawnCaseIds = result.manifest.map((entry) => entry.caseId).sort();
    assert.deepEqual(drawnCaseIds, ["426", "476", "496", "572", "576"].sort());
  });

  it("moteur bloqué (débordement réel — valeurTerrain extrême) → status 'blocked', form2033C exposée pour diagnostic, aucun pdfBytes", async () => {
    const generation = runDeclarationGeneration(
      draftAvecImmobilisations({
        logementAmortissement: {
          ...draftAvecImmobilisations().logementAmortissement!,
          valeurTerrain: 999999999999,
        },
      }),
      2025,
    );
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2033CFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });

    assert.equal(result.status, "blocked");
    if (result.status !== "blocked") return;
    assert.ok(result.violations.length > 0, "les violations du moteur doivent être exposées pour diagnostic");
    assert.ok(result.violations.every((v) => v.form === "2033-C-SD"));
    assert.ok("pdfBytes" in result === false, "aucun pdfBytes ne doit exister quand le statut est 'blocked'");
  });

  it("aucune case hors des 8 calibrées n'est jamais transmise au renderer — le mapper limite structurellement son propre périmètre (pas de filtre de scope nécessaire, à la différence de 2033-A)", async () => {
    const generation = runDeclarationGeneration(draftAvecImmobilisations(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const result = await generateCerfa2033CFromRfs({ rfs: generation.rfs, declarationVersionId: "v1" });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;

    const authorized = new Set(["426", "476", "490", "492", "496", "570", "572", "576"]);
    for (const cerfaCase of result.form2033C.cases) {
      assert.ok(authorized.has(cerfaCase.caseId), `case inattendue transmise au renderer : ${cerfaCase.caseId}`);
    }
  });

  it("delegation sans recalcul parallèle : deux appels avec la même RFS produisent le même PDF (SHA-256 identique)", async () => {
    const generation = runDeclarationGeneration(draftAvecImmobilisations(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    const first = await generateCerfa2033CFromRfs({ rfs: generation.rfs, declarationVersionId: "v1", generatedAt: "2026-01-01T00:00:00.000Z" });
    const second = await generateCerfa2033CFromRfs({ rfs: generation.rfs, declarationVersionId: "v1", generatedAt: "2026-01-01T00:00:00.000Z" });
    assert.equal(first.status, "generated");
    assert.equal(second.status, "generated");
    if (first.status !== "generated" || second.status !== "generated") return;

    assert.equal(first.sha256, second.sha256, "même RFS, même appel → même PDF octet pour octet");
  });
});
