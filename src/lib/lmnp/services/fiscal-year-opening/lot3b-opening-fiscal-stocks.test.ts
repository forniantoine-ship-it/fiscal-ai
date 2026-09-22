/**
 * Lot 3B — bridge FiscalYearOpening.stocks → F006 (parité interne / Opening).
 *
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-opening/lot3b-opening-fiscal-stocks.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import {
  buildFiscalYearClosure,
  resolveStocksOuverture,
} from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import { map2031FromRfs } from "@/runtime/capabilities/rfs/projection/map-2031-from-rfs";

import { adaptInternalOpening } from "./adapt-internal-opening";
import { computeOpeningContentHash } from "./content-hash";
import { available, unavailable } from "./opening-fact";
import { isAvailable } from "./opening-fact";
import {
  fiscalStocksSemanticallyEqual,
  resolveCanonicalOpeningFiscalStocks,
  resolveOpeningFiscalStocks,
} from "./resolve-opening-fiscal-stocks";
import type { FiscalYearOpening, OpeningDeficitRow } from "./types";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const EXERCICE = 2026;
const DOSSIER = "dossier-lot3b";

const ORACLE_DEFICITS: OpeningDeficitRow[] = [
  { millesime: 2022, montant: 1500 },
  { millesime: 2024, montant: 500 },
];
const ORACLE_AMORT_OPEN = 4000;

/** Draft économique N : avant amort = 3000 → imputations 2000 → amort 2000 → mouvement 1000. */
function draftOracle(): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Lot",
    exploitantLastName: "TroisB",
    dateMiseEnService: "2020-01-01",
    activityStartDate: "2020-01-01",
    revenusAssistant: {
      exerciceFiscal: EXERCICE,
      totalRecettes: 8000,
      loyersEncaisses: 8000,
      indemnitesAssurance: 0,
      recettesPlateforme: 0,
      ajustementsJanDec: 0,
      moisLocationEffectifs: 12,
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00.000Z",
    },
    chargesAssistant: {
      exerciceFiscal: EXERCICE,
      totalDeductible: 5000,
      totalPreExploitation: 0,
      parCategorie: {},
    },
    financementCharges: {
      exerciceFiscal: EXERCICE,
      totalChargesFinancementExercice: 0,
      totalInteretsPreExploitation: 0,
    },
    amortissementAssistant: {
      exerciceFiscal: EXERCICE,
      totalDotations: 2000,
      status: "validated",
    },
  } as unknown as DeclarationDraft;
}

function makeValidatedOpening(params: {
  deficits: OpeningDeficitRow[] | "unavailable";
  amortissementsReportes: number | "unavailable";
  validationStatus?: "validated" | "pending";
  dossierId?: string;
  targetFiscalYear?: number;
  mutateAfterValidate?: (o: FiscalYearOpening) => void;
}): FiscalYearOpening {
  const opening: FiscalYearOpening = {
    openingId: "opening-lot3b",
    revision: 1,
    targetFiscalYear: params.targetFiscalYear ?? EXERCICE,
    dossierId: params.dossierId ?? DOSSIER,
    source: {
      kind: "external_takeover",
      takeoverId: "takeover-lot3b",
      sourceFiscalYear: EXERCICE - 1,
    },
    stocks: {
      deficits:
        params.deficits === "unavailable"
          ? unavailable("déficits inconnus")
          : available(params.deficits),
      amortissementsReportes:
        params.amortissementsReportes === "unavailable"
          ? unavailable("stock amort inconnu")
          : available(params.amortissementsReportes),
    },
    assets: unavailable("hors scope 3B"),
    loans: unavailable("hors scope 3B"),
    patrimoine: {
      ouvertureCompteExploitant: unavailable("hors scope"),
      ran: unavailable("hors scope"),
      tresorerieOuverture: unavailable("hors scope"),
    },
    properties: unavailable("hors scope"),
    identity: unavailable("hors scope"),
    provenance: {
      source: { fieldPath: "source", sourceKind: "external", sourceRef: "takeover-lot3b" },
      "stocks.deficits": { fieldPath: "stocks.deficits", sourceKind: "external" },
      "stocks.amortissementsReportes": {
        fieldPath: "stocks.amortissementsReportes",
        sourceKind: "external",
      },
    },
    validation: { status: "pending" },
  };

  if (params.validationStatus === "pending") {
    return opening;
  }

  opening.validation = {
    status: "validated",
    openingRevision: opening.revision,
    contentHash: computeOpeningContentHash(opening),
    validatedAt: "2026-01-01T00:00:00.000Z",
    validator: "lot3b-test",
  };

  if (params.mutateAfterValidate) {
    params.mutateAfterValidate(opening);
  }
  return opening;
}

