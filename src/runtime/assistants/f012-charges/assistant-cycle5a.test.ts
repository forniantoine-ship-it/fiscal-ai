import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { resolveFamilyCoverage } from "../../capabilities/f012/family-coverage";
import { collectedToChargeRegistry, toF012PersistedStateWithRegistry } from "./collected-to-registry";
import { markFamilyNone, markFamilyUnknown } from "./family-coverage-intents";
import { F012ChargesAssistant } from "./assistant";
import type { F012CollectedData, F012Deps } from "./types";
import type { ProfilCharges } from "../../capabilities/f012/types";

const EXERCISE = 2024;
const ctx = { dossierId: "test", fiscalYear: EXERCISE, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const TS = "2024-03-01T10:00:00.000Z";

const PROFIL_SIMPLE: ProfilCharges = {
  copropriete: false,
  agence: false,
  travaux: false,
  vacance: false,
  comptable: false,
};

const PROFIL_FULL: ProfilCharges = {
  copropriete: true,
  agence: true,
  travaux: true,
  vacance: false,
  comptable: true,
};

function emptyCollected(): F012CollectedData {
  return { coproLignes: [], travaux: [], divers: [], skippedCategories: [] };
}

function registryOf(collected: F012CollectedData, profil: ProfilCharges = PROFIL_SIMPLE) {
  return collectedToChargeRegistry({
    collected,
    profil,
    categoryInventory: [
      "taxe_fonciere",
      "assurance_pno",
      ...(profil.copropriete ? (["copropriete"] as const) : []),
      ...(profil.agence ? (["honoraires_gestion"] as const) : []),
      ...(profil.travaux ? (["travaux"] as const) : []),
      ...(profil.comptable ? (["honoraires_comptable"] as const) : []),
      "frais_bancaires",
      "divers",
    ],
    fieldSources: {},
    exercise: EXERCISE,
  });
}

function coverage(collected: F012CollectedData, familyId: "impots" | "syndic" | "assurances" | "gestion" | "travaux" | "autres", profil?: ProfilCharges) {
  return registryOf(collected, profil).familyCoverage.find((item) => item.familyId === familyId);
}

describe("F-012 Cycle 5A — statuts FamilyCoverage", () => {
  it("A — none : je sais que je n'ai rien payé, aucune Charge", () => {
    const collected = markFamilyNone(emptyCollected(), "impots");
    const impots = coverage(collected, "impots");
    assert.equal(impots?.status, "none");
    assert.deepEqual(impots?.chargeIds, []);
    assert.equal(registryOf(collected).charges.length, 0);
  });

  it("B — unknown explicite : je ne sais pas, aucune Charge, jamais 0 €", () => {
    const collected = markFamilyUnknown(emptyCollected(), "impots", "unsure");
    const impots = coverage(collected, "impots");
    assert.equal(impots?.status, "unknown");
    assert.equal(impots?.unknownReason, "unsure");
    assert.deepEqual(impots?.chargeIds, []);
    assert.equal(collected.taxeFonciere, undefined);
    assert.notEqual(collected.taxeFonciere, 0);
  });

  it("C — not_applicable : pas de copro au profil", () => {
    const syndic = coverage(emptyCollected(), "syndic", PROFIL_SIMPLE);
    assert.equal(syndic?.status, "not_applicable");
    assert.deepEqual(syndic?.chargeIds, []);
  });

  it("D — captured : au moins une Charge réelle", () => {
    const impots = coverage({ ...emptyCollected(), taxeFonciere: 1200 }, "impots");
    assert.equal(impots?.status, "captured");
    assert.ok((impots?.chargeIds.length ?? 0) > 0);
  });

  it("E — pending : famille applicable, pas encore traitée", () => {
    const impots = coverage(emptyCollected(), "impots");
    assert.equal(impots?.status, "pending");
  });

  it("F — document_missing (CFE / avis) : unknown, pas de Charge à 0", () => {
    const collected = markFamilyUnknown(emptyCollected(), "impots", "document_missing");
    const impots = coverage(collected, "impots");
    assert.equal(impots?.status, "unknown");
    assert.equal(impots?.unknownReason, "document_missing");
    assert.equal(registryOf(collected).charges.length, 0);
    assert.equal(collected.taxeFonciere, undefined);
  });

  it("K — plusieurs familles, statuts distincts", () => {
    let collected = markFamilyUnknown(emptyCollected(), "impots", "document_missing");
    collected = markFamilyNone(collected, "assurances");
    collected = { ...collected, fraisBancaires: 24 };
    const registry = registryOf(collected, PROFIL_SIMPLE);
    const byId = Object.fromEntries(registry.familyCoverage.map((item) => [item.familyId, item.status]));
    assert.equal(byId.impots, "unknown");
    assert.equal(byId.assurances, "none");
    assert.equal(byId.autres, "captured");
    assert.equal(byId.syndic, "not_applicable");
    assert.equal(byId.travaux, "not_applicable");
    assert.equal(byId.gestion, "not_applicable");
  });

  it("never convertit unknown en none", () => {
    const unknown = markFamilyUnknown(emptyCollected(), "impots", "later");
    const refused = markFamilyNone(unknown, "impots");
    assert.equal(coverage(refused, "impots")?.status, "unknown");
    assert.equal(resolveFamilyCoverage({
      chargeCount: 0,
      applicable: true,
      inInventory: true,
      explicitUnknown: "later",
      explicitNone: true,
      skipped: true,
    }).status, "unknown");
  });

  it("skip historique reste unknown, sans inventer une reason", () => {
    const skipped = coverage({ ...emptyCollected(), skippedCategories: ["taxe_fonciere"] }, "impots");
    assert.equal(skipped?.status, "unknown");
    assert.equal(skipped?.unknownReason, undefined);
  });
});

describe("F-012 Cycle 5A — persistence / reprise / totaux", () => {
  it("G — unknown persiste après refresh et reste unknown", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "unknown_category", reason: "document_missing" });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.deepEqual(turn.state.collected.unknownFamilies, [{ familyId: "impots", reason: "document_missing" }]);

    const persisted = toF012PersistedStateWithRegistry(turn.state, TS, EXERCISE);
    assert.equal(persisted.registry?.familyCoverage.find((item) => item.familyId === "impots")?.status, "unknown");
    assert.equal(persisted.registry?.familyCoverage.find((item) => item.familyId === "impots")?.unknownReason, "document_missing");

    const reloaded = JSON.parse(JSON.stringify(persisted)) as typeof persisted;
    const resumed = assistant.resume(reloaded);
    assert.deepEqual(resumed.state.collected.unknownFamilies, [{ familyId: "impots", reason: "document_missing" }]);
    const rebuilt = collectedToChargeRegistry({
      collected: resumed.state.collected,
      profil: resumed.state.profil,
      categoryInventory: resumed.state.categoryInventory,
      fieldSources: resumed.state.fieldSources,
      exercise: EXERCISE,
    });
    assert.equal(rebuilt.familyCoverage.find((item) => item.familyId === "impots")?.status, "unknown");
    assert.ok(resumed.messages.some((m) => m.content.includes("manquait une information")));
    assert.equal(resumed.completed, false);
  });

  it("H/I — unknown n'affecte pas les totaux et n'est jamais 0 €", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "unknown_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 180 });
    while (turn.state.step === "category_collect") {
      turn = await assistant.handle(turn.state, { type: "skip_category" });
    }
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });

    const charges = turn.state.result!.charges;
    assert.equal(charges.totalDeductible, 180);
    assert.equal(charges.lignes.some((line) => line.categorie === "taxe_fonciere"), false);
    assert.equal(turn.state.collected.taxeFonciere, undefined);

    const oldDirect = computeChargesExercice({
      exerciceFiscal: EXERCISE,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: undefined,
      assurancePno: 180,
    });
    assert.equal(charges.totalDeductible, oldDirect.charges.totalDeductible);
    assert.equal(charges.totalPreExploitation, oldDirect.charges.totalPreExploitation);
  });

  it("J — ajout d'une charge : unknown → captured", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "unknown_category", reason: "later" });
    assert.equal(coverage(turn.state.collected, "impots")?.status, "unknown");

    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 900 });
    assert.equal(turn.state.collected.unknownFamilies, undefined);
    const persisted = toF012PersistedStateWithRegistry(turn.state, TS, EXERCISE);
    assert.equal(persisted.registry?.familyCoverage.find((item) => item.familyId === "impots")?.status, "captured");
    assert.equal(persisted.registry?.charges[0]?.amount, 900);
  });

  it("L — skip Cycle 5 : toujours unknown, toujours sans Charge", () => {
    const collected = { ...emptyCollected(), skippedCategories: ["taxe_fonciere", "assurance_pno"] as F012CollectedData["skippedCategories"] };
    const registry = registryOf(collected);
    assert.equal(registry.charges.length, 0);
    assert.equal(coverage(collected, "impots")?.status, "unknown");
    assert.equal(coverage(collected, "assurances")?.status, "unknown");
  });

  it("M — F-006 contrat inchangé (unknown n'entre pas dans ChargesFiscalInput)", () => {
    const viaUnknown = computeChargesExercice({
      exerciceFiscal: EXERCISE,
      dateMiseEnService: "2023-01-01",
      assurancePno: 180,
    });
    const aggregated = aggregateFiscalInputs({
      exerciceFiscal: EXERCISE,
      activite: { dateMiseEnService: "2023-01-01" },
      revenusAssistant: { exerciceFiscal: EXERCISE, totalRecettes: 9000 },
      chargesAssistant: {
        exerciceFiscal: EXERCISE,
        totalDeductible: viaUnknown.charges.totalDeductible,
        totalPreExploitation: viaUnknown.charges.totalPreExploitation,
        parCategorie: viaUnknown.charges.parCategorie,
      },
      financementCharges: {
        exerciceFiscal: EXERCISE,
        totalChargesFinancementExercice: 0,
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: { exerciceFiscal: EXERCISE, totalDotations: 0, status: "validated" },
    });
    assert.equal(aggregated.data?.chargesExploitation, 180);
    assert.equal(viaUnknown.charges.parCategorie.taxe_fonciere, undefined);
  });

  it("N — F-011 overlap inchangé (pas une Charge F-012 importée)", () => {
    const collected: F012CollectedData = {
      ...emptyCollected(),
      divers: [
        {
          id: "divers-ass",
          description: "Assurance emprunteur",
          montant: 300,
          financementOverlap: "assurance_emprunteur",
        },
      ],
    };
    const marked = markFamilyUnknown(collected, "impots", "document_missing");
    const registry = registryOf(marked);
    assert.equal(registry.charges.length, 1);
    assert.equal(registry.charges[0]?.exclusionReason, "f011_overlap");
    assert.equal(coverage(marked, "impots")?.status, "unknown");
    const computed = computeChargesExercice({
      exerciceFiscal: EXERCISE,
      dateMiseEnService: "2023-01-01",
      divers: marked.divers,
    });
    assert.equal(computed.charges.totalDeductible, 0);
  });

  it("none_category n'écrit pas 0 et n'est pas un skip", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "none_category" });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.deepEqual(turn.state.collected.noneFamilies, ["impots"]);
    assert.deepEqual(turn.state.collected.skippedCategories, []);
    assert.equal(coverage(turn.state.collected, "impots")?.status, "none");
  });

  it("document_missing sur taxe / copro / assurance / agence / travaux", () => {
    const families = ["impots", "syndic", "assurances", "gestion", "travaux"] as const;
    let collected = emptyCollected();
    for (const familyId of families) {
      collected = markFamilyUnknown(collected, familyId, "document_missing");
    }
    const registry = registryOf(collected, PROFIL_FULL);
    for (const familyId of families) {
      const item = registry.familyCoverage.find((coverageItem) => coverageItem.familyId === familyId);
      assert.equal(item?.status, "unknown", familyId);
      assert.equal(item?.unknownReason, "document_missing", familyId);
    }
    assert.equal(registry.charges.length, 0);
  });
});
