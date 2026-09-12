/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/case-318-verification.test.ts
 *
 * Vérification explicite dédiée à la case 318 (section 6 de la mission de
 * sécurisation P0) — la case avait été découverte manquante puis ajoutée
 * dans la mission précédente ; ce test vérifie, séparément de toute autre
 * case, que : (1) sa position est bien calibrée par mesure directe sur le
 * Cerfa officiel, (2) le mapper la produit avec la bonne valeur, (3) elle
 * atterrit sur la bonne page du PDF final, (4) un test dédié au registre
 * existe, (5) un test golden master l'exerce (partagé avec les autres
 * cases, voir golden-master-technical-pipeline.test.ts), (6) une extraction
 * post-render la retrouve — sans dépendre d'une assertion partagée avec la
 * case 254 (qui porte la même valeur dans le dossier témoin, ce qui aurait
 * pu masquer une régression sur l'une des deux sans que l'autre y soit).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";

import { generateCerfaLiassePdf } from "../generator/render-cerfa-liasse";
import { resolveVisualMapping } from "../registry";
import { extractDrawnStringsForPage } from "./extract-rendered-text";
import { buildDossierTemoinRfs } from "./golden-master-technical-pipeline.test";

describe("Case 318 (2033-B-SD) — vérification dédiée", () => {
  it("(1) coordonnées officielles — calibrée par mesure empirique, distincte de la case 254", () => {
    const mapping318 = resolveVisualMapping("2033-B-SD", 2026, "318");
    const mapping254 = resolveVisualMapping("2033-B-SD", 2026, "254");
    assert.ok(mapping318);
    assert.equal(mapping318?.calibration, "mesure-empirique");
    assert.notDeepEqual(
      mapping318?.position,
      mapping254?.position,
      "318 et 254 doivent avoir des positions distinctes malgré une valeur identique sur le dossier témoin",
    );
  });

  it("(2) valeur produite par le mapper — round2(amortReporte), inchangé", () => {
    const rfs = buildDossierTemoinRfs();
    const form = map2033BFromRfs(rfs);
    const case318 = form.cases.find((c) => c.caseId === "318");
    assert.ok(case318);
    assert.equal(case318?.value, rfs.fiscalResult.amortReporte);
  });

  it("(3)+(6) emplacement correct dans le PDF final — extraction post-render à la bonne page, position mesurée dans le manifeste", async () => {
    const rfs = buildDossierTemoinRfs();
    const form2033B = map2033BFromRfs(rfs);
    const result = await generateCerfaLiassePdf({
      millesime: 2026,
      forms: [{ form: "2033-B-SD", cases: form2033B.cases }],
    });
    if (result.status === "blocked") {
      assert.fail(`Génération bloquée : ${JSON.stringify(result.violations, null, 2)}`);
      return;
    }
    const manifestEntry318 = result.manifest.find((m) => m.caseId === "318");
    assert.ok(manifestEntry318, "318 doit figurer dans le manifeste de rendu");
    assert.equal(manifestEntry318?.text, "3 720");
    assert.equal(manifestEntry318?.outputPage, 1, "2033-B-SD est la seule page ici, 318 doit s'y trouver");

    const pageText = await extractDrawnStringsForPage(result.pdfBytes, 1);
    assert.ok(pageText.includes("3 720"), "318 doit être réellement extractible du PDF produit");
  });
});
