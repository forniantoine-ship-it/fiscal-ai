/**
 * P1-PDF-02-C/F1/F2 + Chantier 2B + Chantier 2D-C + Chantier 2D-E3 —
 * Vertical slice 2033-A-SD 2026 (25 cases autorisées : 10 P1-PDF-02-C
 * d'origine + 10 du bloc Amortissements F4-A/B/C/D
 * (016/042/066/070/074/082/094/048/098/112) + 3 totaux 044/096/176
 * (chantier 2D-B/2D-C) + 2 totaux généraux 110/180 (chantier 2D-E2/2D-E3).
 * Plus aucune case n'est structurellement interdite.
 *
 * Run: npm run test:liasse-pdf-2033a
 *
 * Géométrie : P1-PDF-02-B CONFIRMED_VECTOR (10 cases d'origine) + chantier 2A
 * PyMuPDF indépendant (bloc Amortissements) + chantier 2D-A PyMuPDF
 * indépendant (044/096/176) + chantier 2D-D PyMuPDF indépendant (110/180).
 * Aucune règle fiscale ajoutée.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { assemblePatrimoine } from "@/runtime/capabilities/bilan/assemble-patrimoine";
import { checkBilanEquilibre } from "@/runtime/capabilities/bilan/check-bilan-equilibre";
import { resultatComptable } from "@/runtime/capabilities/bilan/resultat-comptable";
import { map2033AFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033a";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { FiscalRepresentation, ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";

import {
  CERFA_2033A_FORM_ID,
  CERFA_2033A_MILLESIME,
  generateCerfa2033AFromRfs,
} from "../generate-cerfa-2033a";
import { generateCerfaLiassePdf } from "../generator/render-cerfa-liasse";
import { toPdfLibPoint } from "../generator/coordinates";
import { formatCerfaValue } from "../generator/format-value";
import { checkOverflow, runStructuralAndMappingGate } from "../gate/generation-gate";
import { CERFA_ASSET_MANIFEST_2026 } from "../asset-manifest";
import { readAssetBytes } from "../assets/load-asset";
import { resolveVisualMapping } from "../registry";
import {
  CERFA_2033A_FORBIDDEN_CASE_IDS,
  CERFA_2033A_REGISTRY_CASE_IDS,
  CERFA_2033A_SLICE_COLUMNS,
  isAuthorized2033ASliceCase,
} from "../scope/2033-a-2026";
import type { CerfaCase } from "../types";
import { buildDossierTemoinRfs, DOSSIER_TEMOIN_FISCAL_RESULT } from "./golden-master-technical-pipeline.test";
import { extractDrawnStringsForPage, extractDrawnTextPositionsForPage } from "./extract-rendered-text";
import {
  ELSA_CASE_028,
  ELSA_CASE_030,
  ELSA_CASE_136,
  ELSA_CASE_156,
  SYNTHETIC_P0_BILAN_INPUTS,
  SYNTHETIC_P0_CASES,
  buildElsaF010F011Rfs,
  buildSyntheticP0RfsAvecPatrimoine,
  buildSyntheticP0RfsSansPatrimoine,
} from "./fixtures-2033a-rfs";

const OUTPUT_DIR = path.join(__dirname, "output");

/** Boîtes de VALEUR P1-PDF-02-B (PyMuPDF, origine haut-gauche). */
const VALUE_BOXES_PYMUPDF: Record<string, { x: number; y: number; w: number; h: number }> = {
  "028": { x: 283.74, y: 245.58, w: 90.06, h: 14.79 },
  "030": { x: 389.98, y: 245.58, w: 90.71, h: 14.79 },
  "084": { x: 283.74, y: 392.98, w: 90.06, h: 14.79 },
  "086": { x: 389.98, y: 392.98, w: 90.71, h: 14.79 },
  "120": { x: 480.69, y: 465.39, w: 87.41, h: 14.79 },
  "134": { x: 480.69, y: 539.36, w: 87.41, h: 14.79 },
  "136": { x: 480.69, y: 554.15, w: 87.41, h: 14.79 },
  "137": { x: 480.69, y: 568.94, w: 87.41, h: 14.79 },
  "142": { x: 480.69, y: 598.53, w: 87.41, h: 14.27 },
  "156": { x: 480.69, y: 627.59, w: 87.41, h: 14.79 },
  // Chantier 2B — bloc Amortissements, ré-extrait indépendamment (PyMuPDF
  // page.get_drawings(), chantier 2A) contre assets/2026/2033-sd.pdf page 1.
  "016": { x: 389.98, y: 230.79, w: 90.71, h: 14.79 },
  "042": { x: 389.98, y: 260.37, w: 90.71, h: 14.79 },
  "048": { x: 389.98, y: 275.16, w: 90.71, h: 14.79 },
  "066": { x: 389.98, y: 319.54, w: 90.71, h: 14.79 },
  "070": { x: 389.98, y: 334.33, w: 90.71, h: 14.27 },
  "074": { x: 389.98, y: 348.60, w: 90.71, h: 14.79 },
  "094": { x: 389.98, y: 363.40, w: 90.71, h: 14.79 },
  "082": { x: 389.98, y: 378.19, w: 90.71, h: 14.79 },
  "098": { x: 389.98, y: 407.77, w: 90.71, h: 14.79 },
  "112": { x: 389.98, y: 422.57, w: 90.71, h: 15.86 },
  // Chantier 2D-C — totaux 044/096 (Brut) et 176 (NET Passif), ré-extraits
  // indépendamment (PyMuPDF, chantier 2D-A) contre assets/2026/2033-sd.pdf.
  "044": { x: 283.74, y: 275.16, w: 90.06, h: 14.79 },
  "096": { x: 283.74, y: 407.77, w: 90.06, h: 14.79 },
  "176": { x: 480.69, y: 733.81, w: 87.41, h: 14.80 },
  // Chantier 2D-E3 — totaux généraux 110 (Brut) et 180 (NET Passif),
  // ré-extraits indépendamment (PyMuPDF, chantier 2D-D).
  "110": { x: 283.74, y: 422.57, w: 90.06, h: 15.86 },
  "180": { x: 480.69, y: 748.61, w: 87.41, h: 15.86 },
};

const NUMBER_ZONE = {
  brut: { xMin: 268.66, xMax: 283.74 },
  amort: { xMin: 373.80, xMax: 389.98 },
  passif: { xMin: 464.51, xMax: 480.69 },
} as const;

const BRUT_COLUMN = { xMin: 283.74, xMax: 373.8 } as const;
const AMORT_COLUMN = { xMin: 389.98, xMax: 480.69 } as const;
const NET_ACTIF = { xMin: 480.69, xMax: 568.1 } as const;

const EXPECTED_REGISTRY: Record<string, { x: number; y: number; width: number; height: number }> = {
  "028": { x: 372.3, y: 248.97, width: 86, height: 9 },
  "030": { x: 479.19, y: 248.97, width: 86, height: 9 },
  "084": { x: 372.3, y: 396.37, width: 86, height: 9 },
  "086": { x: 479.19, y: 396.37, width: 86, height: 9 },
  "120": { x: 566.6, y: 468.87, width: 84, height: 9 },
  "134": { x: 566.6, y: 542.77, width: 84, height: 9 },
  "136": { x: 566.6, y: 557.56, width: 84, height: 9 },
  "137": { x: 566.6, y: 572.38, width: 84, height: 9 },
  "142": { x: 566.6, y: 601.68, width: 84, height: 9 },
  "156": { x: 566.6, y: 631.06, width: 84, height: 9 },
  // Chantier 2B — bloc Amortissements (chantier 2A pour les coordonnées).
  "016": { x: 479.19, y: 234.18, width: 86, height: 9 },
  "042": { x: 479.19, y: 263.76, width: 86, height: 9 },
  "048": { x: 479.19, y: 278.58, width: 86, height: 9 },
  "066": { x: 479.19, y: 322.97, width: 86, height: 9 },
  "070": { x: 479.19, y: 337.46, width: 86, height: 9 },
  "074": { x: 479.19, y: 352.08, width: 86, height: 9 },
  "094": { x: 479.19, y: 366.87, width: 86, height: 9 },
  "082": { x: 479.19, y: 381.58, width: 86, height: 9 },
  "098": { x: 479.19, y: 411.17, width: 86, height: 9 },
  "112": { x: 479.19, y: 426.56, width: 86, height: 9 },
  // Chantier 2D-C — totaux 044/096 (Brut) et 176 (NET Passif).
  "044": { x: 372.3, y: 278.58, width: 86, height: 9 },
  "096": { x: 372.3, y: 411.17, width: 86, height: 9 },
  "176": { x: 566.6, y: 737.27, width: 84, height: 9 },
  // Chantier 2D-E3 — totaux généraux 110 (Brut) et 180 (NET Passif).
  "110": { x: 372.3, y: 426.56, width: 86, height: 9 },
  "180": { x: 566.6, y: 752.56, width: 84, height: 9 },
};

