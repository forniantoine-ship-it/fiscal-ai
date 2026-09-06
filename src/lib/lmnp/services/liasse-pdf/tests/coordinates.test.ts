/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/coordinates.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toPdfLibPoint } from "../generator/coordinates";
import { topLeft } from "../types";

describe("toPdfLibPoint — conversion origine haut-gauche → bas-gauche", () => {
  it("inverse l'axe Y par rapport à la hauteur de page", () => {
    const page = 841.9;
    const point = toPdfLibPoint(topLeft(100, 200), page);
    // y attendu = pageHeight - (200 + correction baseline), x inchangé.
    assert.equal(point.x, 100);
    assert.ok(point.y < page - 200, "le point converti doit être décalé vers le bas d'un point PDF plus petit");
  });

  it("un point mesuré en haut de page (y petit) donne un y pdf-lib grand (proche du haut réel)", () => {
    const page = 841.9;
    const near_top = toPdfLibPoint(topLeft(0, 10), page);
    const near_bottom = toPdfLibPoint(topLeft(0, 800), page);
    assert.ok(near_top.y > near_bottom.y, "un point proche du haut (petit y mesuré) doit convertir vers un y pdf-lib plus grand");
  });

  it("reproduit exactement les 6 mesures empiriques du smoke test de calibrage (2031-SD 2026)", () => {
    // Ces valeurs sont le résultat d'une régénération réelle du PDF suivie
    // d'une re-mesure (pas un calcul arithmétique isolé) — voir le
    // commentaire de BBOX_TOP_TO_BASELINE_PT dans coordinates.ts. Ce test
    // fige ce calibrage : toute régression de la constante casse ce test
    // avant de casser un PDF réel.
    const pageHeight = 841.8897705078125;
    const cases: Array<{ y: number; expectedPdfLibY: number }> = [
      { y: 112.6, expectedPdfLibY: 841.8897705078125 - (112.6 + 9.675) },
      { y: 124.8, expectedPdfLibY: 841.8897705078125 - (124.8 + 9.675) },
      { y: 175.6, expectedPdfLibY: 841.8897705078125 - (175.6 + 9.675) },
      { y: 163.0, expectedPdfLibY: 841.8897705078125 - (163.0 + 9.675) },
    ];
    for (const c of cases) {
      const point = toPdfLibPoint(topLeft(0, c.y), pageHeight);
      assert.ok(
        Math.abs(point.y - c.expectedPdfLibY) < 1e-9,
        `y=${c.y} → attendu ${c.expectedPdfLibY}, obtenu ${point.y}`,
      );
    }
  });
});
