/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/generation-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  checkAssetIntegrity,
  checkCoordinateBounds,
  checkOverflow,
  checkOverlappingPositions,
  checkPageBounds,
  findOverlappingPositionGroups,
  runStructuralAndMappingGate,
} from "../gate/generation-gate";
import { CERFA_ASSET_MANIFEST_2026 } from "../asset-manifest";
import { ALL_CERFA_FORM_IDS, topLeft, type CerfaCase, type CerfaVisualMapping } from "../types";

function cerfaCase(caseId: string, value: CerfaCase["value"]): CerfaCase {
  return { caseId, label: caseId, value, trace: { source: "FiscalResult", path: "test", ksArtifacts: [] } };
}

describe("runStructuralAndMappingGate", () => {
  it("ne remonte aucune violation pour un dossier entierement couvert (2033-B, cases reelles)", () => {
    const violations = runStructuralAndMappingGate({
      millesime: 2026,
      forms: [{ form: "2033-B-SD", cases: [cerfaCase("218", 5100), cerfaCase("254", 3720)] }],
    });
    assert.deepEqual(violations, []);
  });

  it("bloque sur un millesime inconnu", () => {
    const violations = runStructuralAndMappingGate({
      millesime: 2099,
      forms: [{ form: "2033-B-SD", cases: [cerfaCase("218", 5100)] }],
    });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].code, "millesime-inconnu");
  });

  it("bloque sur une case sans mapping visuel", () => {
    const violations = runStructuralAndMappingGate({
      millesime: 2026,
      forms: [{ form: "2033-B-SD", cases: [cerfaCase("CASE_INEXISTANTE", 1)] }],
    });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].code, "case-sans-mapping-visuel");
  });

  it("bloque sur une case sans mapping ET sans exclusion documentee (352, jamais produite en pratique mais testee ici directement)", () => {
    const violations = runStructuralAndMappingGate({
      millesime: 2026,
      forms: [{ form: "2033-B-SD", cases: [cerfaCase("352", 0)] }],
    });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].code, "case-sans-mapping-visuel");
  });

  it("ne bloque PAS sur la case 300 (MICRO-JALON implémentation 300 : registre calibré, plus une exclusion) - la generation continue pour le reste du formulaire", () => {
    const violations = runStructuralAndMappingGate({
      millesime: 2026,
      forms: [{ form: "2033-B-SD", cases: [cerfaCase("218", 5100), cerfaCase("300", 0)] }],
    });
    assert.deepEqual(violations, []);
  });

  it("ne bloque PAS sur la case 350 (MICRO-JALON implémentation 350 : registre calibré, plus une exclusion) - la generation continue pour le reste du formulaire", () => {
    const violations = runStructuralAndMappingGate({
      millesime: 2026,
      forms: [{ form: "2033-B-SD", cases: [cerfaCase("218", 5100), cerfaCase("350", 0)] }],
    });
    assert.deepEqual(violations, []);
  });

  it("bloque sur une case-id dupliquee produite par un mapper", () => {
    const violations = runStructuralAndMappingGate({
      millesime: 2026,
      forms: [{ form: "2033-B-SD", cases: [cerfaCase("218", 5100), cerfaCase("218", 5100)] }],
    });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].code, "case-id-dupliquee");
  });

  it("bloque sur un formulaire sans manifeste d'asset (aucun cas reel dans ce perimetre, garde defensive)", () => {
    // Aucun formulaire du perimetre actuel n'est dans ce cas - la garde est
    // testee via un typage assoupli, pour prouver que le code la gere.
    const violations = runStructuralAndMappingGate({
      millesime: 2026,
      forms: [{ form: "INEXISTANT-SD" as never, cases: [cerfaCase("X", 1)] }],
    });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].code, "asset-manifest-manquant");
  });
});

describe("checkOverflow", () => {
  it("ne remonte rien pour une valeur qui tient dans la largeur calibree", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const mapping = {
      form: "2033-B-SD" as const,
      millesime: 2026,
      caseId: "218",
      page: 1,
      position: { space: "top-left" as const, x: 507.3, y: 105.5 },
      width: 85,
      fontSize: 9,
      align: "right" as const,
      format: "eur-arrondi" as const,
      calibration: "mesure-empirique" as const,
    };
    const violation = checkOverflow({ form: "2033-B-SD", caseValue: cerfaCase("218", 5100), mapping, font });
    assert.equal(violation, undefined);
  });

  it("bloque une valeur qui deborde la largeur calibree - jamais une troncature silencieuse", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const mapping = {
      form: "2033-B-SD" as const,
      millesime: 2026,
      caseId: "218",
      page: 1,
      position: { space: "top-left" as const, x: 507.3, y: 105.5 },
      width: 5, // largeur volontairement absurde pour forcer le debordement
      fontSize: 9,
      align: "right" as const,
      format: "eur-arrondi" as const,
      calibration: "mesure-empirique" as const,
    };
    const violation = checkOverflow({ form: "2033-B-SD", caseValue: cerfaCase("218", 5100), mapping, font });
    assert.ok(violation, "un debordement doit produire une violation");
    assert.equal(violation?.code, "debordement-largeur");
  });

  it("ne mesure rien pour une case a cocher a false (rien a dessiner)", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const mapping = {
      form: "2031-SD" as const,
      millesime: 2026,
      caseId: "D_REGIME_REEL_SIMPLIFIE",
      page: 1,
      position: { space: "top-left" as const, x: 438, y: 116.8 },
      width: 30,
      format: "case-a-cocher" as const,
      calibration: "estimee-par-symetrie" as const,
    };
    const violation = checkOverflow({
      form: "2031-SD",
      caseValue: cerfaCase("D_REGIME_REEL_SIMPLIFIE", false),
      mapping,
      font,
    });
    assert.equal(violation, undefined);
  });
});