/**
 * Chantier 2D-C — composantes des totaux 044/096/176 qui ne sont PAS
 * elles-mêmes des cases du registre (014/040/064/068/072/080/092/164/166/
 * 172/174/175 : feuilles Brut/tiers G2, jamais calibrées PDF). Constantes
 * locales uniquement pour vérifier arithmétiquement la relation fiscale
 * (comme 048/098/112 le font déjà plus bas avec leurs propres composantes),
 * jamais rendues ni recherchées dans le PDF.
 */
const COMPOSANTE_014 = 8_000;
const COMPOSANTE_040 = 9_000;
const COMPOSANTE_064 = 1_000;
const COMPOSANTE_068 = 2_000;
const COMPOSANTE_072 = 3_000;
const COMPOSANTE_080 = 4_000;
const COMPOSANTE_092 = 5_000;
const COMPOSANTE_164 = 10;
const COMPOSANTE_166 = 20;
const COMPOSANTE_172 = 30;
const COMPOSANTE_174 = 40;
const COMPOSANTE_175 = 50;

/**
 * Valeurs distinctes : positif, zéro, négatif, montant long (10 cases
 * P1-PDF-02-C d'origine) + bloc Amortissements (chantier 2B) + totaux
 * 044/096/176 (chantier 2D-C), choisies pour vérifier réellement
 * 048 = 016+030+042, 098 = 066+070+074+082+086+094, 112 = 048+098,
 * 044 = 014+028+040, 096 = 064+068+072+080+084+092,
 * 176 = 156+164+166+172+174+175 — jamais uniquement des zéros, jamais deux
 * valeurs identiques (une mauvaise association de position se traduirait par
 * un texte attendu introuvable dans SA boîte, jamais une coïncidence
 * numérique masquée).
 *
 *   048 = 1200(016) + 3720(030) + 2400(042)          = 7320
 *   098 = 110(066)+220(070)+330(074)+440(082)+777(086)+550(094) = 2427
 *   112 = 7320(048) + 2427(098)                       = 9747
 *   044 = 8000(014) + 11111(028) + 9000(040)          = 28111
 *   096 = 1000(064)+2000(068)+3000(072)+4000(080)+0(084)+5000(092) = 15000
 *   176 = 66666(156)+10(164)+20(166)+30(172)+40(174)+50(175) = 66816
 *   110 = 28111(044) + 15000(096)                      = 43111
 *   180 = 55555(142) + 66816(176)                       = 122371
 */
const SLICE_TEST_VALUES: Record<(typeof CERFA_2033A_REGISTRY_CASE_IDS)[number], number> = {
  "028": 11_111,
  "030": 3_720,
  "084": 0,
  "086": 777,
  "120": -2_222,
  "134": 1_234_567,
  "136": 33_333,
  "137": 4_444,
  "142": 55_555,
  "156": 66_666,
  "016": 1_200,
  "042": 2_400,
  "048": 7_320,
  "066": 110,
  "070": 220,
  "074": 330,
  "082": 440,
  "094": 550,
  "098": 2_427,
  "112": 9_747,
  "044": COMPOSANTE_014 + 11_111 + COMPOSANTE_040,
  "096": COMPOSANTE_064 + COMPOSANTE_068 + COMPOSANTE_072 + COMPOSANTE_080 + 0 + COMPOSANTE_092,
  "176": 66_666 + COMPOSANTE_164 + COMPOSANTE_166 + COMPOSANTE_172 + COMPOSANTE_174 + COMPOSANTE_175,
  // Chantier 2D-E3 — totaux généraux, calculés à partir des totaux déjà
  // définis ci-dessus (044/096/142/176), jamais une valeur indépendante.
  "110": (COMPOSANTE_014 + 11_111 + COMPOSANTE_040) + (COMPOSANTE_064 + COMPOSANTE_068 + COMPOSANTE_072 + COMPOSANTE_080 + 0 + COMPOSANTE_092),
  "180": 55_555 + (66_666 + COMPOSANTE_164 + COMPOSANTE_166 + COMPOSANTE_172 + COMPOSANTE_174 + COMPOSANTE_175),
};

function cerfaCase(caseId: string, value: number): CerfaCase {
  return { caseId, label: caseId, value, trace: { source: "FiscalResult", path: "test", ksArtifacts: [] } };
}

function sliceCases(): CerfaCase[] {
  return CERFA_2033A_REGISTRY_CASE_IDS.map((caseId) => cerfaCase(caseId, SLICE_TEST_VALUES[caseId]));
}

function numberZoneFor(caseId: string): { xMin: number; xMax: number } {
  const column = CERFA_2033A_SLICE_COLUMNS[caseId as keyof typeof CERFA_2033A_SLICE_COLUMNS];
  if (column === "Brut") return NUMBER_ZONE.brut;
  if (column === "Amortissements-Provisions") return NUMBER_ZONE.amort;
  return NUMBER_ZONE.passif;
}

describe("P1-PDF-02-C/2B/2D-C/2D-E3 — R1 registry : 25 cases autorisées", () => {
  it("chaque case du slice a une entrée calibrée mesure-empirique", () => {
    assert.equal(CERFA_2033A_REGISTRY_CASE_IDS.length, 25);
    for (const caseId of CERFA_2033A_REGISTRY_CASE_IDS) {
      const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, caseId);
      assert.ok(mapping, `${caseId} doit être dans le registre`);
      assert.equal(mapping?.calibration, "mesure-empirique");
      assert.equal(mapping?.page, 1);
      assert.equal(mapping?.align, "right");
      assert.equal(mapping?.format, "eur-arrondi");
      assert.equal(mapping?.fontSize, 9);
    }
  });
});

describe("P1-PDF-02-C/2D-E3 — R2 exclusivité : cases interdites absentes", () => {
  it("Chantier 2D-E3 — plus aucune case n'est structurellement interdite (110/180 câblées)", () => {
    assert.deepEqual(CERFA_2033A_FORBIDDEN_CASE_IDS, []);
    for (const caseId of CERFA_2033A_FORBIDDEN_CASE_IDS) {
      assert.equal(
        resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, caseId),
        undefined,
        `${caseId} ne doit pas être publiée dans le registre`,
      );
      assert.equal(isAuthorized2033ASliceCase(caseId), false);
    }
  });

  it("une case structurellement non_applicable (154, jamais modélisée) reste absente du registre", () => {
    assert.equal(resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, "154"), undefined);
    assert.equal(isAuthorized2033ASliceCase("154"), false);
  });

  it("aucune pseudo-case Net actif n'existe", () => {
    for (const fake of ["NET_ACTIF", "028_NET", "084_NET", "110_NET"]) {
      assert.equal(resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, fake), undefined);
    }
  });
});

describe("P1-PDF-02-C — R3 coordonnées registry", () => {
  it("les 10 ancrages correspondent à la convention 2033-B (bord droit, top-left)", () => {
    for (const caseId of CERFA_2033A_REGISTRY_CASE_IDS) {
      const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, caseId)!;
      const expected = EXPECTED_REGISTRY[caseId];
      assert.equal(mapping.position.space, "top-left");
      assert.equal(mapping.position.x, expected.x, `${caseId} x`);
      assert.equal(mapping.position.y, expected.y, `${caseId} y`);
      assert.equal(mapping.width, expected.width, `${caseId} width`);
      assert.equal(mapping.height, expected.height, `${caseId} height`);
    }
  });
});

