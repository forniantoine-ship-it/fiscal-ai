/**
 * Lot 5.4-B — chemin production réel : prepareExternalTakeover (pas
 * l'extracteur PDF appelé directement) + PDF GEFFROY réel + registerVisionRequester
 * injecté au même point que la production (ExternalTakeoverFlow.tsx).
 *
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot54b-production-vision-wiring.test.ts
 *
 * Le seul point de substitution par rapport à la production réelle est le
 * réseau : `registerVisionRequester` est un double scripté transcrit
 * manuellement à partir d'une lecture indépendante du PDF (même oracle que
 * Lot 5.4-A, établi avant exécution) — aucune donnée GEFFROY n'est injectée
 * comme résultat prêt-à-consommer dans l'extracteur, on rejoue seulement ce
 * qu'un appel Vision réel renverrait pour ce document. Le "registerRasterizer"
 * est un double (aucune image réellement rendue — seuls les numéros de page
 * comptent) mais représente fidèlement les 6 pages réelles du PDF GEFFROY
 * (cf. sixPageStubRasterizer, Lot 5.4-C) : produire moins de pages que le
 * document n'en compte réellement simulerait une troncature de rasterisation
 * qui n'existe pas en production sur ce fichier.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { presentCandidate, type CandidateProvenance } from "./candidate-value";
import {
  createTaxPackageControlFact,
  createTaxPackageControlFacts,
  type TaxPackageControlFactDraft,
} from "./tax-package-control-facts";
import { prepareExternalTakeover } from "./prepare-external-takeover";
import type {
  DepreciationRegisterPdfRow,
  DepreciationRegisterVisionRequester,
} from "./depreciation-register-pdf-row";
import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";

const TARGET = 2024;
const FY = 2023;
const FORM_YEAR = 2024;

const GEFFROY_PDF_PATH =
  "/Users/forniantoine/Desktop/liasse fec aide/reprise fiscale test/dossier sans titre/GEFFROY FRERES - alortissementsociaux 2023 (glissés).pdf";

function loadGeffroyFile(): File {
  const bytes = readFileSync(GEFFROY_PDF_PATH);
  return new File([Uint8Array.from(bytes)], path.basename(GEFFROY_PDF_PATH), {
    type: "application/pdf",
  });
}

function taxProv(sourceRef: string): CandidateProvenance {
  return {
    documentId: "doc-liasse-minimal",
    documentRole: "prior_tax_package",
    fieldLabel: sourceRef,
    sourceRef,
    extractionMethod: "fixture_structured",
    confidence: createConfidenceScore(0.9, ["fixture"]),
    evidence: { snippet: sourceRef, page: 1 },
    fieldSource: "extracted",
  };
}

/**
 * Package tax minimal — document requis par prepareExternalTakeover mais
 * hors périmètre 5.4-B (le second document du parcours reprise). Générique,
 * sans rapport avec GEFFROY.
 */
