/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/registry-resolution.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMillesimeKnown, resolveVisualMapping } from "../registry";
import { isExcludedCase } from "../excluded-cases";

describe("resolveVisualMapping", () => {
  it("resout une case reelle (2033-B / 2026 / 218)", () => {
    const mapping = resolveVisualMapping("2033-B-SD", 2026, "218");
    assert.ok(mapping, "la case 218 doit exister dans le registre 2033-B 2026");
    assert.equal(mapping?.calibration, "mesure-empirique");
  });

  it("renvoie undefined pour une case inconnue - jamais une position inventee", () => {
    const mapping = resolveVisualMapping("2033-B-SD", 2026, "CASE_QUI_N_EXISTE_PAS");
    assert.equal(mapping, undefined);
  });

  it("renvoie undefined pour un millesime inconnu", () => {
    const mapping = resolveVisualMapping("2033-B-SD", 2099, "218");
    assert.equal(mapping, undefined);
  });

  it("renvoie undefined pour un formulaire dont le registre est volontairement vide (2033-E, aucun mapper reel)", () => {
    const mapping = resolveVisualMapping("2033-E-SD", 2026, "999");
    assert.equal(mapping, undefined);
  });

  it("I_7B (2031-bis) est calibree par mesure empirique", () => {
    const mapping = resolveVisualMapping("2031-bis-SD", 2026, "I_AUTRES_LMNP_DEFICIT");
    assert.equal(mapping?.calibration, "mesure-empirique");
  });

  it("352/354 (2033-B) n'existent plus du tout dans le registre - jamais produites par le mapper actuel, aucune case a positionner", () => {
    assert.equal(resolveVisualMapping("2033-B-SD", 2026, "352"), undefined);
    assert.equal(resolveVisualMapping("2033-B-SD", 2026, "354"), undefined);
  });

  it("aucune coordonnee du perimetre supporte (2031-SD, 2031-bis-SD, 2033-B-SD) ne reste marquee 'estimee-par-symetrie' - objectif P0 atteint", () => {
    const formsAndCaseIds: Array<[string, string[]]> = [
      [
        "2031-SD",
        [
          "A_SIREN",
          "A_DENOMINATION",
          "A_ADRESSE_ENTREPRISE",
          "A_EXERCICE_DEBUT",
          "A_EXERCICE_FIN",
          "D_REGIME_REEL_SIMPLIFIE",
          "C_L1_COL1",
          "C_L1_COL2",
          "I_7A",
          "I_7B",
        ],
      ],
      ["2031-bis-SD", ["I_AUTRES_LMNP_BENEFICE", "I_AUTRES_LMNP_DEFICIT"]],
      [
        "2033-B-SD",
        ["218", "232", "242", "244", "254", "264", "270", "294", "300", "310", "312", "314", "318", "330", "350", "370", "372"],
      ],
    ];
    for (const [form, caseIds] of formsAndCaseIds) {
      for (const caseId of caseIds) {
        const mapping = resolveVisualMapping(form as never, 2026, caseId);
        assert.ok(mapping, `${form}/${caseId} doit avoir une entrée de registre`);
        assert.notEqual(
          mapping?.calibration,
          "estimee-par-symetrie",
          `${form}/${caseId} ne doit plus être 'estimee-par-symetrie'`,
        );
        assert.notEqual(mapping?.calibration, "a-calibrer", `${form}/${caseId} ne doit plus être 'a-calibrer'`);
      }
    }
  });
});

describe("isExcludedCase", () => {
  it("300 (2033-B) n'est plus exclu — MICRO-JALON implémentation 300 : géométrie démontrée (aucune question fiscale n'a jamais existé pour cette case)", () => {
    assert.equal(isExcludedCase("2033-B-SD", 2026, "300"), undefined);
  });

  it("350 (2033-B) n'est plus exclu — MICRO-JALON implémentation 350 : règle fiscale verrouillée ET géométrie démontrée", () => {
    assert.equal(isExcludedCase("2033-B-SD", 2026, "350"), undefined);
  });

  it("218 n'est pas exclu (case reellement supportee)", () => {
    assert.equal(isExcludedCase("2033-B-SD", 2026, "218"), undefined);
  });
});

describe("isMillesimeKnown", () => {
  it("2026 est connu", () => {
    assert.equal(isMillesimeKnown(2026), true);
  });
  it("2027 n'est pas encore connu - jamais un repli silencieux vers 2026", () => {
    assert.equal(isMillesimeKnown(2027), false);
  });
});