describe("P1-PDF-02-C — R4 colonnes officielles", () => {
  it("028/084 = Brut ; 030/086 = Amortissements-Provisions ; 120/134/136/137/142/156 = NET", () => {
    assert.equal(CERFA_2033A_SLICE_COLUMNS["028"], "Brut");
    assert.equal(CERFA_2033A_SLICE_COLUMNS["030"], "Amortissements-Provisions");
    assert.equal(CERFA_2033A_SLICE_COLUMNS["084"], "Brut");
    assert.equal(CERFA_2033A_SLICE_COLUMNS["086"], "Amortissements-Provisions");
    for (const caseId of ["120", "134", "136", "137", "142", "156"] as const) {
      assert.equal(CERFA_2033A_SLICE_COLUMNS[caseId], "NET");
    }
    // Chantier 2B — bloc Amortissements, toutes en colonne Amort. (jamais confondues avec 014/040/064/068/072/080/092, leurs brut voisins non calibrés).
    for (const caseId of ["016", "042", "048", "066", "070", "074", "082", "094", "098", "112"] as const) {
      assert.equal(CERFA_2033A_SLICE_COLUMNS[caseId], "Amortissements-Provisions", `${caseId} doit être en colonne Amort.`);
    }
    // Chantier 2D-C — totaux 044/096 en colonne Brut (jamais confondus avec 048/098, leurs jumeaux Amort.) ; 176 en colonne NET Passif (jamais Brut ni Amort., contrairement à un total actif).
    assert.equal(CERFA_2033A_SLICE_COLUMNS["044"], "Brut");
    assert.equal(CERFA_2033A_SLICE_COLUMNS["096"], "Brut");
    assert.equal(CERFA_2033A_SLICE_COLUMNS["176"], "NET");
    // Chantier 2D-E3 — totaux généraux 110 en colonne Brut (jamais Amort., jamais confondu avec 112) ; 180 en colonne NET Passif (jamais Brut ni Amort.).
    assert.equal(CERFA_2033A_SLICE_COLUMNS["110"], "Brut");
    assert.equal(CERFA_2033A_SLICE_COLUMNS["180"], "NET");
    for (const caseId of CERFA_2033A_REGISTRY_CASE_IDS) {
      const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, caseId)!;
      assert.ok(mapping.note?.includes(`Colonne ${CERFA_2033A_SLICE_COLUMNS[caseId]}`), `${caseId} note colonne`);
    }
  });
});

describe("P1-PDF-02-C — R5 anti-zone-numéro", () => {
  it("l'ancrage et la largeur restent dans la boîte de valeur, hors zone-numéro", () => {
    for (const caseId of CERFA_2033A_REGISTRY_CASE_IDS) {
      const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, caseId)!;
      const box = VALUE_BOXES_PYMUPDF[caseId];
      const numberZone = numberZoneFor(caseId);
      const writeLeft = mapping.position.x - mapping.width;
      const writeRight = mapping.position.x;

      assert.ok(writeRight <= box.x + box.w + 0.2, `${caseId} bord droit dans la boîte valeur`);
      assert.ok(writeLeft >= box.x - 0.2, `${caseId} bord gauche dans la boîte valeur`);
      assert.ok(writeLeft >= numberZone.xMax - 0.2, `${caseId} ne commence pas dans la zone-numéro`);
      assert.ok(writeRight > numberZone.xMax, `${caseId} n'est pas ancré dans la zone-numéro`);
    }
  });

  it("028 et 084 n'empiètent pas sur la colonne Net de l'actif", () => {
    for (const caseId of ["028", "084"] as const) {
      const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, caseId)!;
      assert.ok(mapping.position.x < NET_ACTIF.xMin, `${caseId} ne doit pas atteindre le Net actif`);
    }
  });

  it("030 reste dans la colonne Amortissements-Provisions, hors Brut et Net actif", () => {
    const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, "030")!;
    const writeLeft = mapping.position.x - mapping.width;
    assert.ok(writeLeft >= AMORT_COLUMN.xMin - 0.2, "030 ne doit pas empiéter sur la colonne Brut");
    assert.ok(mapping.position.x <= AMORT_COLUMN.xMax + 0.2, "030 reste dans la colonne Amortissements-Provisions");
    assert.ok(mapping.position.x < NET_ACTIF.xMin, "030 ne doit pas atteindre le Net actif");
    assert.ok(writeLeft > BRUT_COLUMN.xMax - 0.2, "030 ne doit pas écrire dans la colonne Brut");
  });

  it("086 reste dans la colonne Amortissements-Provisions (Disponibilités), hors Brut et Net actif", () => {
    const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, "086")!;
    const writeLeft = mapping.position.x - mapping.width;
    assert.ok(writeLeft >= AMORT_COLUMN.xMin - 0.2);
    assert.ok(mapping.position.x <= AMORT_COLUMN.xMax + 0.2);
    assert.ok(mapping.position.x < NET_ACTIF.xMin);
    assert.ok(writeLeft > BRUT_COLUMN.xMax - 0.2);
  });

  it("Chantier 2D-C — 044/096 restent dans la colonne Brut (jamais Amort. ni Net), comme 028/084", () => {
    for (const caseId of ["044", "096"] as const) {
      const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, caseId)!;
      assert.equal(mapping.position.x, 372.3, `${caseId} doit utiliser l'ancrage Brut, pas Amort./NET`);
      assert.ok(mapping.position.x < NET_ACTIF.xMin, `${caseId} ne doit pas atteindre le Net actif`);
      assert.ok(mapping.position.x <= BRUT_COLUMN.xMax + 0.2, `${caseId} reste dans la colonne Brut`);
    }
  });

  it("Chantier 2D-C — 176 reste dans la colonne NET Passif (jamais Brut ni Amort., contrairement à un total actif)", () => {
    const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, "176")!;
    assert.equal(mapping.position.x, 566.6, "176 doit utiliser l'ancrage NET Passif (passifNet), pas brut() ni amort()");
    assert.ok(mapping.position.x > AMORT_COLUMN.xMax, "176 ne doit pas être dans la colonne Amort.");
    assert.ok(mapping.position.x > BRUT_COLUMN.xMax, "176 ne doit pas être dans la colonne Brut");
  });

  it("Chantier 2D-E3 — 110 reste dans la colonne Brut (jamais Amort., contrairement à son jumeau 112)", () => {
    const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, "110")!;
    assert.equal(mapping.position.x, 372.3, "110 doit utiliser l'ancrage Brut, pas Amort./NET");
    assert.ok(mapping.position.x < NET_ACTIF.xMin, "110 ne doit pas atteindre le Net actif");
    assert.ok(mapping.position.x <= BRUT_COLUMN.xMax + 0.2, "110 reste dans la colonne Brut");
  });

  it("Chantier 2D-E3 — 180 reste dans la colonne NET Passif (jamais Brut ni Amort.)", () => {
    const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, "180")!;
    assert.equal(mapping.position.x, 566.6, "180 doit utiliser l'ancrage NET Passif (passifNet), pas brut() ni amort()");
    assert.ok(mapping.position.x > AMORT_COLUMN.xMax, "180 ne doit pas être dans la colonne Amort.");
    assert.ok(mapping.position.x > BRUT_COLUMN.xMax, "180 ne doit pas être dans la colonne Brut");
  });
});