function case318(generation: ReturnType<typeof runDeclarationGeneration>): number | undefined {
  if (generation.status !== "generated") return undefined;
  return map2033BFromRfs(generation.rfs).cases.find((c) => c.caseId === "318")?.value;
}

function aide2042Snapshot(generation: ReturnType<typeof runDeclarationGeneration>) {
  assert.equal(generation.status, "generated");
  if (generation.status !== "generated") return null;
  const doc = buildClientSummaryDocument(generation.rfs, {
    activityStartDate: "2020-01-01",
  });
  return {
    cases: doc.aide2042.cases.map((c) => ({ case: c.case, montant: c.montant })),
    resultatFiscal: doc.syntheseFiscale.resultatFiscal,
    deficitsAnterieursRestants: doc.syntheseFiscale.deficitsAnterieursRestants,
    deficitsAnterieursImputes: doc.syntheseFiscale.deficitsAnterieursImputes,
  };
}

// ---------------------------------------------------------------------------
describe("Lot 3B — resolveOpeningFiscalStocks (absence ≠ zéro / validation)", () => {
  it("available([]) + available(0) → READY", () => {
    const opening = makeValidatedOpening({ deficits: [], amortissementsReportes: 0 });
    const r = resolveOpeningFiscalStocks({ opening, expectedExerciceFiscal: EXERCICE });
    assert.equal(r.status, "ready");
    if (r.status !== "ready") return;
    assert.deepEqual(r.stocks.deficits, []);
    assert.equal(r.stocks.amortissementsReportes, 0);
  });

  it("deficits unavailable → BLOCKED (jamais [])", () => {
    const opening = makeValidatedOpening({
      deficits: "unavailable",
      amortissementsReportes: 0,
    });
    const r = resolveOpeningFiscalStocks({ opening });
    assert.equal(r.status, "blocked");
    if (r.status !== "blocked") return;
    assert.ok(r.issues.some((i) => i.code === "DEFICITS_UNAVAILABLE"));
    assert.equal(
      readFileSync(path.join(MODULE_DIR, "resolve-opening-fiscal-stocks.ts"), "utf8").includes(
        "unavailable → []",
      ),
      false,
    );
  });

  it("amortissementsReportes unavailable → BLOCKED (jamais 0)", () => {
    const opening = makeValidatedOpening({
      deficits: [],
      amortissementsReportes: "unavailable",
    });
    const r = resolveOpeningFiscalStocks({ opening });
    assert.equal(r.status, "blocked");
    if (r.status !== "blocked") return;
    assert.ok(r.issues.some((i) => i.code === "AMORT_STOCK_UNAVAILABLE"));
  });

  it("stocks connus non nuls → READY", () => {
    const opening = makeValidatedOpening({
      deficits: ORACLE_DEFICITS,
      amortissementsReportes: ORACLE_AMORT_OPEN,
    });
    const r = resolveOpeningFiscalStocks({
      opening,
      expectedDossierId: DOSSIER,
      expectedExerciceFiscal: EXERCICE,
    });
    assert.equal(r.status, "ready");
    if (r.status !== "ready") return;
    assert.deepEqual(r.stocks.deficits, ORACLE_DEFICITS);
    assert.equal(r.stocks.amortissementsReportes, ORACLE_AMORT_OPEN);
  });

  it("pending → BLOCKED", () => {
    const opening = makeValidatedOpening({
      deficits: [],
      amortissementsReportes: 0,
      validationStatus: "pending",
    });
    const r = resolveOpeningFiscalStocks({ opening });
    assert.equal(r.status, "blocked");
    if (r.status !== "blocked") return;
    assert.ok(r.issues.some((i) => i.code === "OPENING_NOT_VALIDATED"));
  });

  it("hash stale → BLOCKED", () => {
    const opening = makeValidatedOpening({
      deficits: [],
      amortissementsReportes: 0,
      mutateAfterValidate: (o) => {
        o.revision = 99;
      },
    });
    const r = resolveOpeningFiscalStocks({ opening });
    assert.equal(r.status, "blocked");
    if (r.status !== "blocked") return;
    assert.ok(r.issues.some((i) => i.code === "OPENING_VALIDATION_STALE"));
  });

  it("mauvais dossier → BLOCKED", () => {
    const opening = makeValidatedOpening({ deficits: [], amortissementsReportes: 0 });
    const r = resolveOpeningFiscalStocks({ opening, expectedDossierId: "autre-dossier" });
    assert.equal(r.status, "blocked");
    if (r.status !== "blocked") return;
    assert.ok(r.issues.some((i) => i.code === "DOSSIER_MISMATCH"));
  });

  it("mauvais exercice → BLOCKED", () => {
    const opening = makeValidatedOpening({ deficits: [], amortissementsReportes: 0 });
    const r = resolveOpeningFiscalStocks({ opening, expectedExerciceFiscal: 2099 });
    assert.equal(r.status, "blocked");
    if (r.status !== "blocked") return;
    assert.ok(r.issues.some((i) => i.code === "EXERCICE_MISMATCH"));
  });
});