function minimalTaxPackage() {
  const drafts: TaxPackageControlFactDraft[] = (
    [
      ["2033A", "028", "total_gross", 100_000],
      ["2033C", "496", "total_gross", 100_000],
      ["2033A", "030", "total_cumulative_depreciation", 30_000],
      ["2033C", "576", "total_cumulative_depreciation", 30_000],
    ] as const
  ).map(([formType, sourceCase, kind, amount]) => ({
    formType,
    sourceCase,
    kind,
    formYear: FORM_YEAR,
    fiscalYear: FY,
    periodPosition: "closing" as const,
    value: presentCandidate(amount, "direct", taxProv(`${formType}:${sourceCase}`)),
  }));
  const facts = drafts.map((d) => {
    const created = createTaxPackageControlFact(d);
    assert.equal(created.status, "created");
    if (created.status !== "created") throw new Error("unreachable");
    return created.fact;
  });
  const pkg = createTaxPackageControlFacts("pkg-5.4b-minimal", facts);
  assert.equal(pkg.status, "created");
  if (pkg.status !== "created") throw new Error("unreachable");
  return pkg.package;
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

// Transcription manuelle du registre réel GEFFROY (oracle établi
// indépendamment avant exécution — cf. Lot 5.4-A) — représente ce qu'un
// appel Vision réel renverrait, pas une donnée injectée pour forcer un résultat.
const PAGE1_ROWS: DepreciationRegisterPdfRow[] = [
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
  asset("B80200", "PEUGEOT EXPERT VU", "19/02/2018", "9 500,00", "9 246,66", "L", "05 - 00", 1),
  asset("B90800", "RENAULT TRAFIC EE-286-XG", "28/08/2019", "7 799,37", "5 212,56", "L", "05 - 00", 1),
  asset("C10200", "MASTER III EY-332-ND RENAULT", "08/02/2021", "15 668,24", "5 945,23", "L", "05 - 00", 1),
];

const PAGE2_ROWS: DepreciationRegisterPdfRow[] = [
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

/**
 * Le vrai PDF GEFFROY compte 6 pages (Lot 5.4-C — vérifié via
 * extractNativePdfPages sur le fichier réel). Le rasterizer de test doit
 * donc représenter les 6 pages du document qu'il prétend rasteriser, pas
 * seulement les 2 qui portent le registre transcrit dans l'oracle
 * (PAGE1_ROWS/PAGE2_ROWS) — sinon le nouveau garde-fou anti-troncature
 * (Lot 5.4-C) détecte à raison un écart totalPageCount(6) >
 * processedPageCount(2) qui n'existe pas en production sur ce fichier (la
 * vraie rasterisation, non plafonnée pour un document de 6 pages, couvrirait
 * les 6 pages). Les pages 3-6 utilisent le même mécanisme de double neutre
 * que scriptedVisionRequester leur applique déjà (`return { rows: [] }`) —
 * aucune donnée comptable n'est inventée pour ces pages.
 */
function sixPageStubRasterizer(): (file: File) => Promise<RasterPageImage[]> {
  return async () =>
    Array.from({ length: 6 }, (_, i) => ({
      pageNumber: i + 1,
      mimeType: "image/png" as const,
      base64: "AAAA",
    }));
}

function baseInput(overrides: {
  registerVisionRequester?: DepreciationRegisterVisionRequester;
  registerRasterizer?: (file: File) => Promise<RasterPageImage[]>;
} = {}) {
  return {
    openingId: "opening-5.4b",
    dossierId: "dossier-5.4b",
    takeoverId: "takeover-5.4b",
    targetFiscalYear: TARGET,
    sourceFiscalYear: FY,
    formYear: FORM_YEAR,
    register: {
      role: "prior_depreciation_register" as const,
      documentId: "doc-geffroy-2023",
      file: loadGeffroyFile(),
    },
    taxPackage: {
      role: "prior_tax_package" as const,
      documentId: "doc-liasse-minimal",
      package: minimalTaxPackage(),
    },
    validatedAt: "2026-01-15T10:00:00.000Z",
    validator: "lot5.4b-production-wiring-test",
    registerVisionRequester: overrides.registerVisionRequester ?? scriptedVisionRequester(),
    registerRasterizer: overrides.registerRasterizer ?? sixPageStubRasterizer(),
  };
}

describe("Lot 5.4-B — prepareExternalTakeover avec PDF GEFFROY réel (chemin production)", () => {
  it("registre PDF réel accepté sans injection manuelle de candidates — 22 assets extraits", async () => {
    const result = await prepareExternalTakeover(baseInput());

    assert.notEqual(result.status, "blocked");
    const assets = "assets" in result ? result.assets : undefined;
    assert.ok(assets);
    assert.equal(assets!.length, 22);
    assert.ok(!assets!.some((a) => a.sourceAssetRef === "B71200"), "la sortie ne doit jamais devenir un asset");
  });

  it("B80400 reste présent avec coutBrut ≠ 0 et cumulOuverture missing (jamais 0)", async () => {
    const result = await prepareExternalTakeover(baseInput());
    const assets = "assets" in result ? result.assets : undefined;
    const b80400 = assets?.find((a) => a.sourceAssetRef === "B80400");
    assert.ok(b80400);
    assert.equal(b80400!.coutBrut.status, "present");
    if (b80400!.coutBrut.status === "present") assert.equal(b80400!.coutBrut.value, 1559.91);
    assert.notEqual(b80400!.cumulOuverture.status, "present"); // jamais promu à 0
  });

  it("FAIL CLOSED — Vision indisponible sur toutes les pages → blocked, jamais un Opening implicite", async () => {
    const alwaysFails: DepreciationRegisterVisionRequester = async () => {
      throw new Error("Vision provider unavailable (simulated).");
    };
    const result = await prepareExternalTakeover(
      baseInput({ registerVisionRequester: alwaysFails }),
    );
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(result.exceptions.some((e) => e.code === "DOCUMENT_EXTRACTION_FAILED"));
    }
  });

  it("FAIL CLOSED — extraction partielle (une seule page répond) → jamais silencieusement accepté comme complet", async () => {
    const onlyPage1: DepreciationRegisterVisionRequester = async ({ pageNumber }) => {
      if (pageNumber === 1) return { rows: PAGE1_ROWS };
      throw new Error("Vision timeout (simulated) on page 2.");
    };
    const result = await prepareExternalTakeover(
      baseInput({ registerVisionRequester: onlyPage1 }),
    );
    // Page 1 seule contient déjà des candidates → pas "blocked", mais le
    // statut global ne doit jamais devenir silencieusement "built" sans
    // trace du problème : au minimum, la sortie/les totaux de la page 2
    // manquent et les assets extraits ne représentent pas tout le registre.
    assert.notEqual(result.status, "built");
  });

  it("FAIL CLOSED — registerVisionRequester absent pour un PDF → blocked explicite (jamais un fallback silencieux)", async () => {
    const input = baseInput();
    const { registerVisionRequester, ...withoutRequester } = input;
    const result = await prepareExternalTakeover(withoutRequester as typeof input);
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(
        result.exceptions.some(
          (e) => e.code === "DOCUMENT_EXTRACTION_FAILED" && e.message.includes("registerVisionRequester"),
        ),
      );
    }
  });
});