describe("P1-PDF-02-C — R6 renderer + PDF réel", () => {
  it("injecte 25 valeurs distinctes (bloc Amortissements chantier 2B + totaux 044/096/176 chantier 2D-C + totaux généraux 110/180 chantier 2D-E3), les dessine dans les boîtes de valeur, et bloque un overflow", async () => {
    const cases = sliceCases();
    const overflowDoc = await PDFDocument.create();
    const font = await overflowDoc.embedFont(StandardFonts.Helvetica);
    const mapping028 = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, "028")!;
    const overflow = checkOverflow({
      form: CERFA_2033A_FORM_ID,
      caseValue: cerfaCase("028", 11_111),
      mapping: { ...mapping028, width: 3 },
      font,
    });
    assert.equal(overflow?.code, "debordement-largeur");

    const gate = runStructuralAndMappingGate({
      millesime: CERFA_2033A_MILLESIME,
      forms: [{ form: CERFA_2033A_FORM_ID, cases }],
    });
    assert.deepEqual(gate, []);

    const result = await generateCerfaLiassePdf({
      millesime: CERFA_2033A_MILLESIME,
      forms: [{ form: CERFA_2033A_FORM_ID, cases }],
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    assert.equal(result.forms[0], CERFA_2033A_FORM_ID);
    assert.equal(result.manifest.length, 25);

    // Chantier 2B — les 3 relations fiscales du bloc Amortissements, sur les
    // valeurs de TEST injectées ci-dessus (SLICE_TEST_VALUES) — jamais sur une
    // relecture du moteur (ce test ne l'appelle pas), seulement sur les
    // valeurs effectivement transmises au renderer.
    assert.equal(SLICE_TEST_VALUES["048"], SLICE_TEST_VALUES["016"] + SLICE_TEST_VALUES["030"] + SLICE_TEST_VALUES["042"], "048 = 016 + 030 + 042");
    assert.equal(
      SLICE_TEST_VALUES["098"],
      SLICE_TEST_VALUES["066"] + SLICE_TEST_VALUES["070"] + SLICE_TEST_VALUES["074"] + SLICE_TEST_VALUES["082"] + SLICE_TEST_VALUES["086"] + SLICE_TEST_VALUES["094"],
      "098 = 066 + 070 + 074 + 082 + 086 + 094",
    );
    assert.equal(SLICE_TEST_VALUES["112"], SLICE_TEST_VALUES["048"] + SLICE_TEST_VALUES["098"], "112 = 048 + 098");

    // Chantier 2D-C — les 3 relations fiscales des totaux Brut/Dettes. 014/
    // 040/064/068/072/080/092/164/166/172/174/175 ne sont pas des cases du
    // registre (jamais rendues) : la relation est vérifiée arithmétiquement
    // via les constantes COMPOSANTE_* déclarées plus haut, exactement comme
    // 028/156 (elles, dans le registre) sont réutilisées telles quelles.
    assert.equal(SLICE_TEST_VALUES["044"], COMPOSANTE_014 + SLICE_TEST_VALUES["028"] + COMPOSANTE_040, "044 = 014 + 028 + 040");
    assert.equal(
      SLICE_TEST_VALUES["096"],
      COMPOSANTE_064 + COMPOSANTE_068 + COMPOSANTE_072 + COMPOSANTE_080 + SLICE_TEST_VALUES["084"] + COMPOSANTE_092,
      "096 = 064 + 068 + 072 + 080 + 084 + 092",
    );
    assert.equal(
      SLICE_TEST_VALUES["176"],
      SLICE_TEST_VALUES["156"] + COMPOSANTE_164 + COMPOSANTE_166 + COMPOSANTE_172 + COMPOSANTE_174 + COMPOSANTE_175,
      "176 = 156 + 164 + 166 + 172 + 174 + 175",
    );

    // Chantier 2D-E3 — les 2 relations fiscales des totaux généraux, sur les
    // totaux déjà définis ci-dessus (044/096/142/176), jamais une valeur
    // indépendante. 110 n'est jamais déduit de 112−180 ; 180 n'est jamais
    // déduit de 110−112 (voir check-bilan-equilibre.ts : (110−112)=180 est
    // un contrôle d'équilibre a posteriori, jamais un chemin de calcul).
    assert.equal(SLICE_TEST_VALUES["110"], SLICE_TEST_VALUES["044"] + SLICE_TEST_VALUES["096"], "110 = 044 + 096");
    assert.equal(SLICE_TEST_VALUES["180"], SLICE_TEST_VALUES["142"] + SLICE_TEST_VALUES["176"], "180 = 142 + 176");

    const drawn = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const strings = await extractDrawnStringsForPage(result.pdfBytes, 1);
    const pdf = await PDFDocument.load(result.pdfBytes);
    assert.equal(pdf.getPageCount(), 1);
    const pageHeight = pdf.getPages()[0].getHeight();

    const expectedTexts: Record<string, string> = {};
    for (const caseId of CERFA_2033A_REGISTRY_CASE_IDS) {
      expectedTexts[caseId] = formatCerfaValue(SLICE_TEST_VALUES[caseId], "eur-arrondi");
    }

    assert.ok(strings.includes("11 111"), "028 positif");
    assert.ok(strings.includes("0"), "084 zéro réel");
    assert.ok(strings.includes("(2 222)"), "120 négatif parenthèses");
    assert.ok(strings.includes("1 234 567"), "134 montant long");
    // Chantier 2B — bloc Amortissements, valeurs distinctes (016/042/048).
    assert.ok(strings.includes("1 200"), "016 présent");
    assert.ok(strings.includes("2 400"), "042 présent");
    assert.ok(strings.includes("7 320"), "048 présent (total, distinct de ses composantes)");
    assert.ok(strings.includes("2 427"), "098 présent (total, distinct de ses composantes)");
    assert.ok(strings.includes("9 747"), "112 présent (total général, distinct de 048/098)");
    // Chantier 2D-C — totaux 044/096/176, valeurs distinctes de tout le reste.
    assert.ok(strings.includes("28 111"), "044 présent (total Brut, distinct de 048)");
    assert.ok(strings.includes("15 000"), "096 présent (total Brut, distinct de 098)");
    assert.ok(strings.includes("66 816"), "176 présent (total Dettes NET, distinct de 156)");
    // Chantier 2D-E3 — totaux généraux 110/180, valeurs distinctes de tout le reste.
    assert.ok(strings.includes("43 111"), "110 présent (total général actif Brut, distinct de 044/096/112)");
    assert.ok(strings.includes("122 371"), "180 présent (total général passif NET, distinct de 142/176)");

    for (const caseId of CERFA_2033A_REGISTRY_CASE_IDS) {
      const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, caseId)!;
      const text = expectedTexts[caseId];
      const box = VALUE_BOXES_PYMUPDF[caseId];
      const numberZone = numberZoneFor(caseId);
      const measuredWidth = font.widthOfTextAtSize(text, 9);
      const baseline = toPdfLibPoint(mapping.position, pageHeight);
      const hit = drawn.find((d) => {
        if (d.text !== text) return false;
        if (Math.abs(d.pdfLibY - baseline.y) >= 0.05) return false;
        const textRight = d.pdfLibX + measuredWidth;
        return d.pdfLibX >= box.x - 0.5 && textRight <= box.x + box.w + 0.5;
      });
      assert.ok(hit, `${caseId} : texte "${text}" introuvable dans le PDF`);

      const textRight = hit!.pdfLibX + measuredWidth;

      assert.ok(hit!.pdfLibX >= box.x - 0.5, `${caseId} x gauche dans la valeur (got ${hit!.pdfLibX})`);
      assert.ok(textRight <= box.x + box.w + 0.5, `${caseId} x droit dans la valeur (got ${textRight})`);
      assert.ok(hit!.pdfLibX >= numberZone.xMax - 0.2, `${caseId} pas dans la zone-numéro (x=${hit!.pdfLibX})`);
      assert.ok(Math.abs(hit!.pdfLibY - baseline.y) < 0.05, `${caseId} y pdf-lib = conversion registry`);

      if (caseId === "028" || caseId === "084" || caseId === "044" || caseId === "096" || caseId === "110") {
        assert.ok(textRight < NET_ACTIF.xMin, `${caseId} ne doit pas écrire dans le Net actif`);
      }
      if (caseId === "044" || caseId === "096" || caseId === "110") {
        // Chantier 2D-C/2D-E3 — totaux Brut : jamais dans la colonne Amort. (celle de leurs jumeaux 048/098/112).
        assert.ok(textRight <= AMORT_COLUMN.xMin + 0.5, `${caseId} ne doit pas écrire dans la colonne Amortissements-Provisions`);
      }
      if (caseId === "176" || caseId === "180") {
        // Chantier 2D-C/2D-E3 — totaux Dettes/passif NET : jamais dans la colonne Brut ni Amort. actif.
        assert.ok(hit!.pdfLibX >= NET_ACTIF.xMin - 0.5, `${caseId} doit être en colonne NET, jamais Brut/Amort. actif`);
      }
      if (caseId === "030" || caseId === "086") {
        assert.ok(hit!.pdfLibX >= AMORT_COLUMN.xMin - 0.5, `${caseId} dans la colonne Amortissements-Provisions`);
        assert.ok(textRight <= AMORT_COLUMN.xMax + 0.5, `${caseId} dans la colonne Amortissements-Provisions`);
        assert.ok(hit!.pdfLibX >= NUMBER_ZONE.amort.xMax - 0.2, `${caseId} hors zone-numéro amort`);
        assert.ok(textRight < NET_ACTIF.xMin, `${caseId} ne doit pas écrire dans le Net actif`);
        assert.ok(textRight <= BRUT_COLUMN.xMax + 0.5 || hit!.pdfLibX >= BRUT_COLUMN.xMax - 0.5, `${caseId} hors colonne Brut`);
      }
    }

    assert.ok(!result.manifest.some((m) => (CERFA_2033A_FORBIDDEN_CASE_IDS as readonly string[]).includes(m.caseId)));

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, "p1-pdf-02c-2033a-slice.pdf");
    writeFileSync(outputPath, result.pdfBytes);

    const assetBytes = readAssetBytes(CERFA_2033A_MILLESIME, "2033-sd.pdf");
    const assetSha = createHash("sha256").update(assetBytes).digest("hex");
    assert.equal(assetSha, CERFA_ASSET_MANIFEST_2026.find((e) => e.form === CERFA_2033A_FORM_ID)!.sha256);
    assert.notEqual(createHash("sha256").update(result.pdfBytes).digest("hex"), assetSha);

    console.log(`P1-PDF-02-C output: ${outputPath} (1 page, ${result.pdfBytes.length} bytes)`);
  });

  it("une case sans mapping visuel bloque la génération", () => {
    // Chantier 2D-E3 — 110/180 sont désormais autorisées (registry), comme
    // 044/096/176 l'étaient déjà depuis 2D-C : plus aucune case numérotée
    // n'est structurellement interdite. "154" (Provisions pour risques,
    // jamais modélisée, non_applicable structurel) sert d'exemple de case
    // sans mapping visuel — jamais calibrée, jamais dans le registre.
    assert.equal(isAuthorized2033ASliceCase("154"), false);
    const violations = runStructuralAndMappingGate({
      millesime: CERFA_2033A_MILLESIME,
      forms: [{ form: CERFA_2033A_FORM_ID, cases: [cerfaCase("154", 1)] }],
    });
    assert.equal(violations[0]?.code, "case-sans-mapping-visuel");
    assert.equal(violations[0]?.caseId, "154");
  });
});