// ---------------------------------------------------------------------------
describe("Lot 3B — double source", () => {
  const stocks = {
    deficits: ORACLE_DEFICITS,
    amortissementsReportes: ORACLE_AMORT_OPEN,
  };

  it("identiques → READY", () => {
    const opening = makeValidatedOpening({
      deficits: ORACLE_DEFICITS,
      amortissementsReportes: ORACLE_AMORT_OPEN,
    });
    const r = resolveCanonicalOpeningFiscalStocks({
      opening,
      stocksOuverture: stocks,
      expectedExerciceFiscal: EXERCICE,
    });
    assert.equal(r.status, "ready");
    if (r.status !== "ready") return;
    assert.ok(r.stocks);
    assert.ok(fiscalStocksSemanticallyEqual(r.stocks!, stocks));
  });

  it("même déficits ordre différent → READY", () => {
    const opening = makeValidatedOpening({
      deficits: [...ORACLE_DEFICITS].reverse(),
      amortissementsReportes: ORACLE_AMORT_OPEN,
    });
    const r = resolveCanonicalOpeningFiscalStocks({
      opening,
      stocksOuverture: stocks,
      expectedExerciceFiscal: EXERCICE,
    });
    assert.equal(r.status, "ready");
  });

  it("déficits divergents → BLOCKED", () => {
    const opening = makeValidatedOpening({
      deficits: [{ millesime: 2022, montant: 9999 }],
      amortissementsReportes: ORACLE_AMORT_OPEN,
    });
    const r = resolveCanonicalOpeningFiscalStocks({
      opening,
      stocksOuverture: stocks,
      expectedExerciceFiscal: EXERCICE,
    });
    assert.equal(r.status, "blocked");
    if (r.status !== "blocked") return;
    assert.ok(r.issues.some((i) => i.code === "OPENING_STOCKS_DIVERGE"));
  });

  it("amort stock divergent → BLOCKED", () => {
    const opening = makeValidatedOpening({
      deficits: ORACLE_DEFICITS,
      amortissementsReportes: 1,
    });
    const r = resolveCanonicalOpeningFiscalStocks({
      opening,
      stocksOuverture: stocks,
      expectedExerciceFiscal: EXERCICE,
    });
    assert.equal(r.status, "blocked");
    if (r.status !== "blocked") return;
    assert.ok(r.issues.some((i) => i.code === "OPENING_STOCKS_DIVERGE"));
  });

  it("aucune source → READY(undefined)", () => {
    const r = resolveCanonicalOpeningFiscalStocks({});
    assert.equal(r.status, "ready");
    if (r.status !== "ready") return;
    assert.equal(r.stocks, undefined);
  });
});

