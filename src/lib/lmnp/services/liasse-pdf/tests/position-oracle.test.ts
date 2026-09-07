/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/position-oracle.test.ts
 *
 * TEST DE POSITION INDÉPENDANT (section 6 de la mission de correction P0,
 * réponse directe à l'audit indépendant Cursor/Grok, point A03).
 *
 * Avant cette mission, aucun test ne comparait une position du registre à
 * une référence EXTÉRIEURE au registre lui-même : `coordinates.test.ts` ne
 * vérifie que l'arithmétique de conversion top-left → pdf-lib, et le golden
 * master ne vérifie que la PRÉSENCE d'une chaîne sur une page, jamais sa
 * position. Un `372` écrit dans la mauvaise colonne passait tous les tests
 * existants — c'est exactement ce que l'audit a démontré.
 *
 * Ce fichier utilise `independent-grid-oracle.ts`, qui dérive les bornes
 * réelles des boîtes de case en lisant DIRECTEMENT les octets du Cerfa
 * officiel vierge (deux bibliothèques indépendantes : pdfjs-dist pour le
 * texte, pdf-lib pour les opérateurs vectoriels de la grille) — jamais en
 * important quoi que ce soit de `registry/`. C'est un oracle, pas un
 * second calcul du même registre.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assembleForm2031SD } from "@/runtime/capabilities/f007/assemble-form-2031";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import { map2033CFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033c";

import { generateCerfaLiassePdf } from "../generator/render-cerfa-liasse";
import { readAssetBytes } from "../assets/load-asset";
import { resolveVisualMapping } from "../registry";
import { extractDrawnTextPositionsForPage } from "./extract-rendered-text";
import {
  deriveCase300Boxes,
  deriveCase330Boxes,
  deriveCase350Boxes,
  deriveCase370372Boxes,
  deriveCase2033CTotalRowBoxes,
  deriveResultatFiscalColumnBoxes,
  derive2033ACaseBoxes,
  derive2033AColumnFamilies,
  xInBox,
  type ColumnBox,
} from "./independent-grid-oracle";
import { buildDossierTemoinRfs, DOSSIER_TEMOIN_FISCAL_RESULT, DOSSIER_TEMOIN_IDENTITE } from "./golden-master-technical-pipeline.test";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import { buildScenarioRfs } from "./scenario-beneficiaire.test";
import { CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME } from "../generate-cerfa-2033a";
import type { CerfaCase } from "../types";

// Tolérance = largeur du trait de grille du Cerfa officiel (mesurée : les
// séparateurs sont tracés avec une épaisseur de trait de 0.76pt, voir le
// flux de contenu de l'asset) + une petite marge typographique. Volontairement
// bien plus petite que la largeur d'une zone-numéro de case (14.3pt sur
// 2033-B) : ne peut jamais confondre une boîte de VALEUR avec la zone-numéro
// voisine, seulement absorber l'imprécision de tracé du bord lui-même.
const GRID_LINE_TOLERANCE_PT = 1.5;

/**
 * Correction fiscale P0 (audit indépendant Cursor/Grok) — le déficit LMNP
 * non professionnel n'alimente plus jamais 372/C_L1_COL2 (voir map-2033b.ts,
 * map-2031-recapitulation.ts) : F-006 garantit `resultatFiscal >= 0` en
 * toute circonstance (TRF-0031), donc le dossier témoin réel (déficitaire)
 * n'exerce plus jamais ces deux cases — c'est désormais le comportement
 * FISCALEMENT CORRECT, pas une régression géométrique. Pour continuer à
 * prouver la GÉOMÉTRIE de 372/C_L1_COL2 (leur registre reste calibré et
 * doit rester testé — voir case-372-fiscal-divergence.test.ts, "RÉSOLU"),
 * ce fixture synthétique force un `resultatFiscal` négatif — un cas que le
 * F-006 actuel ne produit jamais, mais que le mapper doit continuer à
 * traiter correctement si cette garantie changeait un jour.
 */
function buildSyntheticNegativeResultatFiscalRfs(deficit: number): FiscalRepresentation {
  return {
    exercice: DOSSIER_TEMOIN_FISCAL_RESULT.exercice,
    identite: DOSSIER_TEMOIN_IDENTITE,
    fiscalResult: { ...DOSSIER_TEMOIN_FISCAL_RESULT, resultatFiscal: -deficit, deficitNouveau: 0 },
    trace: {
      ksArtifacts: DOSSIER_TEMOIN_FISCAL_RESULT.trace.ksArtifacts,
      assembledAt: "2026-05-01T00:00:00.000Z",
      sourceFiscalResultAt: DOSSIER_TEMOIN_FISCAL_RESULT.trace.computedAt,
      sources: { identite: "synthétique (position-oracle.test.ts)", fiscalResult: "synthétique (position-oracle.test.ts)" },
    },
  };
}

/**
 * Fixture synthétique pour la case 350 (MICRO-JALON implémentation 350) —
 * règle fiscale VERROUILLÉE : `350 = deficitsImputes`. Le dossier témoin réel
 * (deficitsImputes=0) est fiscalement non discriminant pour tester
 * graphiquement une valeur positive — voir golden-master-technical-pipeline.test.ts
 * pour la preuve sur le dossier témoin (350=0). Ce fixture construit un
 * FiscalResult réaliste (bénéfice de l'exercice après imputation d'un
 * déficit antérieur, même structure que le scénario R3 déjà validé pour le
 * Cadre I du 2031-bis) — jamais recalculé par F-006 ici, seulement le
 * mapper 2033-B (INCHANGÉ) est exercé, exactement comme pour les fixtures
 * synthétiques 372/C_L1_COL2 ci-dessus.
 */
function buildSyntheticDeficitsImputesRfs(deficitsImputes: number): FiscalRepresentation {
  return {
    exercice: DOSSIER_TEMOIN_FISCAL_RESULT.exercice,
    identite: DOSSIER_TEMOIN_IDENTITE,
    fiscalResult: { ...DOSSIER_TEMOIN_FISCAL_RESULT, resultatFiscal: 3000, deficitNouveau: 0, deficitsImputes },
    trace: {
      ksArtifacts: DOSSIER_TEMOIN_FISCAL_RESULT.trace.ksArtifacts,
      assembledAt: "2026-05-01T00:00:00.000Z",
      sourceFiscalResultAt: DOSSIER_TEMOIN_FISCAL_RESULT.trace.computedAt,
      sources: { identite: "synthétique (position-oracle.test.ts)", fiscalResult: "synthétique (position-oracle.test.ts)" },
    },
  };
}

/**
 * Fixture synthétique pour la case 300 (MICRO-JALON implémentation 300) —
 * `300 = fiscalResult.perteExceptionnelle`, pass-through pur (TRF-0027),
 * inchangé par ce jalon. Le dossier témoin réel (perteExceptionnelle=0) ne
 * suffit pas pour prouver graphiquement une valeur positive — même principe
 * que `buildSyntheticDeficitsImputesRfs` pour 350.
 */
function buildSyntheticPerteExceptionnelleRfs(perteExceptionnelle: number): FiscalRepresentation {
  return {
    exercice: DOSSIER_TEMOIN_FISCAL_RESULT.exercice,
    identite: DOSSIER_TEMOIN_IDENTITE,
    fiscalResult: { ...DOSSIER_TEMOIN_FISCAL_RESULT, perteExceptionnelle },
    trace: {
      ksArtifacts: DOSSIER_TEMOIN_FISCAL_RESULT.trace.ksArtifacts,
      assembledAt: "2026-05-01T00:00:00.000Z",
      sourceFiscalResultAt: DOSSIER_TEMOIN_FISCAL_RESULT.trace.computedAt,
      sources: { identite: "synthétique (position-oracle.test.ts)", fiscalResult: "synthétique (position-oracle.test.ts)" },
    },
  };
}

describe("Oracle de position indépendant — 2033-B-SD, ligne 300 (MICRO-JALON implémentation 300)", () => {
  // Bandes de référence des lignes voisines de 300, mesurées en LECTURE
  // SEULE lors du jalon de calibration géométrique dédié (quatre méthodes
  // convergentes : PyMuPDF, opérateurs vectoriels, pdfjs-dist, raster) —
  // jamais dérivées du registre. Ligne 294 juste au-dessus, zone grisée du
  // memo "348" juste en dessous : ni l'une ni l'autre ne doit jamais
  // recevoir la valeur de 300.
  const ROW_294_BAND = { yMin: 343.839, yMax: 355.2 };
  const GREY_ZONE_348_BAND = { yMin: 383.402, yMax: 400.192 };

  it("A — sanity check : valueBox300 existe, largeur positive, cohérente avec les séparateurs officiels", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase300Boxes(bytes);
    assert.ok(boxes.valueBox300.xMax > boxes.valueBox300.xMin, "valueBox300 doit avoir une largeur positive");
    assert.ok(boxes.valueBox300.xMax - boxes.valueBox300.xMin > 40, "valueBox300 doit être une vraie boîte de valeur, pas une zone-numéro étroite (14.4pt)");
    assert.ok(boxes.numberZone300.xMax <= boxes.valueBox300.xMin + 1, "la zone-numéro 300 doit précéder sa boîte de valeur");
  });

  it("B — le mapping registry de 300 est entièrement contenu dans valueBox300", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase300Boxes(bytes);
    const mapping300 = resolveVisualMapping("2033-B-SD", 2026, "300");
    assert.ok(mapping300, "300 doit avoir une entrée de registre (MICRO-JALON implémentation 300)");
    assert.ok(
      xInBox(mapping300!.position.x, boxes.valueBox300, GRID_LINE_TOLERANCE_PT),
      `x=${mapping300!.position.x} doit être dans la boîte de valeur de 300 [${boxes.valueBox300.xMin},${boxes.valueBox300.xMax}]`,
    );
  });

  it("C — RÉGRESSION anti-erreur zone-numéro : le mapping ne doit jamais tomber dans numberZone300", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase300Boxes(bytes);
    const mapping300 = resolveVisualMapping("2033-B-SD", 2026, "300");
    assert.ok(mapping300);
    assert.ok(
      !xInBox(mapping300!.position.x, boxes.numberZone300, GRID_LINE_TOLERANCE_PT),
      "la position ne doit pas être dans la zone-numéro '300' (répétition de l'erreur historique P0-1 sur 372)",
    );
    // Preuve que l'oracle aurait détecté l'erreur : le centre de la
    // zone-numéro elle-même, testé directement, est bien DANS cette zone.
    const hypotheticalBuggyX = (boxes.numberZone300.xMin + boxes.numberZone300.xMax) / 2;
    assert.ok(xInBox(hypotheticalBuggyX, boxes.numberZone300, GRID_LINE_TOLERANCE_PT));
    assert.ok(!xInBox(hypotheticalBuggyX, boxes.valueBox300, GRID_LINE_TOLERANCE_PT));
  });

  it("D — RÉGRESSION anti-voisin : la valeur dessinée ne doit chevaucher ni la ligne 294 au-dessus, ni la zone grisée du memo 348 en dessous", async () => {
    const rfs = buildSyntheticPerteExceptionnelleRfs(1000);
    const form2033B = map2033BFromRfs(rfs);
    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: form2033B.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const case300Drawing = positions.find((p) => p.text === "1 000");
    assert.ok(case300Drawing, "la valeur '1 000' (300) doit être réellement dessinée");

    const pageHeight = 841.8897705078125;
    const BBOX_TOP_TO_BASELINE_PT = 9.675;
    const topLeftYApprox = pageHeight - case300Drawing!.pdfLibY - BBOX_TOP_TO_BASELINE_PT;
    assert.ok(
      !(topLeftYApprox >= ROW_294_BAND.yMin && topLeftYApprox <= ROW_294_BAND.yMax),
      `la valeur dessinée (y≈${topLeftYApprox}) ne doit jamais tomber dans la bande de la ligne 294 [${ROW_294_BAND.yMin},${ROW_294_BAND.yMax}]`,
    );
    assert.ok(
      !(topLeftYApprox >= GREY_ZONE_348_BAND.yMin && topLeftYApprox <= GREY_ZONE_348_BAND.yMax),
      `la valeur dessinée (y≈${topLeftYApprox}) ne doit jamais tomber dans la zone grisée du memo 348 [${GREY_ZONE_348_BAND.yMin},${GREY_ZONE_348_BAND.yMax}]`,
    );
  });

  it("E — PDF généré (fixture synthétique, 300=9862) — la valeur est réellement dessinée dans valueBox300, jamais dans numberZone300", async () => {
    const rfs = buildSyntheticPerteExceptionnelleRfs(9862);
    const form2033B = map2033BFromRfs(rfs);
    assert.ok(form2033B.cases.some((c) => c.caseId === "300" && c.value === 9862), "précondition : le mapper doit produire 300=9862 (perteExceptionnelle, pass-through TRF-0027)");

    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: form2033B.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const case300Drawing = positions.find((p) => p.text === "9 862");
    assert.ok(case300Drawing, "la valeur '9 862' (300) doit être réellement dessinée (extraite des octets du PDF, pas du manifeste)");

    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase300Boxes(bytes);
    assert.ok(
      xInBox(case300Drawing!.pdfLibX, boxes.valueBox300, GRID_LINE_TOLERANCE_PT),
      `la valeur dessinée à x=${case300Drawing!.pdfLibX} doit tomber dans la boîte de valeur de 300 [${boxes.valueBox300.xMin},${boxes.valueBox300.xMax}]`,
    );
    assert.ok(!xInBox(case300Drawing!.pdfLibX, boxes.numberZone300, GRID_LINE_TOLERANCE_PT), "ne doit jamais chevaucher la zone-numéro imprimée '300'");

    // Non-régression verticale : la valeur doit rester dans la bande de la
    // ligne démontrée en lecture seule (y top-left ∈ [367.03,383.49]),
    // reconvertie ici via le même écart que `coordinates.ts`
    // (BBOX_TOP_TO_BASELINE_PT=9.675), pas une dépendance au registre.
    const pageHeight = 841.8897705078125;
    const BBOX_TOP_TO_BASELINE_PT = 9.675;
    const topLeftYApprox = pageHeight - case300Drawing!.pdfLibY - BBOX_TOP_TO_BASELINE_PT;
    assert.ok(topLeftYApprox >= 366.0 && topLeftYApprox <= 384.5, `la valeur dessinée doit rester dans la bande verticale de la ligne 300 (mesuré: ${topLeftYApprox})`);
  });

  it("non-régression — 294/310/312/314/330/350/370/372 restent inchangées après l'ajout de 300 au registre", async () => {
    // 312/314/370/372 : coordonnées stockées inchangées (comparaison directe
    // contre les valeurs déjà démontrées et commitées avant ce jalon — cette
    // entrée de registre n'a pas été touchée par l'ajout de 300).
    const mapping312 = resolveVisualMapping("2033-B-SD", 2026, "312");
    const mapping314 = resolveVisualMapping("2033-B-SD", 2026, "314");
    const mapping370 = resolveVisualMapping("2033-B-SD", 2026, "370");
    const mapping372 = resolveVisualMapping("2033-B-SD", 2026, "372");
    assert.deepEqual(mapping312?.position, { space: "top-left", x: 426.0, y: 424.8 });
    assert.deepEqual(mapping314?.position, { space: "top-left", x: 507.0, y: 424.8 });
    assert.deepEqual(mapping370?.position, { space: "top-left", x: 426.0, y: 787.8 });
    assert.deepEqual(mapping372?.position, { space: "top-left", x: 507.0, y: 787.8 });

    // 294/310/330/350 : exercées par le dossier témoin réel, vérifiées de
    // bout en bout (génération + extraction), pas seulement en statique.
    const rfs = buildDossierTemoinRfs();
    const form2033B = map2033BFromRfs(rfs);
    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: form2033B.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const boxes330 = await deriveCase330Boxes(readAssetBytes(2026, "2033-sd.pdf"));
    const boxes350 = await deriveCase350Boxes(readAssetBytes(2026, "2033-sd.pdf"));
    const case330Drawing = positions.find((p) => p.text === "9 862" && xInBox(p.pdfLibX, boxes330.valueBox330, GRID_LINE_TOLERANCE_PT));
    assert.ok(case330Drawing, "330=9862 doit rester dessinée dans sa boîte, non affectée par l'ajout de 300 au registre");
    const case350Drawing = positions.find((p) => p.text === "0" && xInBox(p.pdfLibX, boxes350.valueBox350, GRID_LINE_TOLERANCE_PT));
    assert.ok(case350Drawing, "350=0 doit rester dessinée dans sa boîte, non affectée par l'ajout de 300 au registre");
    const case294Drawing = positions.find((p) => p.text === "4 602");
    assert.ok(case294Drawing, "294=4602 doit rester dessinée, non affectée par 300");
    const case310Drawing = positions.find((p) => p.text === "(13 681)");
    assert.ok(case310Drawing, "310=(13681) doit rester dessinée, non affectée par 300");
  });
});