describe("P1-PDF-02-C — pipeline mapper existant, sans logique fiscale ajoutée", () => {
  it("generateCerfa2033AFromRfs n'envoie au renderer que les cases autorisées", async () => {
    const rfs = buildDossierTemoinRfs();
    const mapped = map2033AFromRfs(rfs);
    const unauthorizedProduced = mapped.cases.filter((c) => !isAuthorized2033ASliceCase(c.caseId));

    const result = await generateCerfa2033AFromRfs({
      rfs,
      declarationVersionId: "decl-version-2033a-slice",
      generatedAt: "2026-09-06T13:00:00.000Z",
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    assert.equal(result.form, CERFA_2033A_FORM_ID);
    assert.equal(result.pageCount, 1);
    assert.ok(result.manifest.every((m) => isAuthorized2033ASliceCase(m.caseId)));
    assert.ok(!result.manifest.some((m) => (CERFA_2033A_FORBIDDEN_CASE_IDS as readonly string[]).includes(m.caseId)));
    for (const extra of unauthorizedProduced) {
      assert.ok(!result.manifest.some((m) => m.caseId === extra.caseId), `${extra.caseId} mapper écarté du PDF`);
    }
  });

  it("generate-cerfa-2033a.ts n'importe aucun moteur fiscal ni assistant", () => {
    const source = readFileSync(path.join(__dirname, "..", "generate-cerfa-2033a.ts"), "utf-8");
    const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");
    for (const forbidden of [
      "produceFiscalResult",
      "applyAmortissementStocks",
      "capabilities/f010",
      "capabilities/f011",
      "capabilities/f012",
    ]) {
      assert.equal(importLines.includes(forbidden), false, `generate-cerfa-2033a ne doit pas importer ${forbidden}`);
    }
    assert.ok(importLines.includes("map2033AFromRfs"), "seul le mapper RFS 2033-A est autorisé côté fiscal");
  });
});

function findCase(form: ReturnType<typeof map2033AFromRfs>, caseId: string) {
  return form.cases.find((c) => c.caseId === caseId);
}

const PATRIMOINE_CASES = ["084", "120", "134", "137", "142"] as const;

describe("P1-PDF-02-E — E1 RFS F-010/F-011 → 028/030/136/156 (Elsa, fixtures runtime existantes)", () => {
  it("map2033AFromRfs produit 028/030/136/156 aux montants déjà démontrés, sans patrimoine", () => {
    const rfs = buildElsaF010F011Rfs();
    assert.equal(rfs.patrimoine, undefined);
    const form = map2033AFromRfs(rfs);
    assert.equal(findCase(form, "028")?.value, ELSA_CASE_028);
    assert.equal(findCase(form, "030")?.value, ELSA_CASE_030);
    assert.equal(findCase(form, "136")?.value, ELSA_CASE_136);
    assert.equal(findCase(form, "156")?.value, ELSA_CASE_156);
  });

  it("generateCerfa2033AFromRfs dessine 028/030/136/156 issus de F-010/F-011", async () => {
    const rfs = buildElsaF010F011Rfs();
    const result = await generateCerfa2033AFromRfs({
      rfs,
      declarationVersionId: "decl-version-2033a-e1-elsa",
      generatedAt: "2026-09-06T15:00:00.000Z",
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const sliceIds = result.manifest.map((m) => m.caseId).sort();
    assert.deepEqual(sliceIds, ["028", "030", "136", "156"]);
    assert.equal(findCase(result.form2033A, "028")?.value, ELSA_CASE_028);
    assert.equal(findCase(result.form2033A, "030")?.value, ELSA_CASE_030);
    assert.equal(findCase(result.form2033A, "136")?.value, ELSA_CASE_136);
    assert.equal(findCase(result.form2033A, "156")?.value, ELSA_CASE_156);

    const overflowDoc = await PDFDocument.create();
    const font = await overflowDoc.embedFont(StandardFonts.Helvetica);
    const drawn = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const pdf = await PDFDocument.load(result.pdfBytes);
    const pageHeight = pdf.getPages()[0].getHeight();
    const text030 = formatCerfaValue(ELSA_CASE_030, "eur-arrondi");
    const mapping030 = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, "030")!;
    const measuredWidth030 = font.widthOfTextAtSize(text030, 9);
    const hit030 = drawn.find((d) => d.text === text030);
    assert.ok(hit030, "030 Elsa introuvable dans le PDF");
    const textRight030 = hit030!.pdfLibX + measuredWidth030;
    assert.ok(hit030!.pdfLibX >= AMORT_COLUMN.xMin - 0.5, "030 dans la colonne Amortissements-Provisions");
    assert.ok(textRight030 <= AMORT_COLUMN.xMax + 0.5, "030 dans la colonne Amortissements-Provisions");
    assert.ok(hit030!.pdfLibX >= NUMBER_ZONE.amort.xMax - 0.2, "030 hors zone-numéro");
    assert.ok(textRight030 < NET_ACTIF.xMin, "030 ne doit pas écrire dans le Net actif");
    assert.ok(textRight030 <= BRUT_COLUMN.xMax + 0.5 || hit030!.pdfLibX >= BRUT_COLUMN.xMax - 0.5, "030 hors colonne Brut");
    const baseline030 = toPdfLibPoint(mapping030.position, pageHeight);
    assert.ok(Math.abs(hit030!.pdfLibY - baseline030.y) < 0.05, "030 y pdf-lib = conversion registry");

    const strings = await extractDrawnStringsForPage(result.pdfBytes, 1);
    assert.ok(strings.includes(formatCerfaValue(ELSA_CASE_028, "eur-arrondi")), "028 Elsa dans le PDF");
    assert.ok(strings.includes(text030), "030 Elsa dans le PDF (3720, pas VNC)");
    assert.ok(strings.includes(formatCerfaValue(ELSA_CASE_136, "eur-arrondi")), "136 témoin dans le PDF");
    assert.ok(strings.includes(formatCerfaValue(ELSA_CASE_156, "eur-arrondi")), "156 Elsa dans le PDF");
    assert.ok(!strings.includes(formatCerfaValue(121_416, "eur-arrondi")), "121416 (VNC erronée) ne doit pas apparaître en 030");

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, "p1-pdf-02f1-2033a-elsa-030.pdf");
    writeFileSync(outputPath, result.pdfBytes);
    console.log(`P1-PDF-02-F1 Elsa output: ${outputPath}`);
  });
});

describe("P1-PDF-02-F1 — preuve PDF synthétique contrôlée pour 030", () => {
  it("3720 tombe dans la colonne Amortissements-Provisions, hors Brut et Net actif", async () => {
    const cases = [cerfaCase("030", 3_720)];
    const result = await generateCerfaLiassePdf({
      millesime: CERFA_2033A_MILLESIME,
      forms: [{ form: CERFA_2033A_FORM_ID, cases }],
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const overflowDoc = await PDFDocument.create();
    const font = await overflowDoc.embedFont(StandardFonts.Helvetica);
    const drawn = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const text = formatCerfaValue(3_720, "eur-arrondi");
    const measuredWidth = font.widthOfTextAtSize(text, 9);
    const hit = drawn.find((d) => d.text === text);
    assert.ok(hit, `030 preuve : "${text}" introuvable`);
    const textRight = hit!.pdfLibX + measuredWidth;
    assert.ok(hit!.pdfLibX >= AMORT_COLUMN.xMin - 0.5);
    assert.ok(textRight <= AMORT_COLUMN.xMax + 0.5);
    assert.ok(hit!.pdfLibX >= NUMBER_ZONE.amort.xMax - 0.2);
    assert.ok(textRight < NET_ACTIF.xMin);
    assert.ok(textRight <= BRUT_COLUMN.xMax + 0.5 || hit!.pdfLibX >= BRUT_COLUMN.xMax - 0.5);

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, "p1-pdf-02f1-2033a-030-proof.pdf");
    writeFileSync(outputPath, result.pdfBytes);
    console.log(`P1-PDF-02-F1 proof output: ${outputPath}`);
  });
});

describe("P1-PDF-02-E — E2 patrimoine absent ne débloque pas 084/120/134/137/142", () => {
  it("RFS Elsa F-010/F-011 sans patrimoine : les 5 cases restent bloquées", () => {
    const form = map2033AFromRfs(buildElsaF010F011Rfs());
    for (const caseId of PATRIMOINE_CASES) {
      assert.equal(findCase(form, caseId), undefined, `${caseId} ne doit pas être inventée sans patrimoine`);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === caseId), `${caseId} doit être explicitement bloquée`);
    }
  });

  it("fixture synthétique P0 sans patrimoine : 084/120/134/137/142 absentes", () => {
    const rfs = buildSyntheticP0RfsSansPatrimoine();
    assert.equal(rfs.patrimoine, undefined);
    const form = map2033AFromRfs(rfs);
    for (const caseId of PATRIMOINE_CASES) {
      assert.equal(findCase(form, caseId), undefined, `${caseId} bloquée sans patrimoine`);
    }
  });
});

describe("P1-PDF-02-E — E3 fixture SYNTHÉTIQUE P0 + patrimoine (pas des données Elsa)", () => {
  it("assemblePatrimoine + transport RFS ouvre les 8 cases aux montants de la fixture existante", () => {
    const rfs = buildSyntheticP0RfsAvecPatrimoine();
    assert.ok(rfs.patrimoine, "patrimoine transporté, jamais inventé par le mapper");
    const form = map2033AFromRfs(rfs);
    for (const [caseId, expected] of Object.entries(SYNTHETIC_P0_CASES)) {
      assert.equal(findCase(form, caseId)?.value, expected, `${caseId} fixture synthétique P0`);
    }
  });
});

describe("P1-PDF-02-E — E4 137 INCONNU → 137 et 142 absents", () => {
  it("subventions absentes de BilanInputs : 137 et 142 restent bloquées, les autres cases patrimoine restent", () => {
    const { subventionsInvestissement: _ignored, ...sans137 } = SYNTHETIC_P0_BILAN_INPUTS;
    const rfs = buildSyntheticP0RfsAvecPatrimoine(sans137);
    const form = map2033AFromRfs(rfs);
    assert.equal(rfs.patrimoine?.subventionsInvestissement.status, "INCONNU");
    assert.equal(findCase(form, "137"), undefined);
    assert.equal(findCase(form, "142"), undefined);
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "137"));
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "142"));
    assert.equal(findCase(form, "084")?.value, SYNTHETIC_P0_CASES["084"]);
    assert.equal(findCase(form, "120")?.value, SYNTHETIC_P0_CASES["120"]);
    assert.equal(findCase(form, "134")?.value, SYNTHETIC_P0_CASES["134"]);
  });
});