// ---------------------------------------------------------------------------
describe("Lot 3B — parité A (stocksOuverture) ↔ B (FiscalYearOpening)", () => {
  const stocksOuverture = {
    deficits: ORACLE_DEFICITS,
    amortissementsReportes: ORACLE_AMORT_OPEN,
    deficitsExpires: [] as { millesime: number; montant: number }[],
  };

  it("inputs F006 + outputs + 318 + RFS + 2042 + clôture identiques", () => {
    const draft = draftOracle();
    const opening = makeValidatedOpening({
      deficits: ORACLE_DEFICITS,
      amortissementsReportes: ORACLE_AMORT_OPEN,
    });

    const pathA = runDeclarationGeneration(draft, EXERCICE, stocksOuverture);
    const pathB = runDeclarationGeneration(
      draft,
      EXERCICE,
      undefined,
      undefined,
      undefined,
      undefined,
      opening,
    );

    assert.equal(pathA.status, "generated", JSON.stringify(pathA));
    assert.equal(pathB.status, "generated", JSON.stringify(pathB));
    if (pathA.status !== "generated" || pathB.status !== "generated") return;

    // Inputs effectifs (via résolution canonique)
    const resolvedA = resolveCanonicalOpeningFiscalStocks({ stocksOuverture });
    const resolvedB = resolveCanonicalOpeningFiscalStocks({
      opening,
      expectedExerciceFiscal: EXERCICE,
    });
    assert.equal(resolvedA.status, "ready");
    assert.equal(resolvedB.status, "ready");
    if (resolvedA.status !== "ready" || resolvedB.status !== "ready") return;
    assert.deepEqual(resolvedA.stocks, resolvedB.stocks);

    // F006 outputs
    assert.equal(pathA.rfs.fiscalResult.resultatFiscal, pathB.rfs.fiscalResult.resultatFiscal);
    assert.equal(pathA.rfs.fiscalResult.deficitsImputes, pathB.rfs.fiscalResult.deficitsImputes);
    assert.deepEqual(pathA.rfs.fiscalResult.stocks.deficits, pathB.rfs.fiscalResult.stocks.deficits);
    assert.equal(pathA.rfs.fiscalResult.amortDeduct, pathB.rfs.fiscalResult.amortDeduct);
    assert.equal(
      pathA.rfs.fiscalResult.amortNonDeduitExercice,
      pathB.rfs.fiscalResult.amortNonDeduitExercice,
    );
    assert.equal(
      pathA.rfs.fiscalResult.stocks.amortissementsReportes,
      pathB.rfs.fiscalResult.stocks.amortissementsReportes,
    );

    // Oracle littéral : mouvement 1000, stock final 5000, case 318 = 1000
    assert.equal(pathA.rfs.fiscalResult.amortNonDeduitExercice, 1000);
    assert.equal(pathB.rfs.fiscalResult.amortNonDeduitExercice, 1000);
    assert.equal(pathA.rfs.fiscalResult.stocks.amortissementsReportes, 5000);
    assert.equal(pathB.rfs.fiscalResult.stocks.amortissementsReportes, 5000);
    assert.equal(case318(pathA), 1000);
    assert.equal(case318(pathB), 1000);
    assert.notEqual(case318(pathA), ORACLE_AMORT_OPEN);
    assert.notEqual(case318(pathA), 5000);

    // Déficits : imputation réelle (2000) + millésimes restants vides
    assert.equal(pathA.rfs.fiscalResult.deficitsImputes, 2000);
    assert.equal(pathB.rfs.fiscalResult.deficitsImputes, 2000);
    assert.deepEqual(pathA.rfs.fiscalResult.stocks.deficits, []);
    assert.deepEqual(pathB.rfs.fiscalResult.stocks.deficits, []);

    // 2031 — résultat fiscal 0 → pas de case bénéfice ; parité des cases produites
    const cases2031A = map2031FromRfs(pathA.rfs).cases.map((c) => ({
      caseId: c.caseId,
      value: c.value,
    }));
    const cases2031B = map2031FromRfs(pathB.rfs).cases.map((c) => ({
      caseId: c.caseId,
      value: c.value,
    }));
    assert.deepEqual(cases2031A, cases2031B);
    assert.equal(pathA.rfs.fiscalResult.resultatFiscal, 0);

    // 2042
    assert.deepEqual(aide2042Snapshot(pathA), aide2042Snapshot(pathB));

    // Clôture depuis chemin B
    const closureB = buildFiscalYearClosure({
      fiscalYearId: "fy-2026",
      dossierId: DOSSIER,
      stocks: pathB.fiscalResult.stocks,
      computedAt: pathB.fiscalResult.computedAt,
      now: "2027-01-02T00:00:00.000Z",
    });
    const closureA = buildFiscalYearClosure({
      fiscalYearId: "fy-2026",
      dossierId: DOSSIER,
      stocks: pathA.fiscalResult.stocks,
      computedAt: pathA.fiscalResult.computedAt,
      now: "2027-01-02T00:00:00.000Z",
    });
    assert.deepEqual(closureA.stocks.deficits, closureB.stocks.deficits);
    assert.equal(closureA.stocks.amortissementsReportes, closureB.stocks.amortissementsReportes);
    assert.deepEqual(closureB.stocks.deficits, []);
    assert.equal(closureB.stocks.amortissementsReportes, 5000);
  });

  it("N+1 dérivé de la vraie clôture chemin B (pas de double addition)", () => {
    const draft = draftOracle();
    const opening = makeValidatedOpening({
      deficits: ORACLE_DEFICITS,
      amortissementsReportes: ORACLE_AMORT_OPEN,
    });
    const pathB = runDeclarationGeneration(
      draft,
      EXERCICE,
      undefined,
      undefined,
      undefined,
      undefined,
      opening,
    );
    assert.equal(pathB.status, "generated");
    if (pathB.status !== "generated") return;

    const closedN: FiscalYear = {
      id: "fy-2026",
      year: EXERCICE,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: DOSSIER,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2027-01-02T00:00:00.000Z",
      declarationGeneratedAt: "2027-01-01T00:00:00.000Z",
      closures: [
        buildFiscalYearClosure({
          fiscalYearId: "fy-2026",
          dossierId: DOSSIER,
          stocks: pathB.fiscalResult.stocks,
          computedAt: pathB.fiscalResult.computedAt,
          now: "2027-01-02T00:00:00.000Z",
        }),
      ],
    };

    const nextBase: FiscalYear = {
      id: "fy-2027",
      year: EXERCICE + 1,
      status: "draft",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: DOSSIER,
      previousFiscalYearId: closedN.id,
      createdAt: "2027-01-03T00:00:00.000Z",
      updatedAt: "2027-01-03T00:00:00.000Z",
    };

    const stocksNPlus1 = resolveStocksOuverture(nextBase, closedN);
    assert.equal(stocksNPlus1.status, "available");
    if (stocksNPlus1.status !== "available") return;
    assert.deepEqual(stocksNPlus1.stocks.deficits, []);
    assert.equal(stocksNPlus1.stocks.amortissementsReportes, 5000);
    assert.notEqual(stocksNPlus1.stocks.amortissementsReportes, ORACLE_AMORT_OPEN + 5000);

    // Même clôture → Opening interne : stock final transporté sans addition
    const adapted = adaptInternalOpening({
      closedFiscalYear: closedN,
      targetFiscalYear: EXERCICE + 1,
      archivedWorkspace: {
        fiscalYear: closedN,
        properties: [
          {
            id: "prop-1",
            label: "Bien",
            address: "1 rue X",
            city: "Lyon",
            postalCode: "69000",
          },
        ],
        documents: [],
        extractions: [],
        validationItems: [],
        ledgerEntries: [],
        declarationDraft: {
          completedSteps: [],
          siret: "12345678901234",
          siren: "123456789",
        },
      },
    });
    assert.equal(
      adapted.opening !== undefined,
      true,
      JSON.stringify(adapted.issues),
    );
    assert.equal(isAvailable(adapted.opening!.stocks.amortissementsReportes), true);
    if (isAvailable(adapted.opening!.stocks.amortissementsReportes)) {
      assert.equal(adapted.opening!.stocks.amortissementsReportes.value, 5000);
    }
    assert.equal(isAvailable(adapted.opening!.stocks.deficits), true);
    if (isAvailable(adapted.opening!.stocks.deficits)) {
      assert.deepEqual(adapted.opening!.stocks.deficits.value, []);
    }
  });
});

