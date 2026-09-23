/**
 * Lot 5.4-B — schéma Vision registre PDF : fail closed sur payload invalide.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot54b-depreciation-register-vision-schema.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseDepreciationRegisterVisionPayload } from "./depreciation-register-vision-schema";

describe("Lot 5.4-B — parseDepreciationRegisterVisionPayload", () => {
  it("payload valide → lignes mappées avec pageNumber injecté", () => {
    const rows = parseDepreciationRegisterVisionPayload(
      {
        rows: [
          {
            rowType: "asset",
            assetRef: "A1",
            label: "Bien A",
            acquisitionDateRaw: "01/01/2020",
            startDateRaw: null,
            grossCostRaw: "1 000,00",
            openingCumulativeRaw: "200,00",
            dotationRaw: null,
            closingCumulativeRaw: null,
            vncRaw: null,
            methodRaw: "L",
            durationRaw: "05 - 00",
            exitDateRaw: null,
            exitLabelRaw: null,
            scopeLabel: null,
            rawSnippet: "A1 Bien A 1 000,00 200,00",
          },
        ],
      },
      3,
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].pageNumber, 3);
    assert.equal(rows[0].assetRef, "A1");
    assert.equal(rows[0].grossCostRaw, "1 000,00");
    assert.equal(rows[0].startDateRaw, undefined); // null → undefined, jamais une valeur inventée
  });

  it("payload racine invalide (pas un objet {rows:[...]}) → [] (fail closed)", () => {
    assert.deepEqual(parseDepreciationRegisterVisionPayload(null, 1), []);
    assert.deepEqual(parseDepreciationRegisterVisionPayload("garbage", 1), []);
    assert.deepEqual(parseDepreciationRegisterVisionPayload([1, 2, 3], 1), []);
    assert.deepEqual(parseDepreciationRegisterVisionPayload({ rows: "not-an-array" }, 1), []);
  });

  it("rowType hors énumération → [] (fail closed, jamais une ligne mal typée acceptée)", () => {
    const rows = parseDepreciationRegisterVisionPayload(
      {
        rows: [
          {
            rowType: "invented_type",
            assetRef: null,
            label: null,
            acquisitionDateRaw: null,
            startDateRaw: null,
            grossCostRaw: null,
            openingCumulativeRaw: null,
            dotationRaw: null,
            closingCumulativeRaw: null,
            vncRaw: null,
            methodRaw: null,
            durationRaw: null,
            exitDateRaw: null,
            exitLabelRaw: null,
            scopeLabel: null,
            rawSnippet: "x",
          },
        ],
      },
      1,
    );
    assert.deepEqual(rows, []);
  });

  it("champ requis manquant (rawSnippet) → [] (fail closed)", () => {
    const rows = parseDepreciationRegisterVisionPayload(
      {
        rows: [
          {
            rowType: "asset",
            assetRef: "A1",
            label: "Bien A",
            acquisitionDateRaw: null,
            startDateRaw: null,
            grossCostRaw: "100,00",
            openingCumulativeRaw: null,
            dotationRaw: null,
            closingCumulativeRaw: null,
            vncRaw: null,
            methodRaw: null,
            durationRaw: null,
            exitDateRaw: null,
            exitLabelRaw: null,
            scopeLabel: null,
            // rawSnippet manquant
          },
        ],
      },
      1,
    );
    assert.deepEqual(rows, []);
  });

  it("liste vide → [] (jamais une erreur, un document sans ligne détectée reste possible)", () => {
    assert.deepEqual(parseDepreciationRegisterVisionPayload({ rows: [] }, 1), []);
  });

  it("lignes mixtes (une valide + une invalide) → seule la ligne invalide est écartée, jamais toute la page", () => {
    const validRow = {
      rowType: "asset",
      assetRef: "A1",
      label: "Bien A",
      acquisitionDateRaw: null,
      startDateRaw: null,
      grossCostRaw: "100,00",
      openingCumulativeRaw: null,
      dotationRaw: null,
      closingCumulativeRaw: null,
      vncRaw: null,
      methodRaw: null,
      durationRaw: null,
      exitDateRaw: null,
      exitLabelRaw: null,
      scopeLabel: null,
      rawSnippet: "A1 Bien A 100,00",
    };
    const invalidRow = { rowType: "not_a_real_type" };

    const rows = parseDepreciationRegisterVisionPayload({ rows: [validRow, invalidRow] }, 2);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].assetRef, "A1");
  });
});