describe("P1-PDF-02-E — E5 bilan non EQUILIBRE → 142 absent", () => {
  it("137 déclaré sans contrepartie d'actif : DESEQUILIBRE_REEL, 142 bloquée, 137 publiée", () => {
    const rfs = buildSyntheticP0RfsAvecPatrimoine({
      ...SYNTHETIC_P0_BILAN_INPUTS,
      subventionsInvestissement: { status: "DECLARE", montant: 2500 },
    });
    const equilibre = checkBilanEquilibre({ patrimoine: rfs.patrimoine! });
    assert.notEqual(equilibre.status, "EQUILIBRE");
    const form = map2033AFromRfs(rfs);
    assert.equal(findCase(form, "137")?.value, 2500);
    assert.equal(findCase(form, "142"), undefined, "142 jamais forcée hors équilibre");
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "142"));
  });
});

describe("P1-PDF-02-E — E6 136 = resultatComptable, jamais resultatFiscal", () => {
  it("dossier témoin : 136 = −13 681 = helper unique, distinct de resultatFiscal = 0", () => {
    const rfs = buildDossierTemoinRfs();
    const form = map2033AFromRfs(rfs);
    const case136 = findCase(form, "136");
    assert.equal(case136?.value, ELSA_CASE_136);
    assert.equal(resultatComptable(DOSSIER_TEMOIN_FISCAL_RESULT), ELSA_CASE_136);
    assert.equal(DOSSIER_TEMOIN_FISCAL_RESULT.resultatFiscal, 0);
    assert.notEqual(case136?.value, DOSSIER_TEMOIN_FISCAL_RESULT.resultatFiscal);
    assert.ok(case136?.trace.path.includes("resultatAvantAmort"));
    assert.equal(case136?.trace.path.includes("resultatFiscal"), false);
  });
});

