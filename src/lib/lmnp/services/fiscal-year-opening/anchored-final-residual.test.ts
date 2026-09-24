/**
 * Reprise ancrée — complément de dernière annuité = reliquat attesté B − C0.
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-opening/anchored-final-residual.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assemblePlan } from "@/runtime/capabilities/f010/assemble-plan";
import { prorataPremiereAnnee } from "@/runtime/capabilities/f010/prorata-premiere-annee";
import { round2 } from "@/runtime/capabilities/f010/types";
import { computeOpeningContentHash } from "./content-hash";
import { available, unavailable } from "./opening-fact";
import {
  applyResolvedOpeningDepreciation,
  resolveOpeningDepreciation,
} from "./resolve-opening-depreciation";
import type { FiscalYearOpening, OpeningAsset } from "./types";

const DOSSIER = "dossier-final-residual";
const PROP = "prop-1";

function validatedOpening(params: {
  year: number;
  asset: OpeningAsset;
}): FiscalYearOpening {
  const opening: FiscalYearOpening = {
    openingId: `opening-${params.year}-${params.asset.id}`,
    revision: 1,
    targetFiscalYear: params.year,
    dossierId: DOSSIER,
    source: {
      kind: "external_takeover",
      takeoverId: "takeover-residual",
      sourceFiscalYear: params.year - 1,
    },
    stocks: {
      deficits: available([]),
      amortissementsReportes: available(0),
    },
    assets: available([params.asset]),
    loans: unavailable("hors scope"),
    patrimoine: {
      ouvertureCompteExploitant: unavailable("hors scope"),
      ran: unavailable("hors scope"),
      tresorerieOuverture: unavailable("hors scope"),
    },
    properties: available([{ propertyId: PROP, label: "Bien" }]),
    identity: unavailable("hors scope"),
    provenance: {
      source: { fieldPath: "source", sourceKind: "external", sourceRef: "takeover-residual" },
      "stocks.deficits": { fieldPath: "stocks.deficits", sourceKind: "external" },
      "stocks.amortissementsReportes": {
        fieldPath: "stocks.amortissementsReportes",
        sourceKind: "external",
      },
    },
    validation: { status: "pending" },
  };
  opening.validation = {
    status: "validated",
    openingRevision: opening.revision,
    contentHash: computeOpeningContentHash(opening),
    validatedAt: "2026-01-01T00:00:00.000Z",
    validator: "anchored-final-residual",
  };
  return opening;
}

function linearAsset(params: {
  id: string;
  brut: number;
  cumul: number | "missing";
  startDate: string;
  durationYears: number;
}): OpeningAsset {
  return {
    id: params.id,
    propertyId: PROP,
    label: params.id,
    categorie: "composant",
    origin: "historique",
    coutBrut: available(params.brut),
    cumulOuverture:
      params.cumul === "missing"
        ? unavailable("cumul absent")
        : available(params.cumul),
    plan: available({
      kind: "amortizable",
      startDate: params.startDate,
      durationYears: params.durationYears,
    }),
  };
}

function charge(params: {
  id: string;
  brut: number;
  cumul: number | "missing";
  startDate: string;
  durationYears: number;
  year: number;
}) {
  const opening = validatedOpening({
    year: params.year,
    asset: linearAsset(params),
  });
  const resolved = resolveOpeningDepreciation({
    opening,
    expectedDossierId: DOSSIER,
    expectedExerciceFiscal: params.year,
  });
  assert.equal(resolved.status, "ready", JSON.stringify(resolved));
  if (resolved.status !== "ready") throw new Error("resolve");
  const applied = applyResolvedOpeningDepreciation({ resolved });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  if (!applied.ok) throw new Error("apply");
  const ligne = applied.lignes.find((item) => item.id === params.id);
  assert.ok(ligne);
  if (!ligne) throw new Error("ligne");
  assert.equal("prorataConvention" in ligne, false);
  return ligne;
}

describe("reprise ancrée — complément de dernière annuité", () => {
  it("B80700 — reliquat 58,19 soldé, prorata historique absent", () => {
    const ligne = charge({
      id: "B80700",
      brut: 529,
      cumul: 470.81,
      startDate: "2018-07-19",
      durationYears: 5,
      year: 2023,
    });
    assert.equal(ligne.dotationExercice, 58.19);
    assert.equal(ligne.amortissementsCumules, 529);
    assert.equal(ligne.vnc, 0);
  });

  it("B81100, B80200, C00900 — même complément attesté", () => {
    const cases = [
      { id: "B81100", brut: 1125, cumul: 919.37, startDate: "2018-11-30", durationYears: 5, year: 2023, dotation: 205.63 },
      { id: "B80200", brut: 9500, cumul: 9246.66, startDate: "2018-02-19", durationYears: 5, year: 2023, dotation: 253.34 },
      { id: "C00900", brut: 1832.91, cumul: 1398.44, startDate: "2020-09-17", durationYears: 3, year: 2023, dotation: 434.47 },
    ] as const;
    for (const row of cases) {
      const ligne = charge(row);
      assert.equal(ligne.dotationExercice, row.dotation, row.id);
      assert.equal(ligne.amortissementsCumules, row.brut, row.id);
      assert.equal(ligne.vnc, 0, row.id);
    }
  });

  it("B90100 — année intermédiaire : annuité pleine, reliquat conservé", () => {
    const ligne = charge({
      id: "B90100",
      brut: 1506.85,
      cumul: 1182.88,
      startDate: "2019-01-28",
      durationYears: 5,
      year: 2023,
    });
    assert.equal(ligne.dotationExercice, 301.37);
    assert.equal(ligne.amortissementsCumules, 1484.25);
    assert.equal(ligne.vnc, 22.6);
  });

  it("actif déjà soldé — dotation nulle", () => {
    const ligne = charge({
      id: "B70500",
      brut: 1292.81,
      cumul: 1292.81,
      startDate: "2017-05-31",
      durationYears: 5,
      year: 2023,
    });
    assert.equal(ligne.dotationExercice, 0);
    assert.equal(ligne.amortissementsCumules, 1292.81);
    assert.equal(ligne.vnc, 0);
  });

  it("elapsed > n et VNC encore positive — pas de solde", () => {
    const ligne = charge({
      id: "depasse",
      brut: 529,
      cumul: 470.81,
      startDate: "2018-07-19",
      durationYears: 5,
      year: 2024,
    });
    assert.equal(ligne.dotationExercice, 0);
    assert.equal(ligne.amortissementsCumules, 470.81);
    assert.equal(ligne.vnc, 58.19);
  });

  it("elapsed = n mais C0 sous (n−1) annuités — pas de solde", () => {
    const ligne = charge({
      id: "trou",
      brut: 529,
      cumul: 100,
      startDate: "2018-07-19",
      durationYears: 5,
      year: 2023,
    });
    assert.equal(ligne.dotationExercice, 0);
    assert.equal(ligne.amortissementsCumules, 100);
    assert.equal(ligne.vnc, 429);
  });

  it("reliquats 0,01 / 0,50 / 1,00 / 58,19 pris au centime", () => {
    for (const remaining of [0.01, 0.5, 1, 58.19]) {
      const brut = 529;
      const ligne = charge({
        id: `r-${remaining}`,
        brut,
        cumul: round2(brut - remaining),
        startDate: "2018-07-19",
        durationYears: 5,
        year: 2023,
      });
      assert.equal(ligne.dotationExercice, remaining);
      assert.equal(ligne.amortissementsCumules, brut);
      assert.equal(ligne.vnc, 0);
    }
  });

  it("N solde 58,19 ; N+1 reste à cumul = B et dotation 0", () => {
    const yearN = charge({
      id: "B80700",
      brut: 529,
      cumul: 470.81,
      startDate: "2018-07-19",
      durationYears: 5,
      year: 2023,
    });
    assert.equal(yearN.dotationExercice, 58.19);
    assert.equal(yearN.amortissementsCumules, 529);
    assert.equal(yearN.vnc, 0);

    const yearN1 = charge({
      id: "B80700",
      brut: 529,
      cumul: yearN.amortissementsCumules,
      startDate: "2018-07-19",
      durationYears: 5,
      year: 2024,
    });
    assert.equal(yearN1.dotationExercice, 0);
    assert.equal(yearN1.amortissementsCumules, 529);
    assert.equal(yearN1.vnc, 0);
  });

  it("C0 absent bloque la résolution", () => {
    const opening = validatedOpening({
      year: 2023,
      asset: linearAsset({
        id: "C30300",
        brut: 507.38,
        cumul: "missing",
        startDate: "2023-03-23",
        durationYears: 5,
      }),
    });
    const resolved = resolveOpeningDepreciation({ opening, expectedExerciceFiscal: 2023 });
    assert.equal(resolved.status, "blocked");
    if (resolved.status === "blocked") {
      assert.ok(resolved.issues.some((issue) => issue.code === "CUMUL_UNAVAILABLE"));
    }
  });

  it("C0 > B bloque", () => {
    const opening = validatedOpening({
      year: 2023,
      asset: linearAsset({
        id: "incoherent",
        brut: 529,
        cumul: 600,
        startDate: "2018-07-19",
        durationYears: 5,
      }),
    });
    const resolved = resolveOpeningDepreciation({ opening, expectedExerciceFiscal: 2023 });
    assert.equal(resolved.status, "blocked");
  });

  it("plan Fiscal AI 10 000 / 5 ans / 01-07-2021 inchangé", () => {
    const composant = {
      label: "Actif",
      montant: 10_000,
      dureeAnnees: 5,
      dotationAnnuelle: round2(10_000 / 5),
    };
    const prorata = prorataPremiereAnnee({
      composantsBati: [composant],
      composantsMobilier: [],
      dateDebutAmortissement: "2021-07-01",
      methodeProrata: "jours",
      exerciceFiscal: 2021,
    });
    const d1 = prorata.dotationsAnnee1[0]!.dotationProratisee;
    const expected = [1002.8, 2000, 2000, 2000, 2000, 997.2, 0];
    expected.forEach((dotation, index) => {
      const year = 2021 + index;
      const assembled = assemblePlan({
        composantsBati: [composant],
        composantsMobilier: [],
        dotationsAnnee1: [{ label: "Actif", dotationProratisee: d1 }],
        premiereAnnee: 2021,
        exerciceFiscal: year,
      });
      assert.equal(assembled.plan.lignes[0]!.dotationExercice, dotation, String(year));
    });
  });
});
