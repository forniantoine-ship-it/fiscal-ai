/**
 * Lot 1 — contrat d'orchestration : les deux chemins de création N+1
 * délèguent au même constructeur métier pur.
 *
 * Run: npx tsx --test src/lib/lmnp/store/lot1-n-plus-1-orchestration.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildNextExerciseFromClosedYear,
  createNextDeclarationDraft,
} from "../services/dossier/fiscal-year-cycle";
import type { DeclarationDraft, FiscalYear } from "../types/domain";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("Lot 1 — orchestration : chemins unifiés + pas de reseed", () => {
  it("21 — persistFiscalYearTransition et persistFiscalYearClosureAndTransition appellent le même constructeur", () => {
    const source = readFileSync(join(HERE, "dossier-db.ts"), "utf-8");
    const transitionFn = source.slice(source.indexOf("export async function persistFiscalYearTransition"));
    const closureFn = source.slice(source.indexOf("export async function persistFiscalYearClosureAndTransition"));

    assert.match(transitionFn.slice(0, 3500), /buildNextExerciseFromClosedYear\(/);
    assert.match(closureFn.slice(0, 8000), /buildNextExerciseFromClosedYear\(/);
    // Plus d'appel direct divergent à createNextFiscalYear / applyStocks dans ces deux chemins.
    assert.equal(
      (transitionFn.match(/createNextFiscalYear\(/g) ?? []).length,
      0,
      "persistFiscalYearTransition ne doit plus construire N+1 hors du builder",
    );
    assert.equal(
      (closureFn.match(/createNextFiscalYear\(/g) ?? []).length,
      0,
      "persistFiscalYearClosureAndTransition ne doit plus construire N+1 hors du builder",
    );
  });

  it("21b — même N clos + mêmes IDs ⇒ même FiscalYear N+1 sémantique (stocks + patrimoine + draft)", () => {
    const closed: FiscalYear = {
      id: "fy-N",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: "dossier-1",
      previousFiscalYearId: null,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      closures: [
        {
          id: "closure-N",
          fiscalYearId: "fy-N",
          dossierId: "dossier-1",
          stocks: { deficits: [{ millesime: 2025, montant: 100 }], amortissementsReportes: 50 },
          computedAt: "2026-01-01T00:00:00.000Z",
          closedAt: "2026-01-01T00:00:00.000Z",
          patrimoine: {
            compteExploitantAvantAffectationResultat: 200,
            resultatComptableExercice: 1000,
            ranSituation: "NATIF",
          },
        },
      ],
    };
    const previousDraft: DeclarationDraft = {
      completedSteps: ["siren"],
      siren: "123456789",
      exploitantFirstName: "Marie",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 1 } as DeclarationDraft["revenusAssistant"],
    } as DeclarationDraft;

    const viaTransitionSemantics = buildNextExerciseFromClosedYear({
      closedFiscalYear: closed,
      previousDraft,
      dossierId: "dossier-1",
      nextFiscalYearId: "fy-shared",
      now: "2026-02-01T00:00:00.000Z",
    });
    const viaClosureSemantics = buildNextExerciseFromClosedYear({
      closedFiscalYear: closed,
      previousDraft,
      dossierId: "dossier-1",
      nextFiscalYearId: "fy-shared",
      now: "2026-02-01T00:00:00.000Z",
    });

    assert.deepEqual(viaTransitionSemantics, viaClosureSemantics);
    assert.deepEqual(
      viaTransitionSemantics.declarationDraft,
      createNextDeclarationDraft(previousDraft),
      "le draft N+1 est exactement createNextDeclarationDraft (identité + prefills durables)",
    );
  });

  it("22 — un N+1 déjà matérialisé n'est pas reconstruit depuis N par le builder (id injecté conservé, N non muté)", () => {
    const closed: FiscalYear = {
      id: "fy-N",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: "dossier-1",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      closures: [
        {
          id: "closure-N",
          fiscalYearId: "fy-N",
          dossierId: "dossier-1",
          stocks: { deficits: [], amortissementsReportes: 0 },
          computedAt: "2026-01-01T00:00:00.000Z",
          closedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const before = structuredClone(closed);
    const existingNPlus1Id = "fy-already-exists";
    const built = buildNextExerciseFromClosedYear({
      closedFiscalYear: closed,
      previousDraft: { completedSteps: [], siren: "1" } as DeclarationDraft,
      dossierId: "dossier-1",
      nextFiscalYearId: existingNPlus1Id,
      now: "2026-03-01T00:00:00.000Z",
    });
    assert.equal(built.fiscalYear.id, existingNPlus1Id);
    assert.deepEqual(closed, before, "N n'est jamais reseedé / muté");
    // La protection runtime contre double création (FiscalYearAlreadyClosedError /
    // transitionInFlight) reste dans dossier-db / orchestrateurs — Lot 3 pour
    // la transaction serveur. Ici on garantit que le seed métier est pur.
  });
});