describe("Oracle de position indépendant — 2033-B-SD, ligne 370/372", () => {
  it("dérive des boîtes cohérentes avec la structure connue du Cerfa officiel (sanity check de l'oracle lui-même)", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase370372Boxes(bytes);
    assert.ok(boxes.beneficeBox.xMax <= boxes.numberZone372.xMin + 1, "la boîte bénéfice doit précéder la zone-numéro 372");
    assert.ok(boxes.numberZone372.xMax <= boxes.deficitBox.xMin + 1, "la zone-numéro 372 doit précéder la boîte déficit");
    assert.ok(boxes.deficitBox.xMax - boxes.deficitBox.xMin > 40, "la boîte déficit doit être une vraie boîte de valeur, pas une zone-numéro étroite");
  });

  it("RÉGRESSION — la position historique buguée (x=426.9) tombe dans la zone-numéro de 372, PAS dans sa boîte de valeur", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase370372Boxes(bytes);
    const historicalBuggyX = 426.9;
    assert.ok(
      xInBox(historicalBuggyX, boxes.numberZone372, GRID_LINE_TOLERANCE_PT),
      "x=426.9 (valeur des missions précédentes) doit être dans la zone-numéro '372', preuve reproductible du bug P0-1",
    );
    assert.ok(
      !xInBox(historicalBuggyX, boxes.deficitBox, GRID_LINE_TOLERANCE_PT),
      "x=426.9 ne doit PAS être dans la boîte de valeur déficit — l'oracle aurait dû faire échouer ce test AVANT la correction",
    );
  });

  it("la position CORRIGÉE du registre (372) tombe bien dans la boîte de valeur déficit, pas dans la zone-numéro", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase370372Boxes(bytes);
    const mapping372 = resolveVisualMapping("2033-B-SD", 2026, "372");
    assert.ok(mapping372, "372 doit avoir une entrée de registre");
    assert.ok(
      xInBox(mapping372!.position.x, boxes.deficitBox, GRID_LINE_TOLERANCE_PT),
      `x=${mapping372!.position.x} doit être dans la boîte de valeur déficit [${boxes.deficitBox.xMin},${boxes.deficitBox.xMax}]`,
    );
    assert.ok(
      !xInBox(mapping372!.position.x, boxes.numberZone372, GRID_LINE_TOLERANCE_PT),
      "la position corrigée ne doit plus être dans la zone-numéro '372'",
    );
  });

  it("PDF généré (résultat fiscal synthétiquement négatif, 372=9862) — la valeur est réellement dessinée dans la boîte déficit, pas seulement présente sur la page", async () => {
    // CORRIGÉ (audit fiscal P0) : le dossier témoin réel n'exerce plus 372
    // (F-006 garantit resultatFiscal>=0 — le déficit LMNP passe désormais par
    // 330, voir case-372-fiscal-divergence.test.ts, "RÉSOLU"). Ce fixture
    // synthétique continue de prouver que le registre GÉOMÉTRIQUE de 372
    // reste correct si cette case était un jour exercée.
    const rfs = buildSyntheticNegativeResultatFiscalRfs(9862);
    const form2033B = map2033BFromRfs(rfs);
    const result = await generateCerfaLiassePdf({
      millesime: 2026,
      forms: [{ form: "2033-B-SD", cases: form2033B.cases }],
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const case372Drawing = positions.find((p) => p.text === "9 862");
    assert.ok(case372Drawing, "la valeur '9 862' doit être réellement dessinée (extraite des octets du PDF, pas du manifeste)");

    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase370372Boxes(bytes);
    // Seule la colonne X nous intéresse ici (372 est la seule valeur
    // "9 862" attendue sur cette page synthétique à une seule case).
    assert.ok(
      xInBox(case372Drawing!.pdfLibX, boxes.deficitBox, GRID_LINE_TOLERANCE_PT),
      `la valeur dessinée à x=${case372Drawing!.pdfLibX} doit tomber dans la boîte déficit [${boxes.deficitBox.xMin},${boxes.deficitBox.xMax}] du Cerfa officiel`,
    );
    assert.ok(
      !xInBox(case372Drawing!.pdfLibX, boxes.numberZone372, GRID_LINE_TOLERANCE_PT),
      "la valeur dessinée ne doit jamais chevaucher la zone-numéro imprimée '372'",
    );
  });

  it("PDF généré (scénario bénéficiaire, 370=4200) — la valeur est dessinée dans la boîte bénéfice, distincte de la boîte déficit", async () => {
    const rfs = buildScenarioRfs();
    const form2033B = map2033BFromRfs(rfs);
    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: form2033B.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    // Dans ce scénario, "4 200" est aussi la valeur de 310 (résultat
    // comptable, colonne principale x≈480-507) et de 312 (même colonne
    // bénéfice que 370, x≈400-426, sur une autre ligne) — on isole les
    // dessins de la colonne resserrée "RÉINTÉGRATIONS/RÉSULTAT FISCAL"
    // (x<450, bien en-deçà de la colonne principale) pour ne retenir que
    // 312/370, jamais 310.
    const narrowColumnCandidates = positions.filter((p) => p.text === "4 200" && p.pdfLibX < 450);
    assert.ok(narrowColumnCandidates.length >= 1, "la valeur '4 200' (312 et/ou 370) doit être dessinée dans la colonne resserrée");
    // 370 (résultat fiscal après imputation) est la ligne la plus BASSE du
    // formulaire parmi 312/370 → le pdfLibY le plus PETIT (origine bas-gauche).
    const case370Drawing = [...narrowColumnCandidates].sort((a, b) => a.pdfLibY - b.pdfLibY)[0];

    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase370372Boxes(bytes);
    assert.ok(
      xInBox(case370Drawing!.pdfLibX, boxes.beneficeBox, GRID_LINE_TOLERANCE_PT),
      `370 doit être dessinée dans la boîte bénéfice [${boxes.beneficeBox.xMin},${boxes.beneficeBox.xMax}]`,
    );
    assert.ok(
      !xInBox(case370Drawing!.pdfLibX, boxes.deficitBox, GRID_LINE_TOLERANCE_PT),
      "370 (bénéfice) ne doit jamais tomber dans la boîte déficit",
    );
  });
});