describe("checkCoordinateBounds", () => {
  const baseMapping = {
    form: "2033-B-SD" as const,
    millesime: 2026,
    caseId: "218",
    page: 1,
    width: 85,
    format: "eur-arrondi" as const,
    calibration: "mesure-empirique" as const,
  };

  it("ne remonte rien pour une coordonnee dans les limites de la page", () => {
    const violation = checkCoordinateBounds({
      form: "2033-B-SD",
      caseId: "218",
      mapping: { ...baseMapping, position: { space: "top-left" as const, x: 507.3, y: 105.5 } },
      pageWidth: 595.3,
      pageHeight: 841.9,
    });
    assert.equal(violation, undefined);
  });

  it("bloque une coordonnee x negative", () => {
    const violation = checkCoordinateBounds({
      form: "2033-B-SD",
      caseId: "218",
      mapping: { ...baseMapping, position: { space: "top-left" as const, x: -10, y: 105.5 } },
      pageWidth: 595.3,
      pageHeight: 841.9,
    });
    assert.ok(violation);
    assert.equal(violation?.code, "coordonnee-hors-page");
  });

  it("bloque une coordonnee y au-dela de la hauteur de page (registre d'un autre millesime par erreur)", () => {
    const violation = checkCoordinateBounds({
      form: "2033-B-SD",
      caseId: "218",
      mapping: { ...baseMapping, position: { space: "top-left" as const, x: 100, y: 2000 } },
      pageWidth: 595.3,
      pageHeight: 841.9,
    });
    assert.ok(violation);
    assert.equal(violation?.code, "coordonnee-hors-page");
  });
});

describe("checkPageBounds", () => {
  it("ne remonte rien quand la page du registre existe bien dans le formulaire", () => {
    const violation = checkPageBounds({ form: "2033-B-SD", caseId: "218", mappingPage: 1, formPageCount: 1 });
    assert.equal(violation, undefined);
  });

  it("bloque quand le registre pointe vers une page que le formulaire n'a pas (registre desynchronise du manifeste)", () => {
    const violation = checkPageBounds({ form: "2033-B-SD", caseId: "218", mappingPage: 2, formPageCount: 1 });
    assert.ok(violation);
    assert.equal(violation?.code, "page-formulaire-invalide");
  });

  it("bloque sur une page 0 ou negative (defense en profondeur)", () => {
    const violation = checkPageBounds({ form: "2033-B-SD", caseId: "218", mappingPage: 0, formPageCount: 1 });
    assert.ok(violation);
    assert.equal(violation?.code, "page-formulaire-invalide");
  });
});

function syntheticMapping(caseId: string, x: number, y: number, page = 1): CerfaVisualMapping {
  return {
    form: "2033-B-SD",
    millesime: 2026,
    caseId,
    page,
    position: topLeft(x, y),
    width: 60,
    format: "eur-arrondi",
    calibration: "mesure-empirique",
  };
}

describe("findOverlappingPositionGroups — algorithme pur, sans dépendance au registre réel (section 7.C/D de la mission de correction P0)", () => {
  it("C — deux cases synthétiques à EXACTEMENT la même position (page, x, y) forment un groupe — reproduit le bug historique C_L1_COL1/C_L1_COL2 (502.9, 264.8)", () => {
    const groups = findOverlappingPositionGroups([
      syntheticMapping("C_L1_COL1", 502.9, 264.8),
      syntheticMapping("C_L1_COL2", 502.9, 264.8),
    ]);
    assert.equal(groups.length, 1, "une seule position partagée par deux cases doit produire un seul groupe");
    assert.deepEqual(
      groups[0].map((m) => m.caseId).sort(),
      ["C_L1_COL1", "C_L1_COL2"],
    );
  });

  it("D — deux cases à des positions distinctes (même minime différence) ne forment PAS de groupe", () => {
    const groups = findOverlappingPositionGroups([
      syntheticMapping("C_L1_COL1", 502.9, 264.8),
      syntheticMapping("C_L1_COL2", 569.8, 264.8),
    ]);
    assert.deepEqual(groups, [], "des positions distinctes ne doivent jamais être groupées, même proches");
  });

  it("un x ou un y différent suffit à ne pas grouper (aucun faux positif sur des cases simplement voisines)", () => {
    const groups = findOverlappingPositionGroups([
      syntheticMapping("A", 426.0, 424.8),
      syntheticMapping("B", 426.0, 787.8), // même x, y différent (312 vs 370 dans la vraie vie)
      syntheticMapping("C", 507.0, 424.8), // même y, x différent (312 vs 314)
    ]);
    assert.deepEqual(groups, []);
  });

  it("une page différente à la même (x,y) n'est pas un chevauchement (pages distinctes du même formulaire)", () => {
    const groups = findOverlappingPositionGroups([
      syntheticMapping("A", 426.0, 424.8, 1),
      syntheticMapping("B", 426.0, 424.8, 2),
    ]);
    assert.deepEqual(groups, []);
  });

  it("trois cases ou plus à la même position forment un seul groupe de taille 3", () => {
    const groups = findOverlappingPositionGroups([
      syntheticMapping("A", 100, 100),
      syntheticMapping("B", 100, 100),
      syntheticMapping("C", 100, 100),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].length, 3);
  });
});

