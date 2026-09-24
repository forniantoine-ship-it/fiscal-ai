/**
 * Lot 5.4-A — test réel GEFFROY FRERES (premier oracle PDF réel).
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot54a-geffroy-real-pdf.test.ts
 *
 * Bytes PDF réels (lecture native uniquement — prouve hasNativeText=true sur
 * ce document réel, aucun réseau, aucun modèle vision).
 *
 * IMPORTANT — portée de ce test :
 * Le visionRequester est un DOUBLE SCRIPTÉ, transcrit manuellement à partir
 * d'une lecture indépendante du PDF (oracle établi AVANT toute exécution du
 * pipeline, cf. rapport de mission). Aucun appel à un modèle vision réel
 * n'est fait ici — ce lot livre le contrat + pipeline déterministe, pas une
 * intégration serveur GPT vision (hors périmètre Lot 5.4-A). Ce test prouve
 * le mapping / l'exclusion des sorties / le contrôle de complétude sur des
 * données réelles, PAS la fiabilité d'un futur appel vision en production.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isCandidateAbsent, isCandidatePresent } from "./candidate-value";
import { extractDepreciationRegisterFromPdf } from "./extract-depreciation-register-pdf";
import type {
  DepreciationRegisterPdfRow,
  DepreciationRegisterVisionRequester,
} from "./depreciation-register-pdf-row";
import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";

const DOC = "doc-geffroy-2023";

const GEFFROY_PDF_PATH =
  "/Users/forniantoine/Desktop/liasse fec aide/reprise fiscale test/dossier sans titre/GEFFROY FRERES - alortissementsociaux 2023 (glissés).pdf";

function loadGeffroyFile(): File {
  const bytes = readFileSync(GEFFROY_PDF_PATH);
  const copy = Uint8Array.from(bytes);
  return new File([copy], path.basename(GEFFROY_PDF_PATH), { type: "application/pdf" });
}

function asset(
  assetRef: string,
  label: string,
  dateRaw: string,
  grossCostRaw: string,
  openingCumulativeRaw: string | undefined,
  methodRaw: string,
  durationRaw: string,
  pageNumber: number,
): DepreciationRegisterPdfRow {
  return {
    rowType: "asset",
    pageNumber,
    assetRef,
    label,
    acquisitionDateRaw: dateRaw,
    startDateRaw: dateRaw,
    grossCostRaw,
    openingCumulativeRaw,
    methodRaw,
    durationRaw,
    rawSnippet: `${assetRef} ${label} ${dateRaw} ${grossCostRaw} ${openingCumulativeRaw ?? ""}`,
  };
}

function subtotal(scopeLabel: string, pageNumber: number): DepreciationRegisterPdfRow {
  return {
    rowType: "subtotal",
    pageNumber,
    scopeLabel,
    rawSnippet: scopeLabel,
  };
}

// Transcription manuelle du registre réel GEFFROY (pages "Edition des
// dotations" p.2-3) — oracle établi indépendamment avant exécution.
// Les en-têtes de compte PCG sont des subtotals documentaires réels.
const PAGE1_ROWS: DepreciationRegisterPdfRow[] = [
  // Compte 21540000 — Matériels et outillages
  subtotal("Compte 21540000", 1),
  asset("B70500", "Teletower telescopique Jefco", "31/05/2017", "1 292,81", "1 292,81", "L", "05 - 00", 1),
  asset("B80400", "JEFCO ponceuse", "30/04/2018", "1 559,91", undefined, "N", "00 - 00", 1),
  asset("B80700", "LA PLATEFORME karcher novipro", "19/07/2018", "529,00", "470,81", "L", "05 - 00", 1),
  asset("B81100", "ZOLPAN echaffaudage", "30/11/2018", "1 125,00", "919,37", "L", "05 - 00", 1),
  asset("B90100", "ZOLPAN graco pisto", "28/01/2019", "1 506,85", "1 182,88", "L", "05 - 00", 1),
  asset("B91100", "ZOLPAN planex lhs 225", "30/11/2019", "1 449,00", "894,35", "L", "05 - 00", 1),
  asset("C01000", "Défonceuse OF 1010 EBQ-Plus", "25/10/2020", "570,90", "249,29", "L", "05 - 00", 1),
  asset("C01001", "Fraiseuse Df 500 Q set DOMINO", "25/10/2020", "886,75", "387,21", "L", "05 - 00", 1),
  asset("C01100", "Scie semi stationnaire CS 50 E", "30/11/2020", "880,00", "367,16", "L", "05 - 00", 1),
  asset("C01101", "Table mobile de sciage", "30/11/2020", "854,40", "356,47", "L", "05 - 00", 1),
  asset("C11200", "Lève plaque de platre", "03/12/2021", "598,55", "129,02", "L", "05 - 00", 1),
  asset("C20700", "scie à onglets", "09/07/2022", "643,03", "61,45", "L", "05 - 00", 1),
  asset("C30300", "pONCEUSE EXCENTRIQUE ETS EC150", "23/03/2023", "507,38", undefined, "L", "05 - 00", 1),
  asset("C31000", "SCIE A ONGLET RADIALE KAPEX", "02/10/2023", "666,89", undefined, "L", "05 - 00", 1),
  asset("C40200", "PONCEUSE ROTO EXCENTRIQUE RO", "22/02/2023", "591,88", undefined, "L", "05 - 00", 1),
  // Compte 21820000 — Matériel de transport
  subtotal("Compte 21820000", 1),
  asset("B80200", "PEUGEOT EXPERT VU", "19/02/2018", "9 500,00", "9 246,66", "L", "05 - 00", 1),
  asset("B90800", "RENAULT TRAFIC EE-286-XG", "28/08/2019", "7 799,37", "5 212,56", "L", "05 - 00", 1),
  asset("C10200", "MASTER III EY-332-ND RENAULT", "08/02/2021", "15 668,24", "5 945,23", "L", "05 - 00", 1),
];

const PAGE2_ROWS: DepreciationRegisterPdfRow[] = [
  // Compte 21830000 — Matériel de bureau et matériel
  subtotal("Compte 21830000", 2),
  {
    rowType: "exit",
    pageNumber: 2,
    assetRef: "B71200",
    label: "2 iphone Apple",
    acquisitionDateRaw: "01/12/2017",
    grossCostRaw: "2 215,00",
    openingCumulativeRaw: "2 215,00",
    exitDateRaw: "31/12/2023",
    exitLabelRaw: "Except. (Sortie tot.)",
    rawSnippet: "B71200 2 iphone Apple 01/12/2017 Except. (Sortie tot.) 2 215,00 2 215,00",
  },
  asset("C00900", "PC portable HP spectrex360", "17/09/2020", "1 832,91", "1 398,44", "L", "03 - 00", 2),
  asset("C11100", "APPLE MACBOOK", "20/11/2021", "999,99", "371,29", "L", "03 - 00", 2),
  asset("C21100", "APPLE ORDINATEUR", "14/11/2022", "1 540,83", "67,05", "L", "03 - 00", 2),
  asset("C21200", "IPHONE 14 APPLE", "13/12/2022", "1 340,83", "22,35", "L", "03 - 00", 2),
  // Totaux documentaires imprimés (page 3 réelle du PDF)
  {
    rowType: "total",
    pageNumber: 2,
    scopeLabel: "Total",
    grossCostRaw: "54 559,52",
    openingCumulativeRaw: "30 789,40",
    rawSnippet: "Total 54 559,52 30 789,40",
  },
  {
    rowType: "total",
    pageNumber: 2,
    scopeLabel: "Total Sorties",
    grossCostRaw: "2 215,00",
    openingCumulativeRaw: "2 215,00",
    rawSnippet: "Total Sorties 2 215,00 2 215,00",
  },
  {
    rowType: "total",
    pageNumber: 2,
    scopeLabel: "Total Hors Sorties",
    grossCostRaw: "52 344,52",
    openingCumulativeRaw: "28 574,40",
    rawSnippet: "Total Hors Sorties 52 344,52 28 574,40",
  },
];

function scriptedVisionRequester(): DepreciationRegisterVisionRequester {
  return async ({ pageNumber }) => {
    if (pageNumber === 1) return { rows: PAGE1_ROWS };
    if (pageNumber === 2) return { rows: PAGE2_ROWS };
    return { rows: [] };
  };
}

function twoPageStubRasterizer(): (file: File) => Promise<RasterPageImage[]> {
  return async () => [
    { pageNumber: 1, mimeType: "image/png", base64: "AAAA" },
    { pageNumber: 2, mimeType: "image/png", base64: "AAAA" },
  ];
}

describe("Lot 5.4-A — GEFFROY FRERES (PDF réel)", () => {
  it("PARSER CONTRACT (Vision scriptée) — comptes PCG de section propagent pcgAccountCode", async () => {
    // Ce test prouve le contrat de parsing après Vision, PAS un appel Vision live.
    // Les subtotals « Compte 2154/2182/2183 » sont injectés dans l'oracle scripté
    // (transcription documentaire), pas produits par un modèle OpenAI.
    const result = await extractDepreciationRegisterFromPdf({
      file: loadGeffroyFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: twoPageStubRasterizer(),
      visionRequester: scriptedVisionRequester(),
    });

    const byRef = (ref: string) => result.candidates.find((c) => c.sourceAssetRef === ref);
    const materiel = byRef("B70500");
    const transport = byRef("B80200");
    const bureau = byRef("C00900");
    assert.ok(materiel?.pcgAccountCode && isCandidatePresent(materiel.pcgAccountCode));
    assert.equal(materiel!.pcgAccountCode!.value, "21540000");
    assert.ok(transport?.pcgAccountCode && isCandidatePresent(transport.pcgAccountCode));
    assert.equal(transport!.pcgAccountCode!.value, "21820000");
    assert.ok(bureau?.pcgAccountCode && isCandidatePresent(bureau.pcgAccountCode));
    assert.equal(bureau!.pcgAccountCode!.value, "21830000");
  });

  it("détecte hasNativeText=true sur le PDF réel (extraction native pdfjs réelle)", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: loadGeffroyFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: twoPageStubRasterizer(),
      visionRequester: scriptedVisionRequester(),
    });

    assert.equal(result.hasNativeText, true);
  });

  it("extrait 22 candidates (23 lignes registre - 1 sortie), sortie exclue et tracée", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: loadGeffroyFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: twoPageStubRasterizer(),
      visionRequester: scriptedVisionRequester(),
    });

    assert.equal(result.candidates.length, 22);
    assert.equal(result.excludedExitRows.length, 1);
    assert.equal(result.excludedExitRows[0].assetRef, "B71200");
    assert.ok(
      !result.candidates.some((c) => c.sourceAssetRef === "B71200"),
      "la sortie B71200 ne doit jamais apparaître comme candidate",
    );
  });

  it("B80400 reste un candidate (coutBrut present, cumulOuverture missing) — jamais une règle métier inventée", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: loadGeffroyFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: twoPageStubRasterizer(),
      visionRequester: scriptedVisionRequester(),
    });

    const b80400 = result.candidates.find((c) => c.sourceAssetRef === "B80400");
    assert.ok(b80400);
    assert.ok(isCandidatePresent(b80400!.coutBrut));
    if (isCandidatePresent(b80400!.coutBrut)) assert.equal(b80400!.coutBrut.value, 1559.91);
    assert.ok(isCandidateAbsent(b80400!.cumulOuverture));
  });

  it("contrôle documentaire — Total Sorties CONCORDANT (grossCost et openingCumulative)", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: loadGeffroyFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: twoPageStubRasterizer(),
      visionRequester: scriptedVisionRequester(),
    });

    const grossCheck = result.controlChecks.find(
      (c) => c.scopeLabel === "Total Sorties" && c.field === "grossCost",
    );
    const cumulCheck = result.controlChecks.find(
      (c) => c.scopeLabel === "Total Sorties" && c.field === "openingCumulative",
    );
    assert.equal(grossCheck?.status, "CONCORDANT");
    assert.equal(grossCheck?.extractedSum, 2215);
    assert.equal(cumulCheck?.status, "CONCORDANT");
    assert.equal(cumulCheck?.extractedSum, 2215);
  });

  it("contrôle documentaire — Total Hors Sorties / Total CONCORDANT sur grossCost (B80400 est bien inclus dans les sous-totaux imprimés)", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: loadGeffroyFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: twoPageStubRasterizer(),
      visionRequester: scriptedVisionRequester(),
    });

    const horsSortiesGross = result.controlChecks.find(
      (c) => c.scopeLabel === "Total Hors Sorties" && c.field === "grossCost",
    );
    assert.equal(horsSortiesGross?.status, "CONCORDANT");
    assert.equal(horsSortiesGross?.documentTotal, 52344.52);
    assert.equal(horsSortiesGross?.extractedSum, 52344.52);

    const totalGross = result.controlChecks.find((c) => c.scopeLabel === "Total" && c.field === "grossCost");
    assert.equal(totalGross?.status, "CONCORDANT");
    assert.equal(totalGross?.documentTotal, 54559.52);
    assert.equal(totalGross?.extractedSum, 54559.52);
  });

  it("contrôle documentaire — openingCumulative NOT_COMPARABLE sur Total / Total Hors Sorties (B80400 sans cumul imprimé)", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: loadGeffroyFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: twoPageStubRasterizer(),
      visionRequester: scriptedVisionRequester(),
    });

    const horsSortiesCumul = result.controlChecks.find(
      (c) => c.scopeLabel === "Total Hors Sorties" && c.field === "openingCumulative",
    );
    const totalCumul = result.controlChecks.find(
      (c) => c.scopeLabel === "Total" && c.field === "openingCumulative",
    );
    assert.equal(horsSortiesCumul?.status, "NOT_COMPARABLE");
    assert.equal(totalCumul?.status, "NOT_COMPARABLE");
  });

  it("statut global review_required (jamais 'extracted' malgré une extraction majoritairement propre)", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: loadGeffroyFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: twoPageStubRasterizer(),
      visionRequester: scriptedVisionRequester(),
    });

    assert.equal(result.status, "review_required");
  });
});