describe("Oracle de position indépendant — 2031-SD, ligne '1. Résultat fiscal' (Col.1/Col.2)", () => {
  it("dérive deux boîtes distinctes et non chevauchantes pour Col.1 et Col.2 (sanity check de l'oracle)", async () => {
    const bytes = readAssetBytes(2026, "2031-sd.pdf");
    const boxes = await deriveResultatFiscalColumnBoxes(bytes);
    assert.notEqual(boxes.col1Box.xMin, boxes.col2Box.xMin, "Col.1 et Col.2 doivent être des boîtes distinctes");
    assert.ok(boxes.col1Box.xMax <= boxes.col2Box.xMin + 1, "Col.1 doit précéder Col.2, sans chevauchement");
  });

  it("RÉGRESSION — la position historique buguée (502.9, 502.9 pour les DEUX colonnes) ne peut pas être dans Col.1 ET Col.2 à la fois", async () => {
    const bytes = readAssetBytes(2026, "2031-sd.pdf");
    const boxes = await deriveResultatFiscalColumnBoxes(bytes);
    const historicalBuggyX = 502.9;
    const inCol1 = xInBox(historicalBuggyX, boxes.col1Box, GRID_LINE_TOLERANCE_PT);
    const inCol2 = xInBox(historicalBuggyX, boxes.col2Box, GRID_LINE_TOLERANCE_PT);
    assert.ok(inCol1 && !inCol2, "x=502.9 est une position valide pour Col.1 SEULEMENT — la réutiliser pour Col.2 était le bug P0-2");
  });

  it("les positions CORRIGÉES de C_L1_COL1 et C_L1_COL2 sont distinctes et tombent chacune dans leur propre boîte", async () => {
    const bytes = readAssetBytes(2026, "2031-sd.pdf");
    const boxes = await deriveResultatFiscalColumnBoxes(bytes);
    const col1 = resolveVisualMapping("2031-SD", 2026, "C_L1_COL1");
    const col2 = resolveVisualMapping("2031-SD", 2026, "C_L1_COL2");
    assert.ok(col1 && col2, "les deux cases doivent avoir une entrée de registre");
    assert.notEqual(col1!.position.x, col2!.position.x, "C_L1_COL1 et C_L1_COL2 ne doivent plus partager le même x");

    assert.ok(xInBox(col1!.position.x, boxes.col1Box, GRID_LINE_TOLERANCE_PT), "C_L1_COL1 doit tomber dans la boîte Col.1");
    assert.ok(!xInBox(col1!.position.x, boxes.col2Box, GRID_LINE_TOLERANCE_PT), "C_L1_COL1 ne doit pas tomber dans Col.2");

    assert.ok(xInBox(col2!.position.x, boxes.col2Box, GRID_LINE_TOLERANCE_PT), "C_L1_COL2 doit tomber dans la boîte Col.2");
    assert.ok(!xInBox(col2!.position.x, boxes.col1Box, GRID_LINE_TOLERANCE_PT), "C_L1_COL2 ne doit pas tomber dans Col.1");
  });

  it("PDF généré (scénario bénéficiaire, C_L1_COL1=4200) — la valeur est dessinée dans la boîte Col.1", async () => {
    const rfs = buildScenarioRfs();
    const { form: form2031SD } = assembleForm2031SD(rfs.fiscalResult, rfs.identite);
    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2031-SD", cases: form2031SD.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    // I_7A produit également "4 200" ailleurs sur la même page (colonne
    // différente, x autour de 313.7) — on ne retient que les dessins dans la
    // moitié droite de la page pour isoler C_L1_COL1.
    const candidates = positions.filter((p) => p.text === "4 200" && p.pdfLibX > 400);
    assert.equal(candidates.length, 1, "une seule valeur '4 200' attendue dans la zone Cadre C (C_L1_COL1)");

    const bytes = readAssetBytes(2026, "2031-sd.pdf");
    const boxes: { col1Box: ColumnBox; col2Box: ColumnBox } = await deriveResultatFiscalColumnBoxes(bytes);
    assert.ok(xInBox(candidates[0].pdfLibX, boxes.col1Box, GRID_LINE_TOLERANCE_PT), "C_L1_COL1 doit être dessinée dans la boîte Col.1");
    assert.ok(!xInBox(candidates[0].pdfLibX, boxes.col2Box, GRID_LINE_TOLERANCE_PT), "C_L1_COL1 ne doit pas être dessinée dans Col.2");
  });

  it("PDF généré (résultat fiscal synthétiquement négatif, C_L1_COL2=9862) — la valeur est dessinée dans la boîte Col.2, jamais superposée à Col.1", async () => {
    // CORRIGÉ (audit fiscal P0) : le dossier témoin réel n'exerce plus
    // C_L1_COL2 (F-006 garantit resultatFiscal>=0 — le déficit LMNP passe
    // désormais par 330 du 2033-B-SD et reste visible via I_7B, voir
    // case-372-fiscal-divergence.test.ts, "RÉSOLU"). Ce fixture synthétique
    // continue de prouver que le registre GÉOMÉTRIQUE de C_L1_COL2 reste
    // correct si cette case était un jour exercée. deficitNouveau=0 dans ce
    // fixture (voir buildSyntheticNegativeResultatFiscalRfs) : I_7B ne se
    // déclenche pas non plus ici, C_L1_COL2 est donc la SEULE candidate.
    const rfs = buildSyntheticNegativeResultatFiscalRfs(9862);
    const { form: form2031SD } = assembleForm2031SD(rfs.fiscalResult, rfs.identite);
    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2031-SD", cases: form2031SD.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const candidates = positions.filter((p) => p.text === "9 862");
    assert.equal(candidates.length, 1, "seule C_L1_COL2 doit produire '9 862' dans ce scénario synthétique (I_7B non déclenchée, deficitNouveau=0)");

    const bytes = readAssetBytes(2026, "2031-sd.pdf");
    const boxes: { col1Box: ColumnBox; col2Box: ColumnBox } = await deriveResultatFiscalColumnBoxes(bytes);
    const col2Drawing = candidates[0];
    assert.ok(xInBox(col2Drawing.pdfLibX, boxes.col2Box, GRID_LINE_TOLERANCE_PT), "C_L1_COL2 doit être dessinée dans la boîte Col.2");
    assert.ok(!xInBox(col2Drawing.pdfLibX, boxes.col1Box, GRID_LINE_TOLERANCE_PT), "C_L1_COL2 ne doit jamais être dessinée dans Col.1 (superposition P0-2 historique)");
  });
});