describe("checkOverlappingPositions — contre le registre RÉEL (non-régression P0-2/P0-3)", () => {
  it("2031-SD (2026) — plus aucune superposition après correction de C_L1_COL1/C_L1_COL2", () => {
    const violations = checkOverlappingPositions({ form: "2031-SD", millesime: 2026 });
    assert.deepEqual(violations, []);
  });

  it("2033-B-SD (2026) — plus aucune superposition après correction de 372", () => {
    const violations = checkOverlappingPositions({ form: "2033-B-SD", millesime: 2026 });
    assert.deepEqual(violations, []);
  });

  it("aucun formulaire du millésime 2026 ne contient de position superposée non documentée", () => {
    for (const form of ALL_CERFA_FORM_IDS) {
      const violations = checkOverlappingPositions({ form, millesime: 2026 });
      assert.deepEqual(violations, [], `${form} ne doit avoir aucune superposition non documentée`);
    }
  });

  it("runStructuralAndMappingGate (gate complète) ne bloque plus C_L1_COL1/C_L1_COL2 ni 370/372 produites ensemble — non-régression d'intégration", () => {
    // Ce test n'a pas vocation à REPRODUIRE le bug historique (le vrai
    // registre est corrigé à dessein, on ne va pas le re-casser pour un
    // test) : il vérifie que `runStructuralAndMappingGate` — le point
    // d'entrée réellement appelé par `generateCerfaLiassePdf()`, pas
    // seulement la fonction unitaire `checkOverlappingPositions` testée
    // ci-dessus — reste cohérent quand ces cases historiquement superposées
    // sont produites simultanément par un mapper. La preuve du FAIL/PASS
    // sur l'algorithme lui-même est dans `findOverlappingPositionGroups`
    // ci-dessus (section 7.C/D de la mission).
    const violations = runStructuralAndMappingGate({
      millesime: 2026,
      forms: [
        { form: "2031-SD", cases: [cerfaCase("C_L1_COL1", 100), cerfaCase("C_L1_COL2", 100)] },
        { form: "2033-B-SD", cases: [cerfaCase("370", 100), cerfaCase("372", 100)] },
      ],
    });
    assert.deepEqual(violations, [], "avec le registre corrigé, ces cases ne se superposent plus");
  });
});

describe("checkAssetIntegrity", () => {
  const manifestEntry = CERFA_ASSET_MANIFEST_2026.find((e) => e.form === "2033-B-SD")!;

  it("ne remonte rien quand l'empreinte SHA-256 correspond", () => {
    const bytes = new TextEncoder().encode("contenu-de-test-stable");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const violation = checkAssetIntegrity({
      form: "2033-B-SD",
      assetFile: "test.pdf",
      bytes,
      manifestEntry: { ...manifestEntry, sha256 },
    });
    assert.equal(violation, undefined);
  });

  it("bloque quand l'empreinte SHA-256 ne correspond pas - fond officiel remplace, corrompu, ou modifie", () => {
    const bytes = new TextEncoder().encode("contenu-modifie-apres-calibrage");
    const violation = checkAssetIntegrity({
      form: "2033-B-SD",
      assetFile: "test.pdf",
      bytes,
      manifestEntry: { ...manifestEntry, sha256: "0".repeat(64) },
    });
    assert.ok(violation, "une empreinte qui ne correspond pas doit bloquer");
    assert.equal(violation?.code, "asset-empreinte-invalide");
  });

  it("l'empreinte enregistree pour les 2 assets reels correspond bien au contenu actuel des fichiers - detecte toute modification accidentelle du depot", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    for (const entry of CERFA_ASSET_MANIFEST_2026) {
      const bytes = readFileSync(path.join(__dirname, "..", "assets", String(entry.millesime), entry.assetFile));
      const violation = checkAssetIntegrity({
        form: entry.form,
        assetFile: entry.assetFile,
        bytes: new Uint8Array(bytes),
        manifestEntry: entry,
      });
      assert.equal(violation, undefined, `${entry.assetFile} doit correspondre à son empreinte enregistrée`);
    }
  });
});