describe("P1-PDF-02-E — E7 PDF réel, fixture SYNTHÉTIQUE P0, 8 cases mapper (086 absente)", () => {
  it("les 8 cases de la fixture synthétique sont dessinées ; 086 reste hors PDF (provision inconnue)", async () => {
    const rfs = buildSyntheticP0RfsAvecPatrimoine();
    const result = await generateCerfa2033AFromRfs({
      rfs,
      declarationVersionId: "decl-version-2033a-e7-synthetic-p0",
      generatedAt: "2026-09-06T15:00:00.000Z",
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const expectedCaseIds = Object.keys(SYNTHETIC_P0_CASES).sort();
    assert.equal(result.manifest.length, expectedCaseIds.length);
    assert.deepEqual(result.manifest.map((m) => m.caseId).sort(), expectedCaseIds);
    assert.ok(!result.manifest.some((m) => m.caseId === "086"), "086 ne doit pas être dessinée sans provision explicite");
    assert.ok(!result.manifest.some((m) => (CERFA_2033A_FORBIDDEN_CASE_IDS as readonly string[]).includes(m.caseId)));

    const overflowDoc = await PDFDocument.create();
    const font = await overflowDoc.embedFont(StandardFonts.Helvetica);
    const drawn = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const pdf = await PDFDocument.load(result.pdfBytes);
    const pageHeight = pdf.getPages()[0].getHeight();

    for (const caseId of expectedCaseIds) {
      const expectedValue = SYNTHETIC_P0_CASES[caseId as keyof typeof SYNTHETIC_P0_CASES];
      assert.equal(findCase(result.form2033A, caseId)?.value, expectedValue, `${caseId} mapper = fixture synthétique`);
      const text = formatCerfaValue(expectedValue, "eur-arrondi");
      const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, caseId)!;
      const box = VALUE_BOXES_PYMUPDF[caseId];
      const numberZone = numberZoneFor(caseId);
      const baseline = toPdfLibPoint(mapping.position, pageHeight);
      const measuredWidth = font.widthOfTextAtSize(text, 9);

      const hit = drawn.find((d) => {
        if (d.text !== text) return false;
        if (Math.abs(d.pdfLibY - baseline.y) >= 0.05) return false;
        const textRight = d.pdfLibX + measuredWidth;
        return d.pdfLibX >= box.x - 0.5 && textRight <= box.x + box.w + 0.5;
      });
      assert.ok(hit, `${caseId} : "${text}" introuvable dans la boîte de valeur (fixture synthétique P0)`);
      assert.ok(hit.pdfLibX >= numberZone.xMax - 0.2, `${caseId} hors zone-numéro`);
    }

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, "p1-pdf-02e-2033a-synthetic-p0.pdf");
    writeFileSync(outputPath, result.pdfBytes);
    console.log(`P1-PDF-02-E E7 output: ${outputPath} (fixture SYNTHÉTIQUE P0, pas Elsa)`);
  });
});