describe("Oracle de position indépendant — 2033-B-SD, ligne 247/248/330 (MICRO-JALON calibration 330)", () => {
  it("dérive quatre boîtes cohérentes et mutuellement exclusives (sanity check de l'oracle lui-même)", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase330Boxes(bytes);
    assert.ok(boxes.valueBox247.xMax <= boxes.valueBox248.xMin, "247 doit précéder 248, sans chevauchement");
    assert.ok(boxes.valueBox248.xMax <= boxes.numberZone330.xMin + 1, "248 doit précéder la zone-numéro 330");
    assert.ok(boxes.numberZone330.xMax <= boxes.valueBox330.xMin + 1, "la zone-numéro 330 doit précéder sa boîte de valeur");
    assert.ok(boxes.valueBox330.xMax - boxes.valueBox330.xMin > 40, "la boîte de valeur de 330 doit être une vraie boîte, pas une zone-numéro étroite (14.4pt)");
  });

  it("RÉGRESSION — une valeur écrite dans la zone-numéro '330' (répétition de l'erreur historique P0-1 sur 372) serait détectée", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase330Boxes(bytes);
    const hypotheticalBuggyX = (boxes.numberZone330.xMin + boxes.numberZone330.xMax) / 2;
    assert.ok(xInBox(hypotheticalBuggyX, boxes.numberZone330, GRID_LINE_TOLERANCE_PT), "précondition : ce x est bien dans la zone-numéro");
    assert.ok(!xInBox(hypotheticalBuggyX, boxes.valueBox330, GRID_LINE_TOLERANCE_PT), "une valeur dans la zone-numéro ne doit jamais être lue comme correctement positionnée");
  });

  it("la position du registre (330) tombe dans sa boîte de valeur, jamais dans 247, 248, ou sa propre zone-numéro", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase330Boxes(bytes);
    const mapping330 = resolveVisualMapping("2033-B-SD", 2026, "330");
    assert.ok(mapping330, "330 doit avoir une entrée de registre (MICRO-JALON calibration 330)");
    assert.ok(
      xInBox(mapping330!.position.x, boxes.valueBox330, GRID_LINE_TOLERANCE_PT),
      `x=${mapping330!.position.x} doit être dans la boîte de valeur de 330 [${boxes.valueBox330.xMin},${boxes.valueBox330.xMax}]`,
    );
    assert.ok(!xInBox(mapping330!.position.x, boxes.numberZone330, GRID_LINE_TOLERANCE_PT), "ne doit pas être dans la zone-numéro '330'");
    assert.ok(!xInBox(mapping330!.position.x, boxes.valueBox247, GRID_LINE_TOLERANCE_PT), "ne doit pas être dans la boîte de valeur de 247");
    assert.ok(!xInBox(mapping330!.position.x, boxes.valueBox248, GRID_LINE_TOLERANCE_PT), "ne doit pas être dans la boîte de valeur de 248");
    assert.ok(mapping330!.position.x <= boxes.valueBox330.xMax + GRID_LINE_TOLERANCE_PT, "ne doit pas déborder dans la colonne droite grisée (style déficit, x>426)");
  });

  it("PDF généré (dossier témoin réel, 330=9862) — la valeur est réellement dessinée dans la boîte de 330, jamais dans 247/248/zone-numéro/colonne grisée", async () => {
    // Le dossier témoin sert ICI uniquement de validation SECONDAIRE de la
    // VALEUR (9862) — jamais de source pour la géométrie, qui vient
    // exclusivement de l'asset officiel (deriveCase330Boxes ci-dessus).
    const rfs = buildDossierTemoinRfs();
    const form2033B = map2033BFromRfs(rfs);
    assert.ok(form2033B.cases.some((c) => c.caseId === "330" && c.value === 9862), "précondition : le mapper doit produire 330=9862 sur le dossier témoin réel");

    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: form2033B.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const case330Drawing = positions.find((p) => p.text === "9 862");
    assert.ok(case330Drawing, "la valeur '9 862' (330) doit être réellement dessinée (extraite des octets du PDF, pas du manifeste)");

    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase330Boxes(bytes);
    assert.ok(
      xInBox(case330Drawing!.pdfLibX, boxes.valueBox330, GRID_LINE_TOLERANCE_PT),
      `la valeur dessinée à x=${case330Drawing!.pdfLibX} doit tomber dans la boîte de valeur de 330 [${boxes.valueBox330.xMin},${boxes.valueBox330.xMax}]`,
    );
    assert.ok(!xInBox(case330Drawing!.pdfLibX, boxes.numberZone330, GRID_LINE_TOLERANCE_PT), "ne doit jamais chevaucher la zone-numéro imprimée '330'");
    assert.ok(!xInBox(case330Drawing!.pdfLibX, boxes.valueBox247, GRID_LINE_TOLERANCE_PT), "ne doit jamais être confondue avec la valeur de 247");
    assert.ok(!xInBox(case330Drawing!.pdfLibX, boxes.valueBox248, GRID_LINE_TOLERANCE_PT), "ne doit jamais être confondue avec la valeur de 248");
    assert.ok(case330Drawing!.pdfLibX <= boxes.valueBox330.xMax + GRID_LINE_TOLERANCE_PT, "ne doit jamais déborder dans la colonne droite grisée (style déficit)");

    // Non-régression verticale : la valeur ne doit pas tomber en dehors de
    // la bande de la ligne démontrée en lecture seule (y top-left ∈
    // [485.248, 504.337]). pdfLibY est une ligne de base (convention
    // pdf-lib) : reconvertie ici en top-left via le même écart que
    // `coordinates.ts` (BBOX_TOP_TO_BASELINE_PT=9.675, revalidé par
    // `coordinates.test.ts`) pour comparer à la bande mesurée en lecture
    // seule sur l'asset officiel — pas une dépendance au registre.
    const pageHeight = 841.8897705078125;
    const BBOX_TOP_TO_BASELINE_PT = 9.675;
    const topLeftYApprox = pageHeight - case330Drawing!.pdfLibY - BBOX_TOP_TO_BASELINE_PT;
    assert.ok(topLeftYApprox >= 485.2 && topLeftYApprox <= 504.4, `la valeur dessinée doit rester dans la bande verticale de la ligne 247/248/330 (mesuré: ${topLeftYApprox})`);
  });
});

