/**
 * Lot 4C.1 — extraction XLS/XLSX registre immobilisations → CandidateHistoricalAsset[].
 * Fixtures SYNTHÉTIQUES (pas des exports cabinet réels).
 *
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot4c1-depreciation-register-extract.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

import {
  extractDepreciationRegisterFromSpreadsheet,
  matchRegisterHeaderRoleForTest,
  parseRegisterAmount,
  type DepreciationRegisterExtractionResult,
} from "./extract-depreciation-register-spreadsheet";
import { isCandidatePresent, isCandidateAbsent } from "./candidate-value";

/** Marqueur explicite : fixtures synthétiques, pas exports cabinet. */
const SYNTHETIC = "synthetic_lot4c1_fixture";
const PUBLIC_PATTERN = "synthetic_public-pattern_fixture";

function buildWorkbook(sheets: Record<string, (string | number)[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }
  return wb;
}

function workbookToFile(wb: XLSX.WorkBook, fileName: string): File {
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([new Uint8Array(buffer)], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function extract(
  sheets: Record<string, (string | number)[][]>,
  fileName: string,
  targetFiscalYear = 2026,
  documentId = "doc-register-synth",
): Promise<DepreciationRegisterExtractionResult> {
  const file = workbookToFile(buildWorkbook(sheets), fileName);
  return extractDepreciationRegisterFromSpreadsheet({
    file,
    documentId,
    targetFiscalYear,
  });
}

function hasDiag(
  result: DepreciationRegisterExtractionResult,
  code: string,
): boolean {
  return result.diagnostics.some((d) => d.code === code);
}

const HAPPY_HEADERS = [
  "N° immobilisation",
  "Libellé",
  "Valeur brute",
  "Amortissements antérieurs",
  "Date mise en service",
  "Durée",
  "Méthode",
  "Catégorie",
] as const;

const HAPPY_ROWS: (string | number)[][] = [
  [...HAPPY_HEADERS],
  ["SRC-TER-01", "Terrain", 60_000, 0, "", "", "", "terrain"],
  ["SRC-BAT-01", "Bâtiment", 180_000, 36_000, "15/03/2020", 40, "Linéaire", "batiment"],
  ["SRC-MOB-01", "Mobilier", 12_000, 4_800, "15/03/2020", 10, "Linéaire", "mobilier"],
];

describe(`Lot 4C.1 — ${SYNTHETIC} Fixture A happy path`, () => {
  it("extrait terrain / bâtiment / mobilier avec provenance et zeros conservés", async () => {
    const result = await extract({ Registre: HAPPY_ROWS }, `${SYNTHETIC}-A.xlsx`);
    assert.equal(result.status, "extracted");
    assert.equal(result.candidates.length, 3);

    const terrain = result.candidates.find((c) => c.sourceAssetRef === "SRC-TER-01");
    const bat = result.candidates.find((c) => c.sourceAssetRef === "SRC-BAT-01");
    const mob = result.candidates.find((c) => c.sourceAssetRef === "SRC-MOB-01");
    assert.ok(terrain && bat && mob);

    assert.ok(isCandidatePresent(terrain.coutBrut));
    assert.equal(terrain.coutBrut.value, 60_000);
    assert.ok(isCandidatePresent(terrain.cumulOuverture));
    assert.equal(terrain.cumulOuverture.value, 0, "0 explicite ≠ missing");
    assert.ok(isCandidatePresent(terrain.classification));
    assert.equal(terrain.classification.value, "terrain");
    assert.ok(isCandidatePresent(terrain.nonAmortizable));
    assert.equal(terrain.nonAmortizable.value, true);
    assert.ok(isCandidateAbsent(terrain.propertyId));
    assert.ok(isCandidateAbsent(terrain.prorataConvention));

    assert.ok(isCandidatePresent(bat.startDate));
    assert.equal(bat.startDate.value, "2020-03-15");
    assert.ok(isCandidatePresent(bat.durationYears));
    assert.equal(bat.durationYears.value, 40);
    assert.ok(isCandidatePresent(bat.method));
    assert.equal(bat.method.value, "lineaire");
    assert.ok(isCandidatePresent(bat.classification));
    assert.equal(bat.classification.value, "batiment");

    assert.ok(isCandidatePresent(mob.cumulOuverture));
    assert.equal(mob.cumulOuverture.value, 4_800);

    for (const c of result.candidates) {
      assert.match(c.candidateKey, /^reg:/);
      assert.notEqual(c.candidateKey, c.sourceAssetRef);
      if (isCandidatePresent(c.label)) {
        assert.ok(c.label.provenance.documentRole === "depreciation_register");
        assert.ok(c.label.provenance.documentId === "doc-register-synth");
        assert.ok(c.label.provenance.sourceRef?.includes(":"));
        assert.ok(c.label.provenance.confidence);
      }
      assert.ok(isCandidateAbsent(c.propertyId));
    }
  });
});

describe(`Lot 4C.1 — ${SYNTHETIC} Fixture B TOTAL`, () => {
  it("n'émet pas de candidate pour TOTAL", async () => {
    const rows: (string | number)[][] = [
      [...HAPPY_HEADERS],
      ["1", "Bâtiment", 100_000, 10_000, "01/01/2020", 40, "Linéaire", "batiment"],
      ["", "TOTAL", 100_000, 10_000, "", "", "", ""],
      ["", "Total général", 100_000, 10_000, "", "", "", ""],
      ["", "Sous-total", 50_000, 5_000, "", "", "", ""],
    ];
    const result = await extract({ Registre: rows }, `${SYNTHETIC}-B.xlsx`);
    assert.equal(result.candidates.length, 1);
    assert.ok(isCandidatePresent(result.candidates[0]!.label));
    assert.equal(result.candidates[0]!.label.value, "Bâtiment");
    assert.ok(hasDiag(result, "TOTAL_ROW_SKIPPED"));
  });
});

describe(`Lot 4C.1 — ${SYNTHETIC} Fixture C cumul ambigu`, () => {
  it("ne mappe jamais amortissements cumulés / dotation / VNC vers cumulOuverture", async () => {
    // Durée fournie uniquement pour rendre la feuille éligible (label+brut+signal plan)
    // sans colonne cumul d'ouverture sûre.
    const rows: (string | number)[][] = [
      ["Libellé", "Valeur brute", "Amortissements cumulés", "Dotation N", "VNC", "Durée"],
      ["Bâtiment", 180_000, 50_000, 4_500, 130_000, 40],
    ];
    const result = await extract({ Registre: rows }, `${SYNTHETIC}-C.xlsx`);
    assert.equal(result.status, "review_required");
    assert.equal(result.candidates.length, 1);
    const asset = result.candidates[0]!;
    assert.ok(isCandidateAbsent(asset.cumulOuverture));
    assert.ok(isCandidatePresent(asset.coutBrut));
    assert.equal(asset.coutBrut.value, 180_000);
    assert.ok(hasDiag(result, "AMBIGUOUS_CUMULATIVE_COLUMN"));
    assert.ok(hasDiag(result, "DOTATION_IGNORED"));
    assert.ok(hasDiag(result, "VNC_IGNORED"));
  });
});

describe(`Lot 4C.1 — ${SYNTHETIC} Fixture D missing plan`, () => {
  it("crée une candidate partielle sans inventer startDate/durée/méthode/prorata", async () => {
    const rows: (string | number)[][] = [
      ["Libellé", "Valeur brute", "Amortissements antérieurs"],
      ["Bâtiment", 180_000, 36_000],
    ];
    const result = await extract({ Registre: rows }, `${SYNTHETIC}-D.xlsx`);
    assert.equal(result.candidates.length, 1);
    const asset = result.candidates[0]!;
    assert.ok(isCandidatePresent(asset.label));
    assert.ok(isCandidatePresent(asset.coutBrut));
    assert.ok(isCandidatePresent(asset.cumulOuverture));
    assert.ok(isCandidateAbsent(asset.startDate));
    assert.ok(isCandidateAbsent(asset.durationYears));
    assert.ok(isCandidateAbsent(asset.method));
    assert.ok(isCandidateAbsent(asset.prorataConvention));
    assert.ok(isCandidateAbsent(asset.propertyId));
  });
});

describe(`Lot 4C.1 — ${SYNTHETIC} Fixture E acquisition date only`, () => {
  it("ne mappe pas date acquisition → startDate", async () => {
    const rows: (string | number)[][] = [
      ["Libellé", "Valeur brute", "Amortissements antérieurs", "Date acquisition"],
      ["Bâtiment", 180_000, 36_000, "10/01/2020"],
    ];
    const result = await extract({ Registre: rows }, `${SYNTHETIC}-E.xlsx`);
    assert.equal(result.status, "review_required");
    assert.equal(result.candidates.length, 1);
    assert.ok(isCandidateAbsent(result.candidates[0]!.startDate));
    assert.ok(hasDiag(result, "ACQUISITION_DATE_ONLY"));
  });
});

describe(`Lot 4C.1 — ${SYNTHETIC} Fixture F rate only`, () => {
  it("ne convertit jamais 5% → 20 ans", async () => {
    const rows: (string | number)[][] = [
      ["Libellé", "Valeur brute", "Amortissements antérieurs", "Taux"],
      ["Bâtiment", 180_000, 36_000, "5%"],
    ];
    const result = await extract({ Registre: rows }, `${SYNTHETIC}-F.xlsx`);
    assert.equal(result.status, "review_required");
    assert.equal(result.candidates.length, 1);
    assert.ok(isCandidateAbsent(result.candidates[0]!.durationYears));
    assert.ok(hasDiag(result, "RATE_WITHOUT_DURATION"));
  });
});

describe(`Lot 4C.1 — ${SYNTHETIC} Fixture G bad cumulative`, () => {
  it("diagnostique cumul > coût sans correction", async () => {
    const rows: (string | number)[][] = [
      ["Libellé", "Valeur brute", "Amortissements antérieurs"],
      ["Bâtiment", 10_000, 12_000],
    ];
    const result = await extract({ Registre: rows }, `${SYNTHETIC}-G.xlsx`);
    assert.equal(result.status, "review_required");
    assert.equal(result.candidates.length, 1);
    const asset = result.candidates[0]!;
    assert.ok(isCandidatePresent(asset.coutBrut));
    assert.equal(asset.coutBrut.value, 10_000);
    assert.ok(isCandidatePresent(asset.cumulOuverture));
    assert.equal(asset.cumulOuverture.value, 12_000);
    assert.ok(hasDiag(result, "CUMUL_EXCEEDS_COST"));
  });
});

describe(`Lot 4C.1 — ${SYNTHETIC} Fixture H multiple sheets`, () => {
  it("ne sélectionne pas arbitrairement la première feuille", async () => {
    const sheetA: (string | number)[][] = [
      ["Libellé", "Valeur brute", "Amortissements antérieurs"],
      ["Bien A", 100_000, 10_000],
    ];
    const sheetB: (string | number)[][] = [
      ["Libellé", "Valeur brute", "Amortissements antérieurs"],
      ["Bien B", 200_000, 20_000],
    ];
    const result = await extract(
      { Feuil1: sheetA, Feuil2: sheetB },
      `${SYNTHETIC}-H.xlsx`,
    );
    assert.equal(result.status, "review_required");
    assert.equal(result.candidates.length, 0);
    assert.ok(hasDiag(result, "AMBIGUOUS_SHEET"));
  });
});

describe(`Lot 4C.1 — ${PUBLIC_PATTERN} variantes lexicales`, () => {
  it("variante 1 : Désignation / Valeur d'origine / Durée d'amortissement", async () => {
    const rows: (string | number)[][] = [
      [
        "Désignation",
        "Date mise en service",
        "Valeur d'origine",
        "Durée d'amortissement",
        "Amortissements antérieurs",
      ],
      ["Bâtiment", "15/03/2020", 180_000, 40, 36_000],
    ];
    const result = await extract({ Registre: rows }, `${PUBLIC_PATTERN}-v1.xlsx`);
    assert.equal(result.candidates.length, 1);
    const a = result.candidates[0]!;
    assert.ok(isCandidatePresent(a.label));
    assert.equal(a.label.value, "Bâtiment");
    assert.ok(isCandidatePresent(a.coutBrut));
    assert.equal(a.coutBrut.value, 180_000);
    assert.ok(isCandidatePresent(a.cumulOuverture));
    assert.equal(a.cumulOuverture.value, 36_000);
    assert.ok(isCandidatePresent(a.startDate));
    assert.ok(isCandidatePresent(a.durationYears));
  });

  it("variante 2 : Immobilisation / Amortissements cumulés début", async () => {
    const rows: (string | number)[][] = [
      ["Immobilisation", "Valeur brute", "Amortissements cumulés début", "Durée", "Méthode"],
      ["Mobilier", 12_000, 4_800, 10, "Linéaire"],
    ];
    const result = await extract({ Registre: rows }, `${PUBLIC_PATTERN}-v2.xlsx`);
    assert.equal(result.candidates.length, 1);
    const a = result.candidates[0]!;
    assert.ok(isCandidatePresent(a.label));
    assert.ok(isCandidatePresent(a.cumulOuverture));
    assert.equal(a.cumulOuverture.value, 4_800);
    assert.ok(isCandidatePresent(a.method));
    assert.equal(a.method.value, "lineaire");
  });
});

describe("Lot 4C.1 — sécurité sémantique", () => {
  it("0 ≠ missing ; cellule vide ≠ 0", () => {
    assert.equal(parseRegisterAmount("0"), 0);
    assert.equal(parseRegisterAmount("0,00"), 0);
    assert.equal(parseRegisterAmount(""), null);
    assert.equal(parseRegisterAmount("   "), null);
  });

  it("même libellé → deux candidates distinctes", async () => {
    const rows: (string | number)[][] = [
      ["Libellé", "Valeur brute", "Amortissements antérieurs"],
      ["Mobilier", 5_000, 1_000],
      ["Mobilier", 3_000, 500],
    ];
    const result = await extract({ Registre: rows }, `${SYNTHETIC}-dup.xlsx`);
    assert.equal(result.candidates.length, 2);
    assert.notEqual(result.candidates[0]!.candidateKey, result.candidates[1]!.candidateKey);
    assert.ok(!result.candidates[0]!.candidateKey.includes("Mobilier"));
  });

  it("VNC / base amortissable ne deviennent pas coutBrut", async () => {
    const rows: (string | number)[][] = [
      ["Libellé", "Valeur brute", "Base amortissable", "VNC", "Amortissements antérieurs"],
      ["Bâtiment", 180_000, 150_000, 140_000, 30_000],
    ];
    const result = await extract({ Registre: rows }, `${SYNTHETIC}-vnc.xlsx`);
    assert.equal(result.candidates.length, 1);
    assert.ok(isCandidatePresent(result.candidates[0]!.coutBrut));
    assert.equal(result.candidates[0]!.coutBrut.value, 180_000);
    assert.ok(hasDiag(result, "BASE_AMORTISSABLE_NOT_GROSS_COST"));
    assert.ok(hasDiag(result, "VNC_IGNORED"));
  });

  it("cumul fin jamais → cumulOuverture", async () => {
    const rows: (string | number)[][] = [
      ["Libellé", "Valeur brute", "Amortissements cumulés fin"],
      ["Bâtiment", 180_000, 40_000],
    ];
    const result = await extract({ Registre: rows }, `${SYNTHETIC}-fin.xlsx`);
    // eligible via label+gross+? need extra signal — only closing cumul, no opening/start/duration/ref
    // Sheet may be unsupported. If somehow eligible, cumul must be missing.
    if (result.candidates.length > 0) {
      assert.ok(isCandidateAbsent(result.candidates[0]!.cumulOuverture));
    } else {
      assert.equal(result.status, "unsupported");
    }
  });

  it("headers bornés — pas de fuzzy", () => {
    assert.equal(matchRegisterHeaderRoleForTest("Valeur brute"), "gross_cost");
    assert.equal(matchRegisterHeaderRoleForTest("Amortissements antérieurs"), "opening_cumulative");
    assert.equal(matchRegisterHeaderRoleForTest("amortissement"), null);
    assert.equal(matchRegisterHeaderRoleForTest("valeur aproximative brute"), null);
  });

  it("confiance élevée n'implique aucune validation Opening", async () => {
    const result = await extract({ Registre: HAPPY_ROWS }, `${SYNTHETIC}-conf.xlsx`);
    const bat = result.candidates.find((c) => c.sourceAssetRef === "SRC-BAT-01");
    assert.ok(bat && isCandidatePresent(bat.coutBrut));
    assert.ok((bat.coutBrut.provenance.confidence?.value ?? 0) >= 0.85);
    // Pas d'appel mapper / Opening dans ce module — smoke: status documentaire seulement
    assert.ok(["extracted", "review_required", "unsupported"].includes(result.status));
  });

  it("sourceAssetRef n'est pas un ID Fiscal AI minté", async () => {
    const result = await extract({ Registre: HAPPY_ROWS }, `${SYNTHETIC}-ref.xlsx`);
    for (const c of result.candidates) {
      assert.ok(!c.candidateKey.match(/^asset-/));
      assert.ok(!c.candidateKey.match(/^f010-/));
      if (c.sourceAssetRef) {
        assert.notEqual(c.sourceAssetRef, c.candidateKey);
      }
    }
  });
});

describe("Lot 4C.1 — frontières architecturales", () => {
  it("n'importe pas le mapper accepted→Opening ni F010/F014", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("./extract-depreciation-register-spreadsheet.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(src, /mapAcceptedCandidateAssetsToOpening/);
    assert.doesNotMatch(src, /computeAmortizationPlan|composePlanAmortissement/);
    assert.doesNotMatch(src, /resolvePriorHistoryEligibility/);
    assert.doesNotMatch(src, /from ["']@\/runtime\/capabilities\/f010/);
    assert.doesNotMatch(src, /from ["']@\/runtime\/capabilities\/f014/);
    assert.doesNotMatch(src, /map2033/);
    assert.doesNotMatch(src, /from ["']@\/lib\/lmnp\/services\/fiscal-year-opening/);
  });
});
