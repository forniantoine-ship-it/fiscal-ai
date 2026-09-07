/**
 * P1-PDF-02-E — transport du PatrimonialState dans la RFS.
 * Run: npx tsx --test src/runtime/rfs-patrimoine-transport.test.ts
 *
 * Aucune règle fiscale nouvelle : `assemblePatrimoine()` et `map2033AFromRfs()`
 * restent les seuls calculateurs. Ce fichier vérifie uniquement que le
 * pipeline sait transporter (ou ne pas inventer) le patrimoine.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { SYNTHETIC_P0_BILAN_INPUTS, buildSyntheticP0RfsAvecPatrimoine, buildSyntheticP0RfsSansPatrimoine } from "@/lib/lmnp/services/liasse-pdf/tests/fixtures-2033a-rfs";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import { assemblePatrimoine } from "./capabilities/bilan/assemble-patrimoine";
import { buildFiscalRepresentation } from "./capabilities/rfs/build-fiscal-representation";
import { map2033AFromRfs } from "./capabilities/rfs/projection/map-2033a";

function draftMinimal(): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
  } as unknown as DeclarationDraft;
}

describe("P1-PDF-02-E — buildFiscalRepresentation transporte le patrimoine déjà assemblé", () => {
  it("sans patrimoine : champ undefined, source absente — jamais un état inventé", () => {
    const rfs = buildSyntheticP0RfsSansPatrimoine();
    assert.equal(rfs.patrimoine, undefined);
    assert.equal(rfs.trace.sources.patrimoine, undefined);
  });

  it("avec patrimoine : même référence que assemblePatrimoine(), aucun recalcul", () => {
    const base = buildSyntheticP0RfsSansPatrimoine();
    const patrimoine = assemblePatrimoine(base, SYNTHETIC_P0_BILAN_INPUTS);
    const rfs = buildFiscalRepresentation({
      fiscalResult: base.fiscalResult,
      identite: base.identite,
      immobilisations: base.immobilisations,
      emprunts: base.emprunts,
      patrimoine,
    });
    assert.equal(rfs.patrimoine, patrimoine, "même objet — transport pur");
    assert.equal(rfs.trace.sources.patrimoine, "assemblePatrimoine() (capabilities/bilan) — transport pur");
  });
});

describe("P1-PDF-02-E — runDeclarationGeneration n'invente pas de BilanInputs", () => {
  it("sans 4e argument : rfs.patrimoine reste undefined, 084/120/134/137/142 bloquées", () => {
    const generation = runDeclarationGeneration(draftMinimal(), 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    assert.equal(generation.rfs.patrimoine, undefined);
    const form = map2033AFromRfs(generation.rfs);
    for (const caseId of ["084", "120", "134", "137", "142"]) {
      assert.equal(form.cases.find((c) => c.caseId === caseId), undefined, `${caseId} ne doit pas être inventée`);
    }
  });

  it("BilanInputs réels fournis : le patrimoine assemblé est transporté jusqu'à la RFS", () => {
    const generation = runDeclarationGeneration(draftMinimal(), 2025, undefined, SYNTHETIC_P0_BILAN_INPUTS);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    assert.ok(generation.rfs.patrimoine, "patrimoine transporté uniquement parce que BilanInputs étaient fournis");
    assert.equal(generation.rfs.trace.sources.patrimoine, "assemblePatrimoine() (capabilities/bilan) — transport pur");
    assert.equal(generation.rfs.patrimoine?.tresorerie.clotureRetenue, 3000);
    assert.equal(generation.rfs.patrimoine?.compteExploitant.clotureN, 36100);
    assert.equal(generation.rfs.patrimoine?.ran.valeur, 0);
    assert.equal(generation.rfs.patrimoine?.subventionsInvestissement.status, "NUL_CONFIRME");
  });
});

describe("P1-PDF-02-E — fixture synthétique P0 via le constructeur RFS", () => {
  it("buildSyntheticP0RfsAvecPatrimoine pose le patrimoine ; sans lui les 5 cases restent bloquées", () => {
    const sans = buildSyntheticP0RfsSansPatrimoine();
    const avec = buildSyntheticP0RfsAvecPatrimoine();
    assert.equal(sans.patrimoine, undefined);
    assert.ok(avec.patrimoine);
    const formSans = map2033AFromRfs(sans);
    const formAvec = map2033AFromRfs(avec);
    for (const caseId of ["084", "120", "134", "137", "142"]) {
      assert.equal(formSans.cases.find((c) => c.caseId === caseId), undefined);
      assert.ok(formAvec.cases.find((c) => c.caseId === caseId), `${caseId} ouverte uniquement avec patrimoine`);
    }
  });
});