describe("Oracle de position indépendant — 2033-B-SD, ligne 346/350 (MICRO-JALON implémentation 350)", () => {
  it("A — sanity check : valueBox350 existe, largeur et hauteur positives, cohérente avec les séparateurs officiels", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase350Boxes(bytes);
    assert.ok(boxes.valueBox350.xMax > boxes.valueBox350.xMin, "valueBox350 doit avoir une largeur positive");
    assert.ok(boxes.valueBox350.xMax - boxes.valueBox350.xMin > 40, "valueBox350 doit être une vraie boîte de valeur, pas une zone-numéro étroite (14.4pt)");
    assert.ok(boxes.numberZone350.xMax <= boxes.valueBox350.xMin + 1, "la zone-numéro 350 doit précéder sa boîte de valeur");
    assert.ok(boxes.valueBox346.xMax <= boxes.numberZone350.xMin + 1, "la boîte de valeur de 346 doit précéder la zone-numéro 350 (colonnes disjointes)");
  });

  it("B — le mapping registry de 350 est entièrement contenu dans valueBox350", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase350Boxes(bytes);
    const mapping350 = resolveVisualMapping("2033-B-SD", 2026, "350");
    assert.ok(mapping350, "350 doit avoir une entrée de registre (MICRO-JALON implémentation 350)");
    assert.ok(
      xInBox(mapping350!.position.x, boxes.valueBox350, GRID_LINE_TOLERANCE_PT),
      `x=${mapping350!.position.x} doit être dans la boîte de valeur de 350 [${boxes.valueBox350.xMin},${boxes.valueBox350.xMax}]`,
    );
  });

  it("C — RÉGRESSION anti-erreur zone-numéro : le mapping ne doit jamais tomber dans numberZone350", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase350Boxes(bytes);
    const mapping350 = resolveVisualMapping("2033-B-SD", 2026, "350");
    assert.ok(mapping350);
    assert.ok(
      !xInBox(mapping350!.position.x, boxes.numberZone350, GRID_LINE_TOLERANCE_PT),
      "la position ne doit pas être dans la zone-numéro '350' (répétition de l'erreur historique P0-1 sur 372)",
    );
    // Preuve que l'oracle aurait détecté l'erreur : le centre de la
    // zone-numéro elle-même, testé directement, est bien DANS cette zone.
    const hypotheticalBuggyX = (boxes.numberZone350.xMin + boxes.numberZone350.xMax) / 2;
    assert.ok(xInBox(hypotheticalBuggyX, boxes.numberZone350, GRID_LINE_TOLERANCE_PT));
    assert.ok(!xInBox(hypotheticalBuggyX, boxes.valueBox350, GRID_LINE_TOLERANCE_PT));
  });

  it("D — RÉGRESSION anti-erreur case 346 : le mapping ne doit jamais tomber dans valueBox346", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase350Boxes(bytes);
    const mapping350 = resolveVisualMapping("2033-B-SD", 2026, "350");
    assert.ok(mapping350);
    assert.ok(
      !xInBox(mapping350!.position.x, boxes.valueBox346, GRID_LINE_TOLERANCE_PT),
      "350 ne doit jamais être confondue avec la boîte de valeur de 346 (colonne totalement disjointe)",
    );
  });

  it("E — PDF généré (fixture synthétique, 350=2000) — la valeur est réellement dessinée dans valueBox350, jamais dans numberZone350 ni valueBox346", async () => {
    const rfs = buildSyntheticDeficitsImputesRfs(2000);
    const form2033B = map2033BFromRfs(rfs);
    assert.ok(form2033B.cases.some((c) => c.caseId === "350" && c.value === 2000), "précondition : le mapper doit produire 350=2000 (deficitsImputes, règle verrouillée)");

    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: form2033B.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const case350Drawing = positions.find((p) => p.text === "2 000");
    assert.ok(case350Drawing, "la valeur '2 000' (350) doit être réellement dessinée (extraite des octets du PDF, pas du manifeste)");

    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase350Boxes(bytes);
    assert.ok(
      xInBox(case350Drawing!.pdfLibX, boxes.valueBox350, GRID_LINE_TOLERANCE_PT),
      `la valeur dessinée à x=${case350Drawing!.pdfLibX} doit tomber dans la boîte de valeur de 350 [${boxes.valueBox350.xMin},${boxes.valueBox350.xMax}]`,
    );
    assert.ok(!xInBox(case350Drawing!.pdfLibX, boxes.numberZone350, GRID_LINE_TOLERANCE_PT), "ne doit jamais chevaucher la zone-numéro imprimée '350'");
    assert.ok(!xInBox(case350Drawing!.pdfLibX, boxes.valueBox346, GRID_LINE_TOLERANCE_PT), "ne doit jamais être confondue avec la valeur de 346");

    // Non-régression verticale : la valeur ne doit pas tomber en dehors de
    // la bande de la ligne démontrée en lecture seule (y top-left ∈
    // [655.71, 666.62]) — reconvertie ici via le même écart que
    // `coordinates.ts` (BBOX_TOP_TO_BASELINE_PT=9.675), pas une dépendance
    // au registre.
    const pageHeight = 841.8897705078125;
    const BBOX_TOP_TO_BASELINE_PT = 9.675;
    const topLeftYApprox = pageHeight - case350Drawing!.pdfLibY - BBOX_TOP_TO_BASELINE_PT;
    // Marge légèrement plus large que la bande imprimée [655.71,666.62] :
    // le point d'ancrage stocké au registre (haut de bbox, convention
    // TopLeftPoint) peut se situer quelques dixièmes de point avant le
    // trait imprimé sans que l'encre réellement visible ne déborde (validé
    // par inspection raster lors de la calibration, voir registry note) —
    // à ne pas confondre avec un débordement réel (voir test de régression
    // C, qui borne strictement la zone-numéro elle-même).
    assert.ok(topLeftYApprox >= 654.5 && topLeftYApprox <= 667.5, `la valeur dessinée doit rester dans la bande verticale de la ligne 346/350 (mesuré: ${topLeftYApprox})`);
  });

  it("non-régression — 330/370/372/318 restent inchangées quand 350 est produite dans la même génération", async () => {
    const rfs = buildDossierTemoinRfs();
    const form2033B = map2033BFromRfs(rfs);
    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: form2033B.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const boxes330 = await deriveCase330Boxes(readAssetBytes(2026, "2033-sd.pdf"));
    const case330Drawing = positions.find((p) => p.text === "9 862");
    assert.ok(case330Drawing, "330=9862 doit rester dessinée sur le dossier témoin");
    assert.ok(xInBox(case330Drawing!.pdfLibX, boxes330.valueBox330, GRID_LINE_TOLERANCE_PT), "330 doit rester dans sa boîte, non affectée par l'ajout de 350 au registre");
    const case318Drawing = positions.find((p) => p.text === "3 720");
    assert.ok(case318Drawing, "318=3720 (ARD) doit rester dessinée, non affectée par 350");
  });
});

/**
 * Fixture synthétique pour la case 244 (MICRO-JALON implémentation 244) —
 * `244 = fiscalResult.charges.detailParCategorie.taxe_fonciere`. Le dossier
 * témoin réel ne renseigne pas `detailParCategorie` (fixture construite à la
 * main, jamais via F-012) : même principe que les autres fixtures
 * synthétiques de ce fichier.
 */
function buildSyntheticTaxeFonciereRfs(taxeFonciere: number): FiscalRepresentation {
  return {
    exercice: DOSSIER_TEMOIN_FISCAL_RESULT.exercice,
    identite: DOSSIER_TEMOIN_IDENTITE,
    fiscalResult: {
      ...DOSSIER_TEMOIN_FISCAL_RESULT,
      charges: { ...DOSSIER_TEMOIN_FISCAL_RESULT.charges, detailParCategorie: { taxe_fonciere: taxeFonciere } },
    },
    trace: {
      ksArtifacts: DOSSIER_TEMOIN_FISCAL_RESULT.trace.ksArtifacts,
      assembledAt: "2026-05-01T00:00:00.000Z",
      sourceFiscalResultAt: DOSSIER_TEMOIN_FISCAL_RESULT.trace.computedAt,
      sources: { identite: "synthétique (position-oracle.test.ts)", fiscalResult: "synthétique (position-oracle.test.ts)" },
    },
  };
}

describe("Vérification PDF réelle — 2033-B-SD, case 244 (MICRO-JALON implémentation 244)", () => {
  // Bande de la ligne 244 et de sa voisine directe (242, immédiatement
  // au-dessus), mesurées en LECTURE SEULE sur l'asset officiel ce jalon
  // (PyMuPDF `get_drawings()`+`get_text()`) — jamais dérivées du registre.
  // Séparateurs horizontaux à y=233.538 (haut, segmenté à x=440.359 :
  // numéro/mémo | valeur) et y=245.797 (bas). Boîte de valeur réelle :
  // x=[440.255,506.446] — jamais [421.5,506.5] (largeur nominale du
  // registre, ancrée seulement par le bord droit, plus généreuse que la
  // vraie cellule mais sans risque de débordement pour un montant usuel).
  const VALUE_BOX_244: ColumnBox = { xMin: 440.255, xMax: 506.446 };
  const ROW_244_BAND = { yMin: 233.538, yMax: 245.797 };
  const ROW_242_BAND = { yMin: 221.711, yMax: 233.538 };

  it("1 200 est réellement dessiné dans la boîte de valeur officielle de 244, jamais dans la zone-numéro/mémo, jamais dans la ligne 242", async () => {
    const rfs = buildSyntheticTaxeFonciereRfs(1200);
    const form2033B = map2033BFromRfs(rfs);
    assert.ok(form2033B.cases.some((c) => c.caseId === "244" && c.value === 1200), "précondition : le mapper doit produire 244=1200 (taxe_fonciere)");

    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: form2033B.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const case244Drawing = positions.find((p) => p.text === "1 200");
    assert.ok(case244Drawing, "la valeur '1 200' (244) doit être réellement dessinée (extraite des octets du PDF, pas seulement du manifeste)");

    assert.ok(
      xInBox(case244Drawing!.pdfLibX, VALUE_BOX_244, GRID_LINE_TOLERANCE_PT),
      `la valeur dessinée à x=${case244Drawing!.pdfLibX} doit tomber dans la boîte de valeur officielle de 244 [${VALUE_BOX_244.xMin},${VALUE_BOX_244.xMax}]`,
    );

    const pageHeight = 841.8897705078125;
    const BBOX_TOP_TO_BASELINE_PT = 9.675;
    const topLeftYApprox = pageHeight - case244Drawing!.pdfLibY - BBOX_TOP_TO_BASELINE_PT;
    assert.ok(
      topLeftYApprox >= ROW_244_BAND.yMin - GRID_LINE_TOLERANCE_PT && topLeftYApprox <= ROW_244_BAND.yMax + GRID_LINE_TOLERANCE_PT,
      `la valeur dessinée doit rester dans la bande verticale de la ligne 244 [${ROW_244_BAND.yMin},${ROW_244_BAND.yMax}] (mesuré: ${topLeftYApprox})`,
    );
    assert.ok(
      !(topLeftYApprox >= ROW_242_BAND.yMin && topLeftYApprox <= ROW_242_BAND.yMax),
      `la valeur dessinée (y≈${topLeftYApprox}) ne doit jamais chevaucher la ligne 242 juste au-dessus [${ROW_242_BAND.yMin},${ROW_242_BAND.yMax}]`,
    );
  });

  it("absence de taxe_fonciere (dossier témoin réel) — 244 n'apparaît jamais, aucune autre case affectée", async () => {
    const rfs = buildDossierTemoinRfs();
    const form2033B = map2033BFromRfs(rfs);
    assert.equal(form2033B.cases.some((c) => c.caseId === "244"), false, "244 ne doit pas être produite par le mapper : dossier témoin sans detailParCategorie");

    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: form2033B.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    assert.ok(!result.manifest.some((e) => e.caseId === "244"), "244 ne doit jamais apparaître dans le manifeste sans donnée disponible");
  });
});