// ---------------------------------------------------------------------------
describe("Lot 3B — génération bloque unavailable (garde amont, pas F006)", () => {
  it("Opening deficits unavailable → génération blocked, pas de ?? []", () => {
    const opening = makeValidatedOpening({
      deficits: "unavailable",
      amortissementsReportes: 0,
    });
    const gen = runDeclarationGeneration(
      draftOracle(),
      EXERCICE,
      undefined,
      undefined,
      undefined,
      undefined,
      opening,
    );
    assert.equal(gen.status, "blocked");
    if (gen.status !== "blocked") return;
    assert.ok(gen.anomalies.some((a) => a.message.includes("DEFICITS_UNAVAILABLE")));
  });

  it("Opening amort unavailable → génération blocked, pas de ?? 0", () => {
    const opening = makeValidatedOpening({
      deficits: [],
      amortissementsReportes: "unavailable",
    });
    const gen = runDeclarationGeneration(
      draftOracle(),
      EXERCICE,
      undefined,
      undefined,
      undefined,
      undefined,
      opening,
    );
    assert.equal(gen.status, "blocked");
    if (gen.status !== "blocked") return;
    assert.ok(gen.anomalies.some((a) => a.message.includes("AMORT_STOCK_UNAVAILABLE")));
  });

  it("chemin stocksOuverture seul inchangé (pas d'Opening)", () => {
    const gen = runDeclarationGeneration(draftOracle(), EXERCICE, {
      deficits: ORACLE_DEFICITS,
      amortissementsReportes: ORACLE_AMORT_OPEN,
    });
    assert.equal(gen.status, "generated");
    if (gen.status !== "generated") return;
    assert.equal(gen.rfs.fiscalResult.amortNonDeduitExercice, 1000);
    assert.equal(gen.rfs.fiscalResult.stocks.amortissementsReportes, 5000);
  });
});

// ---------------------------------------------------------------------------
describe("Lot 3B — EXTERNAL_HISTORY reste fermé (preuve source)", () => {
  it("prior-history-eligibility.ts non modifié dans ce lot (EXTERNAL_HISTORY bloque toujours)", () => {
    const src = readFileSync(
      path.join(MODULE_DIR, "../declaration/prior-history-eligibility.ts"),
      "utf8",
    );
    assert.match(src, /EXTERNAL_HISTORY/);
    assert.match(src, /EXTERNAL_HISTORY_DECLARED/);
    // Le bridge n'est pas importé ici — pas d'activation production.
    assert.doesNotMatch(src, /resolveOpeningFiscalStocks|resolveCanonicalOpeningFiscalStocks/);
  });

  it("apply-amortissement-stocks.ts non modifié (F006 intouchable)", () => {
    const f006 = readFileSync(
      path.join(
        MODULE_DIR,
        "../../../../runtime/capabilities/f006/apply-amortissement-stocks.ts",
      ),
      "utf8",
    );
    assert.match(f006, /stockAmortissementsReportes \?\? 0/);
    assert.match(f006, /stockDeficitsAnterieurs \?\? \[\]/);
  });
});