describe("P1-PDF-02-F2 — 086 Disponibilités, colonne Amortissements-Provisions", () => {
  it("preuve géométrique contrôlée : 086=0 dans la colonne Amort., hors Brut et Net actif", async () => {
    const cases = [cerfaCase("086", 0)];
    const result = await generateCerfaLiassePdf({
      millesime: CERFA_2033A_MILLESIME,
      forms: [{ form: CERFA_2033A_FORM_ID, cases }],
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const overflowDoc = await PDFDocument.create();
    const font = await overflowDoc.embedFont(StandardFonts.Helvetica);
    const drawn = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const text = formatCerfaValue(0, "eur-arrondi");
    const measuredWidth = font.widthOfTextAtSize(text, 9);
    const hit = drawn.find((d) => d.text === text);
    assert.ok(hit, `086 preuve : "${text}" introuvable`);
    const textRight = hit!.pdfLibX + measuredWidth;
    assert.ok(hit!.pdfLibX >= AMORT_COLUMN.xMin - 0.5);
    assert.ok(textRight <= AMORT_COLUMN.xMax + 0.5);
    assert.ok(hit!.pdfLibX >= NUMBER_ZONE.amort.xMax - 0.2);
    assert.ok(textRight < NET_ACTIF.xMin);
    assert.ok(textRight <= BRUT_COLUMN.xMax + 0.5 || hit!.pdfLibX >= BRUT_COLUMN.xMax - 0.5);

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, "p1-pdf-02f2-2033a-086-proof.pdf");
    writeFileSync(outputPath, result.pdfBytes);
    console.log(`P1-PDF-02-F2 proof output: ${outputPath}`);
  });

  it("084=3000 et 086=0 côte à côte : Brut vs Amort., jamais la même colonne", async () => {
    const cases = [cerfaCase("084", 3_000), cerfaCase("086", 0)];
    const result = await generateCerfaLiassePdf({
      millesime: CERFA_2033A_MILLESIME,
      forms: [{ form: CERFA_2033A_FORM_ID, cases }],
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const overflowDoc = await PDFDocument.create();
    const font = await overflowDoc.embedFont(StandardFonts.Helvetica);
    const drawn = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const text084 = formatCerfaValue(3_000, "eur-arrondi");
    const text086 = formatCerfaValue(0, "eur-arrondi");
    const hit084 = drawn.find((d) => d.text === text084);
    const hit086 = drawn.find((d) => d.text === text086);
    assert.ok(hit084 && hit086);
    const right084 = hit084!.pdfLibX + font.widthOfTextAtSize(text084, 9);
    const right086 = hit086!.pdfLibX + font.widthOfTextAtSize(text086, 9);
    assert.ok(right084 <= BRUT_COLUMN.xMax + 0.5);
    assert.ok(hit086!.pdfLibX >= AMORT_COLUMN.xMin - 0.5);
    assert.ok(right086 <= AMORT_COLUMN.xMax + 0.5);

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, "p1-pdf-02f2-2033a-084-086-columns.pdf");
    writeFileSync(outputPath, result.pdfBytes);
    console.log(`P1-PDF-02-F2 columns output: ${outputPath}`);
  });

  it("mapper synthétique P0 : 084 publiée, 086 absente du manifest PDF", async () => {
    const rfs = buildSyntheticP0RfsAvecPatrimoine();
    const form = map2033AFromRfs(rfs);
    assert.equal(findCase(form, "084")?.value, SYNTHETIC_P0_CASES["084"]);
    assert.equal(findCase(form, "086"), undefined);
    const result = await generateCerfa2033AFromRfs({
      rfs,
      declarationVersionId: "decl-version-2033a-f2-synthetic",
      generatedAt: "2026-09-06T18:00:00.000Z",
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    assert.ok(result.manifest.some((m) => m.caseId === "084"));
    assert.ok(!result.manifest.some((m) => m.caseId === "086"));
  });
});

/**
 * Chantier 2D-E3 — R7 : 110/180 réellement PRODUITES par le runtime.
 *
 * Contrairement à R1-R6 (qui injectent des CerfaCase littérales pour
 * vérifier le registre/renderer indépendamment du moteur, exactement comme
 * pour 044/096/112/176 depuis 2D-C), ce bloc construit une vraie RFS
 * (assemblePatrimoine → map2033AFromRfs → generateCerfa2033AFromRfs) : les
 * valeurs de 110/180 recherchées dans le PDF sont celles QUE LE MOTEUR A
 * RÉELLEMENT CALCULÉES, jamais un nombre choisi indépendamment dans ce
 * fichier. Fixture identique à celle déjà démontrée dans
 * bilan-map-2033a-2d-totaux-generaux.test.ts (chantier 2D-E2) — mêmes
 * valeurs, EQUILIBRE réel, 110 = 64800, 180 = 61800.
 */
const RUNTIME_TRUTH_FISCAL_RESULT: FiscalResult = {
  exercice: 2025,
  recettes: { total: 12000 },
  charges: { totalDeductible: 4000, chargesExploitation: 4000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
  resultatAvantAmort: 7000,
  amortCalcule: 1500,
  amortDeduct: 1500,
  amortReporte: 0,
  amortReportesUtilises: 0,
  resultatFiscal: 5500,
  deficitNouveau: 0,
  deficitsImputes: 0,
  perteExceptionnelle: 0,
  stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
  trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
  status: "computed",
  anomalies: [],
};

const RUNTIME_TRUTH_IMMOBILISATIONS: ImmobilisationsRfs = {
  lignes: [{ label: "Composant", montant: 45000, dureeAnnees: 30, dotationExercice: 1500, amortissementsCumules: 1500, vnc: 43500 }],
  totalAnnuelExercice: 1500,
  totalBrut: 45000,
  valeurTerrain: 15000,
};

const RUNTIME_TRUTH_EMPRUNT: PretFinancementExercice = {
  pretId: "pret-1",
  typePret: "amortissable",
  interetsEmpruntExercice: 800,
  interetsPreExploitation: 0,
  assuranceEmpruntExercice: 100,
  assurancePreExploitation: 0,
  capitalRembourseExercice: 2000,
  capitalRestantDu31_12: 20000,
  fraisDossierDeductibles: 0,
  garantieDeductible: 0,
  iraDeductible: 0,
};

const RUNTIME_TRUTH_IDENTITE: IdentiteDeclarante = {
  siren: "104545108",
  siret: "10454510800011",
  denomination: "Chantier 2D-E3 R7 — 110/180 vérité runtime",
};

const RUNTIME_TRUTH_BILAN_INPUTS: BilanInputs = {
  tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
  compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
  ran: { situation: "NATIF" },
  subventionsInvestissement: { status: "NUL_CONFIRME" },
  tiers: {
    creances: { status: "DECLARE", montant: 300 },
    dettes: { status: "DECLARE", montant: 300 },
    reconciliationEmprunts: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
  },
  lignesSimples: {
    autresImmobilisationsIncorporellesBrut: { status: "DECLARE", montant: 500 }, // 014
    immobilisationsFinancieresBrut: { status: "DECLARE", montant: 600 }, // 040
    valeursMobilieresPlacementBrut: { status: "DECLARE", montant: 400 }, // 080
    avancesAcomptesVerses: { status: "NUL_CONFIRME" }, // 064
    chargesConstateesAvance: { status: "NUL_CONFIRME" }, // 092
    produitsConstatesAvance: { status: "NUL_CONFIRME" }, // 174
    autresDettes: { status: "NUL_CONFIRME" }, // 175
  },
  ventilationTiers: {
    postes: [
      { nature: "LOYER_DU_PAR_LOCATAIRE", montant: 100 }, // 068
      { nature: "AUTRE_CREANCE_ACTIVITE", montant: 200 }, // 072 — creances : 300
      { nature: "ACOMPTE_RECU_SUR_COMMANDE", montant: 100 }, // 164
      { nature: "FOURNISSEUR_NON_PAYE", montant: 100 }, // 166
      { nature: "DETTE_FISCALE_OU_SOCIALE", montant: 100 }, // 172 — dettes : 300
    ],
  },
};

function buildRuntimeTruthRfs(): FiscalRepresentation {
  return {
    exercice: RUNTIME_TRUTH_FISCAL_RESULT.exercice,
    identite: RUNTIME_TRUTH_IDENTITE,
    fiscalResult: RUNTIME_TRUTH_FISCAL_RESULT,
    immobilisations: RUNTIME_TRUTH_IMMOBILISATIONS,
    emprunts: [RUNTIME_TRUTH_EMPRUNT],
    trace: {
      ksArtifacts: RUNTIME_TRUTH_FISCAL_RESULT.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: RUNTIME_TRUTH_FISCAL_RESULT.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

describe("P1-PDF-02-C/2D-E3 — R7 : 110/180 réellement produites par le runtime (pas un calcul local)", () => {
  it("le moteur calcule bien 110 = 64800 et 180 = 61800 sur cette fixture (préalable, avant toute génération PDF)", () => {
    const rfsSansPatrimoine = buildRuntimeTruthRfs();
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, RUNTIME_TRUTH_BILAN_INPUTS);
    const equilibre = checkBilanEquilibre({ patrimoine });
    assert.equal(equilibre.status, "EQUILIBRE", JSON.stringify(equilibre.reasons));
    const form = map2033AFromRfs({ ...rfsSansPatrimoine, patrimoine });
    assert.equal(form.cases.find((c) => c.caseId === "044")?.value, 61100);
    assert.equal(form.cases.find((c) => c.caseId === "096")?.value, 3700);
    assert.equal(form.cases.find((c) => c.caseId === "110")?.value, 64800);
    assert.equal(form.cases.find((c) => c.caseId === "142")?.value, 41500);
    assert.equal(form.cases.find((c) => c.caseId === "176")?.value, 20300);
    assert.equal(form.cases.find((c) => c.caseId === "180")?.value, 61800);
  });

  it("le PDF réellement généré porte la valeur RÉELLE (64800/61800) de 110/180, à la position calibrée, colonne correcte, occurrence unique", async () => {
    const rfsSansPatrimoine = buildRuntimeTruthRfs();
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, RUNTIME_TRUTH_BILAN_INPUTS);
    const rfs = { ...rfsSansPatrimoine, patrimoine };
    const result = await generateCerfa2033AFromRfs({
      rfs,
      declarationVersionId: "decl-version-2033a-r7-runtime-truth",
      generatedAt: "2026-09-07T00:00:00.000Z",
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    assert.ok(result.manifest.some((m) => m.caseId === "110"));
    assert.ok(result.manifest.some((m) => m.caseId === "180"));

    const overflowDoc = await PDFDocument.create();
    const font = await overflowDoc.embedFont(StandardFonts.Helvetica);
    const strings = await extractDrawnStringsForPage(result.pdfBytes, 1);
    const drawn = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const pdf = await PDFDocument.load(result.pdfBytes);
    const pageHeight = pdf.getPages()[0].getHeight();

    const text110 = formatCerfaValue(64_800, "eur-arrondi");
    const text180 = formatCerfaValue(61_800, "eur-arrondi");
    assert.equal(text110, "64 800");
    assert.equal(text180, "61 800");

    // Occurrence unique de chaque valeur sur la page entière (aucune autre
    // case de ce dossier ne partage ces montants).
    assert.equal(strings.filter((s) => s === text110).length, 1, "64 800 doit apparaître exactement une fois");
    assert.equal(strings.filter((s) => s === text180).length, 1, "61 800 doit apparaître exactement une fois");

    const mapping110 = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, "110")!;
    const mapping180 = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, "180")!;
    assert.equal(mapping110.position.x, 372.3, "110 : ancrage Brut (chantier 2D-D)");
    assert.equal(mapping110.position.y, 426.56, "110 : y calibré chantier 2D-D");
    assert.equal(mapping180.position.x, 566.6, "180 : ancrage NET Passif (chantier 2D-D)");
    assert.equal(mapping180.position.y, 752.56, "180 : y calibré chantier 2D-D");

    const baseline110 = toPdfLibPoint(mapping110.position, pageHeight);
    const baseline180 = toPdfLibPoint(mapping180.position, pageHeight);
    const width110 = font.widthOfTextAtSize(text110, 9);
    const width180 = font.widthOfTextAtSize(text180, 9);

    const hit110 = drawn.find((d) => d.text === text110 && Math.abs(d.pdfLibY - baseline110.y) < 0.05);
    const hit180 = drawn.find((d) => d.text === text180 && Math.abs(d.pdfLibY - baseline180.y) < 0.05);
    assert.ok(hit110, "110 introuvable à la position calibrée");
    assert.ok(hit180, "180 introuvable à la position calibrée");

    // Colonne Brut pour 110 (jamais Net) ; colonne NET pour 180 (jamais Brut/Amort.).
    assert.ok(hit110!.pdfLibX + width110 < NET_ACTIF.xMin, "110 ne doit pas écrire dans le Net actif");
    assert.ok(hit110!.pdfLibX <= AMORT_COLUMN.xMin + 0.5, "110 ne doit pas écrire dans la colonne Amort.");
    assert.ok(hit180!.pdfLibX >= NET_ACTIF.xMin - 0.5, "180 doit être en colonne NET, jamais Brut/Amort. actif");

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, "p1-pdf-02d-e3-2033a-110-180-runtime-truth.pdf");
    writeFileSync(outputPath, result.pdfBytes);
    console.log(`Chantier 2D-E3 R7 output: ${outputPath}`);
  });
});