// =====================================================================
// Oracle de position indépendant — 2033-C-SD (GO-1/GO-2)
// =====================================================================

// Mêmes valeurs que `IMMO_REFERENCE` (src/runtime/rfs-2033c.test.ts,
// dossier de référence "Elsa Bouvard") — non importées (non exportées par
// ce fichier de test), recopiées ici pour rester un fixture autonome.
// `amortCalcule` du dossier témoin (DOSSIER_TEMOIN_FISCAL_RESULT = 3720)
// correspond exactement à `totalAnnuelExercice` ci-dessous : aucune
// divergence F-010/F-014, 496/576 (et 490/492/570 le cas échéant) restent
// alimentées.
const IMMO_REFERENCE_2033C: ImmobilisationsRfs = {
  lignes: [
    { label: "Gros œuvre", montant: 37186.1, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814.1 },
    { label: "Toiture", montant: 6610.86, dureeAnnees: 30, dotationExercice: 165, amortissementsCumules: 165, vnc: 6445.86 },
    { label: "Étanchéité", montant: 5784.5, dureeAnnees: 20, dotationExercice: 217, amortissementsCumules: 217, vnc: 5567.5 },
    { label: "Installation électrique", montant: 4958.15, dureeAnnees: 25, dotationExercice: 148, amortissementsCumules: 148, vnc: 4810.15 },
    { label: "Installation et agencement", montant: 47235.9, dureeAnnees: 15, dotationExercice: 2327, amortissementsCumules: 2327, vnc: 44908.9 },
    { label: "Mobilier - Pack meubles", montant: 5400.1, dureeAnnees: 7, dotationExercice: 491, amortissementsCumules: 491, vnc: 4909.1 },
  ],
  totalAnnuelExercice: 3720,
  totalBrut: 107175.61,
  valeurTerrain: 17960.39,
  montantMobilier: 5400.1,
};

