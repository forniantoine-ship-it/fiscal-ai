/**
 * Takeover UX Lot 1 — classification : collapse d'équivalence fiscale.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/suggest-register-asset-classification.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { isAvailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import { isCandidatePresent, missingCandidate, presentCandidate } from "./candidate-value";
import type { CandidateHistoricalAsset } from "./asset-candidates";
import { mapAcceptedCandidateAssetsToOpening } from "./map-accepted-to-opening";
import {
  applyDeterministicDocumentaryClassifications,
  hasStrongTerrainSignal,
  parsePcgAccountCode,
  suggestClassificationFromPcgAccount,
  suggestRegisterAssetClassification,
  tryFiscallyEquivalentAmortizableCollapse,
} from "./suggest-register-asset-classification";

describe("suggestRegisterAssetClassification", () => {
  it("exact tokens", () => {
    assert.equal(suggestRegisterAssetClassification("terrain")?.classification, "terrain");
    assert.equal(suggestRegisterAssetClassification("Bâtiment")?.classification, "batiment");
    assert.equal(suggestRegisterAssetClassification("MOBILIER")?.classification, "mobilier");
    assert.equal(suggestRegisterAssetClassification("travaux")?.classification, "travaux");
  });

  it("immeuble keyword → batiment", () => {
    assert.equal(
      suggestRegisterAssetClassification("Immeuble rue de la Paix")?.classification,
      "batiment",
    );
  });

  it("fail closed on vague / unknown labels", () => {
    assert.equal(suggestRegisterAssetClassification(""), null);
    assert.equal(suggestRegisterAssetClassification("Matériel"), null);
    assert.equal(suggestRegisterAssetClassification("APPLE MACBOOK"), null);
  });
});

describe("fiscally-equivalent amortizable collapse", () => {
  it("2154 / 2182 / 2183 / 2184 / 213 / 214 → autre neutre (pas de précision inventée)", () => {
    for (const code of ["21540000", "21820000", "21830000", "21840000", "21310000", "21400000"]) {
      const s = tryFiscallyEquivalentAmortizableCollapse({ accountCode: code, label: "Équipement" });
      assert.equal(s?.classification, "autre", code);
      assert.equal(s?.proof, "fiscal_equivalence_collapse", code);
    }
  });

  it("211* ne devient JAMAIS terrain automatiquement", () => {
    assert.equal(tryFiscallyEquivalentAmortizableCollapse({ accountCode: "21100000" }), null);
    assert.equal(tryFiscallyEquivalentAmortizableCollapse({ accountCode: "21150000" }), null);
    assert.equal(
      tryFiscallyEquivalentAmortizableCollapse({
        accountCode: "21150000",
        label: "Terrain bâti maison",
      }),
      null,
    );
    assert.equal(
      tryFiscallyEquivalentAmortizableCollapse({
        accountCode: "21100000",
        label: "Maison (terrain+bâti)",
      }),
      null,
    );
    assert.equal(suggestClassificationFromPcgAccount("21100000"), null);
  });

  it("compte amortissable + signal terrain → fail closed (pas de composant silencieux)", () => {
    assert.equal(
      tryFiscallyEquivalentAmortizableCollapse({
        accountCode: "21540000",
        label: "Terrain",
      }),
      null,
    );
    assert.equal(
      tryFiscallyEquivalentAmortizableCollapse({
        accountCode: "21820000",
        label: "Terrain de loisir",
      }),
      null,
    );
    assert.equal(
      tryFiscallyEquivalentAmortizableCollapse({
        accountCode: "21310000",
        label: "Terrain nu",
      }),
      null,
    );
    assert.equal(hasStrongTerrainSignal("Terrain de loisir"), true);
  });

  it("signal travaux fort → pas de collapse vers autre", () => {
    assert.equal(
      tryFiscallyEquivalentAmortizableCollapse({
        accountCode: "21540000",
        label: "Travaux de rénovation cuisine",
      }),
      null,
    );
  });

  it("parsePcgAccountCode — section compte uniquement", () => {
    assert.equal(parsePcgAccountCode("Compte 21540000"), "21540000");
    assert.equal(parsePcgAccountCode("Compte 21820000 — Matériel de transport"), "21820000");
    assert.equal(parsePcgAccountCode("21540000"), "21540000");
    assert.equal(parsePcgAccountCode("RENAULT TRAFIC EE-286-XG"), null);
  });
});

describe("applyDeterministicDocumentaryClassifications — adversarial", () => {
  function stub(partial: {
    key: string;
    label: string;
    pcg?: string;
    classification?: "autre" | "terrain";
  }): CandidateHistoricalAsset {
    const prov = {
      documentId: "doc",
      documentRole: "depreciation_register" as const,
      sourceRef: partial.key,
      extractionMethod: "test",
      confidence: createConfidenceScore(0.9, ["test"]),
      fieldSource: "extracted" as const,
    };
    return {
      candidateKey: partial.key,
      label: presentCandidate(partial.label, "direct", prov),
      coutBrut: presentCandidate(100, "direct", prov),
      cumulOuverture: presentCandidate(10, "direct", prov),
      startDate: presentCandidate("2020-01-01", "direct", prov),
      durationYears: presentCandidate(5, "direct", prov),
      method: presentCandidate("lineaire", "direct", prov),
      prorataConvention: missingCandidate(),
      classification: partial.classification
        ? presentCandidate(partial.classification, "direct", prov)
        : missingCandidate(),
      nonAmortizable: missingCandidate(),
      propertyId: missingCandidate(),
      ...(partial.pcg
        ? { pcgAccountCode: presentCandidate(partial.pcg, "direct", prov) }
        : {}),
    };
  }

  it("GEFFROY-like 2154 → autre neutre, jamais nonAmortizable", () => {
    const [out] = applyDeterministicDocumentaryClassifications([
      stub({ key: "a", label: "Ponceuse", pcg: "21540000" }),
    ]);
    assert.ok(isCandidatePresent(out!.classification));
    assert.equal(out!.classification.value, "autre");
    assert.equal(out!.classification.nature, "derived");
    assert.equal(isCandidatePresent(out!.nonAmortizable), false);
  });

  it("21150000 Terrain bâti maison → unresolved, pas terrain", () => {
    const [out] = applyDeterministicDocumentaryClassifications([
      stub({ key: "a", label: "Terrain bâti maison", pcg: "21150000" }),
    ]);
    assert.equal(isCandidatePresent(out!.classification), false);
  });

  it("21100000 Maison terrain+bâti → unresolved", () => {
    const [out] = applyDeterministicDocumentaryClassifications([
      stub({ key: "a", label: "Maison (terrain+bâti)", pcg: "21100000" }),
    ]);
    assert.equal(isCandidatePresent(out!.classification), false);
  });

  it("21540000 + Terrain → unresolved (contradiction)", () => {
    const [out] = applyDeterministicDocumentaryClassifications([
      stub({ key: "a", label: "Terrain", pcg: "21540000" }),
    ]);
    assert.equal(isCandidatePresent(out!.classification), false);
  });

  it("21820000 + Terrain de loisir → unresolved", () => {
    const [out] = applyDeterministicDocumentaryClassifications([
      stub({ key: "a", label: "Terrain de loisir", pcg: "21820000" }),
    ]);
    assert.equal(isCandidatePresent(out!.classification), false);
  });

  it("21310000 + Terrain nu → unresolved", () => {
    const [out] = applyDeterministicDocumentaryClassifications([
      stub({ key: "a", label: "Terrain nu", pcg: "21310000" }),
    ]);
    assert.equal(isCandidatePresent(out!.classification), false);
  });

  it("classification déjà présente → non écrasée", () => {
    const [out] = applyDeterministicDocumentaryClassifications([
      stub({ key: "a", label: "X", pcg: "21540000", classification: "autre" }),
    ]);
    assert.ok(isCandidatePresent(out!.classification));
    assert.equal(out!.classification.nature, "direct");
  });
});

describe("batiment / mobilier / autre — sémantique Opening identique (composant)", () => {
  function asset(
    key: string,
    classification: "batiment" | "mobilier" | "autre",
  ): CandidateHistoricalAsset {
    const prov = {
      documentId: "doc",
      documentRole: "depreciation_register" as const,
      sourceRef: key,
      extractionMethod: "test",
      confidence: createConfidenceScore(0.9, ["test"]),
      fieldSource: "extracted" as const,
    };
    return {
      candidateKey: key,
      label: presentCandidate(key, "direct", prov),
      coutBrut: presentCandidate(10_000, "direct", prov),
      cumulOuverture: presentCandidate(2_000, "direct", prov),
      startDate: presentCandidate("2020-01-01", "direct", prov),
      durationYears: presentCandidate(10, "direct", prov),
      method: presentCandidate("lineaire", "direct", prov),
      prorataConvention: missingCandidate(),
      classification: presentCandidate(classification, "direct", prov),
      nonAmortizable: missingCandidate(),
      propertyId: presentCandidate("prop-1", "direct", prov),
    };
  }

  it("les trois classifications produisent categorie=composant et même plan amortissable", () => {
    const mapped = mapAcceptedCandidateAssetsToOpening({
      assets: [asset("b", "batiment"), asset("m", "mobilier"), asset("a", "autre")],
      stableAssetIdByCandidateKey: { b: "asset-b", m: "asset-m", a: "asset-a" },
    });
    assert.equal(mapped.status, "mapped");
    if (mapped.status !== "mapped") return;
    for (const openingAsset of mapped.assets) {
      assert.equal(openingAsset.categorie, "composant");
      assert.ok(isAvailable(openingAsset.plan));
      if (!isAvailable(openingAsset.plan)) continue;
      assert.equal(openingAsset.plan.value.kind, "amortizable");
      if (openingAsset.plan.value.kind !== "amortizable") continue;
      assert.equal(openingAsset.plan.value.startDate, "2020-01-01");
      assert.equal(openingAsset.plan.value.durationYears, 10);
      assert.equal("prorataConvention" in openingAsset.plan.value, false);
    }
  });
});