function build2033CRfs(immobilisations?: ImmobilisationsRfs): FiscalRepresentation {
  return {
    exercice: DOSSIER_TEMOIN_FISCAL_RESULT.exercice,
    identite: DOSSIER_TEMOIN_IDENTITE,
    fiscalResult: DOSSIER_TEMOIN_FISCAL_RESULT,
    immobilisations,
    trace: {
      ksArtifacts: DOSSIER_TEMOIN_FISCAL_RESULT.trace.ksArtifacts,
      assembledAt: "2026-05-01T00:00:00.000Z",
      sourceFiscalResultAt: DOSSIER_TEMOIN_FISCAL_RESULT.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

describe("Oracle de position indépendant — 2033-C-SD (GO-1/GO-2, huit cases)", () => {
  it("A — sanity check : les 8 boîtes de valeur existent, largeur positive, distinctes de leur zone-numéro (≈14-16pt)", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase2033CTotalRowBoxes(bytes);
    for (const caseId of ["426", "476", "490", "492", "496", "570", "572", "576"] as const) {
      const valueBox = boxes[`valueBox${caseId}` as keyof typeof boxes] as ColumnBox;
      const numberZone = boxes[`numberZone${caseId}` as keyof typeof boxes] as ColumnBox;
      assert.ok(valueBox.xMax > valueBox.xMin, `valueBox${caseId} doit avoir une largeur positive`);
      assert.ok(valueBox.xMax - valueBox.xMin > 40, `valueBox${caseId} doit être une vraie boîte de valeur, pas une zone-numéro étroite`);
      assert.ok(numberZone.xMax <= valueBox.xMin + 1, `la zone-numéro de ${caseId} doit précéder sa boîte de valeur`);
    }
  });

  it("B — les 8 mappings du registre tombent chacun dans leur boîte de valeur officielle, jamais dans leur zone-numéro", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase2033CTotalRowBoxes(bytes);
    for (const caseId of ["426", "476", "490", "492", "496", "570", "572", "576"] as const) {
      const mapping = resolveVisualMapping("2033-C-SD", 2026, caseId);
      assert.ok(mapping, `${caseId} doit avoir une entrée de registre (GO-1)`);
      const valueBox = boxes[`valueBox${caseId}` as keyof typeof boxes] as ColumnBox;
      const numberZone = boxes[`numberZone${caseId}` as keyof typeof boxes] as ColumnBox;
      assert.ok(
        xInBox(mapping!.position.x, valueBox, GRID_LINE_TOLERANCE_PT),
        `x=${mapping!.position.x} (${caseId}) doit être dans sa boîte de valeur [${valueBox.xMin},${valueBox.xMax}]`,
      );
      assert.ok(!xInBox(mapping!.position.x, numberZone, GRID_LINE_TOLERANCE_PT), `${caseId} ne doit jamais tomber dans sa zone-numéro`);
    }
  });

  it("C — PDF généré, premier exercice (dossier réel + dateMiseEnService dans l'exercice) — 490/492/570 sont réellement dessinées dans leur boîte de valeur", async () => {
    const rfs = build2033CRfs({ ...IMMO_REFERENCE_2033C, dateMiseEnService: "2025-03-01" });
    const form2033C = map2033CFromRfs(rfs);
    assert.ok(form2033C.cases.some((c) => c.caseId === "490" && c.value === 0), "précondition : 490=0 (premier exercice)");
    assert.ok(form2033C.cases.some((c) => c.caseId === "570" && c.value === 0), "précondition : 570=0 (premier exercice)");
    const case496Value = form2033C.cases.find((c) => c.caseId === "496")?.value;
    assert.ok(form2033C.cases.some((c) => c.caseId === "492" && c.value === case496Value), "précondition : 492=496 (premier exercice)");

    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-C-SD", cases: form2033C.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase2033CTotalRowBoxes(bytes);

    // Positions RÉELLEMENT dessinées, identifiées par case (`result.manifest`,
    // rempli par le générateur au moment de l'écriture) — plus précis qu'un
    // filtre par CONTENU du texte dessiné, qui confondrait à tort deux "0"
    // de lignes différentes (490 et 570 partagent la même page, des zones-X
    // qui se recoupent entre Cadre I et Cadre II, mais des Y distincts).
    const manifest490 = result.manifest.find((e) => e.caseId === "490");
    const manifest570 = result.manifest.find((e) => e.caseId === "570");
    const manifest492 = result.manifest.find((e) => e.caseId === "492");
    const manifest496 = result.manifest.find((e) => e.caseId === "496");
    assert.ok(manifest490, "490=0 doit être réellement dessinée (présente dans le manifeste)");
    assert.ok(manifest570, "570=0 doit être réellement dessinée (présente dans le manifeste)");
    assert.ok(manifest492, "492 doit être réellement dessinée (présente dans le manifeste)");
    assert.ok(manifest496, "496 doit être réellement dessinée (présente dans le manifeste)");

    assert.ok(xInBox(manifest490!.pdfLibX, boxes.valueBox490, GRID_LINE_TOLERANCE_PT), "490 doit être dessinée dans sa boîte de valeur");
    assert.ok(!xInBox(manifest490!.pdfLibX, boxes.numberZone490, GRID_LINE_TOLERANCE_PT), "490 ne doit jamais tomber dans sa zone-numéro");
    assert.ok(xInBox(manifest570!.pdfLibX, boxes.valueBox570, GRID_LINE_TOLERANCE_PT), "570 doit être dessinée dans sa boîte de valeur");
    assert.ok(!xInBox(manifest570!.pdfLibX, boxes.numberZone570, GRID_LINE_TOLERANCE_PT), "570 ne doit jamais tomber dans sa zone-numéro");
    assert.ok(xInBox(manifest492!.pdfLibX, boxes.valueBox492, GRID_LINE_TOLERANCE_PT), "492 (= brut fin d'exercice) doit être dessinée dans sa propre boîte de valeur");
    assert.ok(xInBox(manifest496!.pdfLibX, boxes.valueBox496, GRID_LINE_TOLERANCE_PT), "496 doit rester dessinée dans sa propre boîte de valeur (non-régression)");
    assert.equal(manifest492!.text, manifest496!.text, "492 et 496 doivent afficher le même texte (premier exercice : augmentations = brut fin d'exercice)");
  });

  it("D — PDF généré, exercice ultérieur (dateMiseEnService avant l'exercice) — 490/492/570 n'apparaissent jamais, 496/576 non affectées", async () => {
    const rfs = build2033CRfs({ ...IMMO_REFERENCE_2033C, dateMiseEnService: "2020-06-15" });
    const form2033C = map2033CFromRfs(rfs);
    assert.equal(form2033C.cases.some((c) => c.caseId === "490"), false);
    assert.equal(form2033C.cases.some((c) => c.caseId === "492"), false);
    assert.equal(form2033C.cases.some((c) => c.caseId === "570"), false);

    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-C-SD", cases: form2033C.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    assert.ok(!result.manifest.some((e) => e.caseId === "490"), "490 ne doit jamais apparaître dans le manifeste pour un exercice ultérieur");
    assert.ok(!result.manifest.some((e) => e.caseId === "492"), "492 ne doit jamais apparaître dans le manifeste pour un exercice ultérieur");
    assert.ok(!result.manifest.some((e) => e.caseId === "570"), "570 ne doit jamais apparaître dans le manifeste pour un exercice ultérieur");
    assert.ok(result.manifest.some((e) => e.caseId === "496"), "496 doit rester dessinée, non affectée par l'absence de premier exercice");
    assert.ok(result.manifest.some((e) => e.caseId === "576"), "576 doit rester dessinée, non affectée par l'absence de premier exercice");
  });

  it("E — non-régression PDF réelle : 426/476/572 sont dessinées dans leurs boîtes de valeur respectives (dossier réel, sans dateMiseEnService)", async () => {
    const rfs = build2033CRfs(IMMO_REFERENCE_2033C);
    const form2033C = map2033CFromRfs(rfs);
    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-C-SD", cases: form2033C.cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    const positions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await deriveCase2033CTotalRowBoxes(bytes);

    const case426Drawing = positions.find((p) => p.text === "17 960" && xInBox(p.pdfLibX, boxes.valueBox426, GRID_LINE_TOLERANCE_PT));
    assert.ok(case426Drawing, "426 (valeurTerrain=17960.39 arrondi) doit être dessinée dans sa boîte de valeur");
    const case476Drawing = positions.find((p) => p.text === "5 400" && xInBox(p.pdfLibX, boxes.valueBox476, GRID_LINE_TOLERANCE_PT));
    assert.ok(case476Drawing, "476 (montantMobilier=5400.1 arrondi) doit être dessinée dans sa boîte de valeur");
    const case572Drawing = positions.find((p) => p.text === "3 720" && xInBox(p.pdfLibX, boxes.valueBox572, GRID_LINE_TOLERANCE_PT));
    assert.ok(case572Drawing, "572 (amortCalcule=3720) doit être dessinée dans sa boîte de valeur");

    assert.ok(!result.manifest.some((e) => e.caseId === "490"), "490 ne doit pas apparaître sans dateMiseEnService");
  });
});

// =====================================================================
// Oracle de position indépendant — 2033-A-SD (bilan simplifié, 25 cases)
// =====================================================================
//
// CHANTIER P0 (audit post-E3) — avant ce chantier, la seule vérification de
// position du 2033-A était `vertical-slice-2033-a.test.ts` : elle compare le
// PDF généré à un dictionnaire `VALUE_BOXES_PYMUPDF` recopié à la main dans
// LE MÊME fichier de test que celui qui exerce le registre — jamais une
// source indépendante du registre lui-même. Une erreur de colonne introduite
// simultanément dans `registry/2033-a/2026.ts` et recopiée par erreur dans
// `VALUE_BOXES_PYMUPDF` ne serait pas détectée par cette vérification.
//
// Ici, comme pour 2033-B/2031/2033-C ci-dessus, la référence de vérité est
// dérivée en lisant DIRECTEMENT les octets du Cerfa officiel (`derive2033A*`
// dans `independent-grid-oracle.ts`) — jamais en important `registry/2033-a`
// ni `scope/2033-a-2026`. Les 25 cases actuellement rendues (Chantiers
// P1-PDF-02-C, 2B, 2D-C, 2D-E3) sont recalibrées de zéro : zone-numéro,
// boîte de valeur, colonne (via les en-têtes RÉELLEMENT imprimés "Brut" /
// "Amortissements – Provisions" / "NET"), et bande de ligne (par mi-distance
// avec les cases voisines de la même colonne, jamais une constante à part).

// Les 35 cases actuellement rendues — recopiées ici (jamais importées de
// `scope/2033-a-2026`) pour que ce fichier reste un oracle autonome, comme
// les listes 2033-C ci-dessus. 064/080/092/174/175 ajoutées au chantier
// P1-B2 (5 lignes Brut/NET collectées par P1-B1). 068/072/164/166/172
// ajoutées au chantier B-FAMILY-4 (5 lignes famille B collectées par
// B-FAMILY-2/3, source unique `ventilationTiers`).
const CASE_IDS_2033A_ORACLE = [
  "016", "028", "030", "042", "044", "048",
  "064", "066", "068", "070", "072", "074", "080", "082", "084", "086", "092", "094", "096", "098",
  "110", "112",
  "120", "134", "136", "137", "142",
  "156", "164", "166", "172", "174", "175", "176", "180",
] as const;

// Doctrine de colonne attendue, établie à partir de la lecture du Cerfa
// officiel (voir `derive2033AColumnFamilies`), PAS du registre — sert
// uniquement à vérifier que l'oracle lui-même n'a pas mal identifié une
// colonne, avant de l'utiliser pour vérifier le registre.
const EXPECTED_COLUMN_2033A: Record<(typeof CASE_IDS_2033A_ORACLE)[number], "Brut" | "Amortissements-Provisions" | "NET"> = {
  "016": "Amortissements-Provisions",
  "028": "Brut",
  "030": "Amortissements-Provisions",
  "042": "Amortissements-Provisions",
  "044": "Brut",
  "048": "Amortissements-Provisions",
  "066": "Amortissements-Provisions",
  "070": "Amortissements-Provisions",
  "074": "Amortissements-Provisions",
  "082": "Amortissements-Provisions",
  "084": "Brut",
  "086": "Amortissements-Provisions",
  "094": "Amortissements-Provisions",
  "096": "Brut",
  "098": "Amortissements-Provisions",
  "110": "Brut",
  "112": "Amortissements-Provisions",
  "120": "NET",
  "134": "NET",
  "136": "NET",
  "137": "NET",
  "142": "NET",
  "156": "NET",
  "176": "NET",
  "180": "NET",
  "064": "Brut",
  "080": "Brut",
  "092": "Brut",
  "174": "NET",
  "175": "NET",
  "068": "Brut",
  "072": "Brut",
  "164": "NET",
  "166": "NET",
  "172": "NET",
};

function cerfaCase2033AOracle(caseId: string, value: number): CerfaCase {
  return { caseId, label: caseId, value, trace: { source: "FiscalResult", path: "oracle-2033a-test", ksArtifacts: [] } };
}

// Valeurs synthétiques distinctes (jamais deux identiques, jamais uniquement
// des zéros) — indépendantes de `SLICE_TEST_VALUES` (vertical-slice-2033-a),
// pour que ce test ne dépende d'aucune valeur définie ailleurs. Aucune
// relation arithmétique n'est vérifiée ici (déjà couvert par
// `vertical-slice-2033-a.test.ts`) : seule la GÉOMÉTRIE nous intéresse.
const ORACLE_TEST_VALUES: Record<(typeof CASE_IDS_2033A_ORACLE)[number], number> = {
  "016": 1_001, "028": 2_002, "030": 3_003, "042": 4_004, "044": 5_005, "048": 6_006,
  "066": 7_007, "070": 8_008, "074": 9_009, "082": 10_010, "084": 11_011, "086": 12_012,
  "094": 13_013, "096": 14_014, "098": 15_015, "110": 16_016, "112": 17_017,
  "120": -18_018, "134": 1_901_919, "136": 20_020, "137": 21_021, "142": 22_022,
  "156": 23_023, "176": 24_024, "180": 25_025,
  "064": 26_026, "080": 27_027, "092": 28_028, "174": 29_029, "175": 30_030,
  "068": 31_031, "072": 32_032, "164": 33_033, "166": 34_034, "172": 35_035,
};

describe("Oracle de position indépendant — 2033-A-SD (35 cases, CHANTIER P0 post-E3 + P1-B2 + B-FAMILY-4)", () => {
  it("A — sanity check : les 35 boîtes de valeur existent, largeur positive, disjointes de leur zone-numéro, colonne cohérente avec les en-têtes officiels", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await derive2033ACaseBoxes(bytes);
    assert.equal(boxes.size, 35, "les 35 cases actuellement rendues doivent toutes être calibrables indépendamment");

    for (const caseId of CASE_IDS_2033A_ORACLE) {
      const box = boxes.get(caseId);
      assert.ok(box, `case ${caseId} doit être calibrée par l'oracle indépendant`);
      assert.ok(box!.valueBox.xMax > box!.valueBox.xMin, `valueBox ${caseId} doit avoir une largeur positive`);
      assert.ok(box!.valueBox.xMax - box!.valueBox.xMin > 60, `valueBox ${caseId} doit être une vraie boîte de valeur, pas une zone-numéro étroite`);
      assert.ok(box!.numberZone.xMax <= box!.valueBox.xMin + 0.1, `la zone-numéro de ${caseId} doit précéder immédiatement sa boîte de valeur`);
      assert.ok(box!.rowBand.yMax > box!.rowBand.yMin, `rowBand ${caseId} doit avoir une hauteur positive`);
      assert.equal(box!.column, EXPECTED_COLUMN_2033A[caseId], `colonne dérivée de ${caseId} doit correspondre à la doctrine du Cerfa officiel`);
    }
  });

  it("A bis — les trois familles de colonnes dérivées des en-têtes officiels sont mutuellement disjointes (Brut < Amortissements-Provisions < NET, aucun chevauchement)", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const families = await derive2033AColumnFamilies(bytes);
    assert.ok(families.Brut.xMax <= families["Amortissements-Provisions"].xMin + 0.1, "Brut doit se terminer avant Amortissements-Provisions");
    assert.ok(families["Amortissements-Provisions"].xMax <= families.NET.xMin + 0.1, "Amortissements-Provisions doit se terminer avant NET");
  });

  it("A ter — dans chaque colonne, les bandes de ligne des 35 cases ne se chevauchent jamais (aucune ambiguïté ligne-à-ligne possible)", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await derive2033ACaseBoxes(bytes);
    const byColumn = new Map<string, { caseId: string; yMin: number; yMax: number }[]>();
    for (const caseId of CASE_IDS_2033A_ORACLE) {
      const box = boxes.get(caseId)!;
      if (!byColumn.has(box.column)) byColumn.set(box.column, []);
      byColumn.get(box.column)!.push({ caseId, yMin: box.rowBand.yMin, yMax: box.rowBand.yMax });
    }
    for (const [column, rows] of byColumn) {
      rows.sort((a, b) => b.yMax - a.yMax);
      for (let i = 0; i < rows.length - 1; i += 1) {
        assert.ok(
          rows[i].yMin >= rows[i + 1].yMax - 0.01,
          `colonne ${column} : la bande de ${rows[i].caseId} [${rows[i].yMin},${rows[i].yMax}] chevauche celle de ${rows[i + 1].caseId} [${rows[i + 1].yMin},${rows[i + 1].yMax}]`,
        );
      }
    }
  });

  it("B — chaque mapping du registre tombe dans sa boîte de valeur officielle indépendante, jamais dans sa zone-numéro (la discrimination ligne-à-ligne, elle, est couverte par A ter et par le PDF réellement généré au test C)", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await derive2033ACaseBoxes(bytes);
    for (const caseId of CASE_IDS_2033A_ORACLE) {
      const mapping = resolveVisualMapping(CERFA_2033A_FORM_ID, CERFA_2033A_MILLESIME, caseId);
      assert.ok(mapping, `${caseId} doit avoir une entrée de registre`);
      const box = boxes.get(caseId)!;
      assert.ok(
        xInBox(mapping!.position.x, box.valueBox, GRID_LINE_TOLERANCE_PT),
        `x=${mapping!.position.x} (${caseId}) doit tomber dans sa boîte de valeur officielle indépendante [${box.valueBox.xMin},${box.valueBox.xMax}]`,
      );
      assert.ok(!xInBox(mapping!.position.x, box.numberZone, GRID_LINE_TOLERANCE_PT), `${caseId} ne doit jamais tomber dans sa zone-numéro`);
    }
  });

  it("C — PDF réellement généré : les 35 valeurs synthétiques distinctes sont chacune dessinée dans SA cellule indépendante (bonne colonne, bonne ligne), jamais dans une case voisine, jamais dupliquée", async () => {
    const cases: CerfaCase[] = CASE_IDS_2033A_ORACLE.map((caseId) => cerfaCase2033AOracle(caseId, ORACLE_TEST_VALUES[caseId]));

    const result = await generateCerfaLiassePdf({ millesime: CERFA_2033A_MILLESIME, forms: [{ form: CERFA_2033A_FORM_ID, cases }] });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    assert.equal(result.manifest.length, 35, "les 35 cases doivent être publiées par ce fixture");

    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await derive2033ACaseBoxes(bytes);
    const drawnPositions = await extractDrawnTextPositionsForPage(result.pdfBytes, 1);

    const usedValueBoxes = new Set<string>();
    for (const caseId of CASE_IDS_2033A_ORACLE) {
      const box = boxes.get(caseId)!;
      const manifestEntry = result.manifest.find((m) => m.caseId === caseId);
      assert.ok(manifestEntry, `${caseId} doit être réellement dessinée (présente dans le manifeste)`);

      // Position réellement dessinée dans les octets du PDF final — jamais
      // seulement ce que le générateur PENSE avoir écrit (`manifest`).
      const drawing = drawnPositions.find(
        (p) => p.text === manifestEntry!.text && Math.abs(p.pdfLibX - manifestEntry!.pdfLibX) < 0.01 && Math.abs(p.pdfLibY - manifestEntry!.pdfLibY) < 0.01,
      );
      assert.ok(drawing, `${caseId} : la position rapportée par le manifeste doit correspondre à un texte réellement dessiné dans les octets du PDF`);

      assert.ok(
        xInBox(drawing!.pdfLibX, box.valueBox, GRID_LINE_TOLERANCE_PT),
        `${caseId} : x=${drawing!.pdfLibX} doit tomber dans sa boîte de valeur officielle indépendante [${box.valueBox.xMin},${box.valueBox.xMax}]`,
      );
      assert.ok(!xInBox(drawing!.pdfLibX, box.numberZone, GRID_LINE_TOLERANCE_PT), `${caseId} ne doit jamais être dessinée dans sa zone-numéro`);
      assert.ok(
        drawing!.pdfLibY >= box.rowBand.yMin - GRID_LINE_TOLERANCE_PT && drawing!.pdfLibY <= box.rowBand.yMax + GRID_LINE_TOLERANCE_PT,
        `${caseId} : y=${drawing!.pdfLibY} doit rester dans la bande de ligne indépendante [${box.rowBand.yMin},${box.rowBand.yMax}] (jamais la ligne voisine)`,
      );

      // Unicité de la cellule : deux cases distinctes ne doivent jamais
      // partager exactement le même point de dessin (x,y) — une case
      // dupliquée sur la position d'une autre serait indétectable autrement.
      const key = `${drawing!.pdfLibX.toFixed(2)}|${drawing!.pdfLibY.toFixed(2)}`;
      assert.ok(!usedValueBoxes.has(key), `${caseId} : position (${key}) déjà utilisée par une autre case — cellule non unique`);
      usedValueBoxes.add(key);
    }
  });

  it("D — démonstration conceptuelle de la capacité de détection : les bandes de ligne et les familles de colonnes sont strictement non chevauchantes, donc une valeur déplacée de Brut vers NET, ou d'une ligne vers la ligne voisine, tomberait NÉCESSAIREMENT hors de sa boîte attendue", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const boxes = await derive2033ACaseBoxes(bytes);

    // 016 (Amortissements-Provisions) vs 030 (Amortissements-Provisions,
    // ligne immédiatement suivante) : même colonne, lignes voisines — un
    // décalage d'une ligne doit être détectable par la bande de ligne seule.
    const box016 = boxes.get("016")!;
    const box030 = boxes.get("030")!;
    assert.notEqual(box016.rowBand.yMin, box030.rowBand.yMin, "016 et 030 doivent avoir des bandes de ligne distinctes");
    const box030CenterY = (box030.rowBand.yMin + box030.rowBand.yMax) / 2;
    assert.ok(
      !(box030CenterY >= box016.rowBand.yMin && box030CenterY <= box016.rowBand.yMax),
      "si la valeur de 016 était dessinée au centre de la ligne de 030 (décalage d'une ligne), la vérification rowBand de 016 échouerait — c'est la propriété recherchée",
    );

    // 044 (Brut) vs 048 (Amortissements-Provisions, même ligne visuelle
    // "Total I") : colonnes voisines — un décalage de colonne doit être
    // détectable par la boîte de valeur seule, indépendamment de la ligne.
    const box044 = boxes.get("044")!;
    const box048 = boxes.get("048")!;
    assert.ok(!xInBox((box048.valueBox.xMin + box048.valueBox.xMax) / 2, box044.valueBox), "si la valeur de 048 (Amort.) était dessinée dans la colonne Brut de 044, la vérification valueBox de 044 échouerait — c'est la propriété recherchée");
    assert.ok(!xInBox((box044.valueBox.xMin + box044.valueBox.xMax) / 2, box048.valueBox), "réciproquement pour 044 dessinée en colonne Amortissements-Provisions");

    // 176 (NET, Dettes) vs 110 (Brut, Total général actif) : deux totaux,
    // colonnes disjointes — même vérification, cas concret des chantiers
    // 2D-C/2D-E3 (E3 est précisément le chantier qui a ajouté 110/180).
    const box176 = boxes.get("176")!;
    const box110 = boxes.get("110")!;
    assert.ok(!xInBox((box176.valueBox.xMin + box176.valueBox.xMax) / 2, box110.valueBox), "176 (NET) ne doit jamais être confondue avec la colonne Brut de 110");
  });

  it("E — cohérence de contrôle : les boîtes de valeur dérivées de l'oracle concordent (à la tolérance de trait de grille près) avec les ancrages du registre déjà publiés pour les trois colonnes (bord droit − inset 1.5pt)", async () => {
    const bytes = readAssetBytes(2026, "2033-sd.pdf");
    const families = await derive2033AColumnFamilies(bytes);
    // Ancrages documentés dans `registry/2033-a/2026.ts` (commentaire d'en-tête) :
    // Brut x=372.3, Amortissements-Provisions x=479.19, NET x=566.6 — utilisés
    // ICI UNIQUEMENT comme contrôle de cohérence a posteriori, jamais comme
    // source des boîtes dérivées ci-dessus (qui viennent exclusivement de
    // `derive2033ACaseBoxes`/`derive2033AColumnFamilies`).
    assert.ok(Math.abs(families.Brut.xMax - 1.5 - 372.3) < GRID_LINE_TOLERANCE_PT, `ancrage Brut attendu ≈372.3, dérivé ${families.Brut.xMax - 1.5}`);
    assert.ok(Math.abs(families["Amortissements-Provisions"].xMax - 1.5 - 479.19) < GRID_LINE_TOLERANCE_PT, `ancrage Amortissements-Provisions attendu ≈479.19, dérivé ${families["Amortissements-Provisions"].xMax - 1.5}`);
    assert.ok(Math.abs(families.NET.xMax - 1.5 - 566.6) < GRID_LINE_TOLERANCE_PT, `ancrage NET attendu ≈566.6, dérivé ${families.NET.xMax - 1.5}`);
  });
});
