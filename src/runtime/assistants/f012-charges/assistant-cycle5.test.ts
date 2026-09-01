import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";
import type { ChargesFiscalInput } from "../../capabilities/f006/types";
import {
  computeChargesExercice,
  buildCategoryInventory,
  type ComputeChargesExerciceOutput,
} from "../../capabilities/f012/compute-charges-exercice";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry, toF012PersistedStateWithRegistry } from "./collected-to-registry";
import { chargeRegistryToComputeInput } from "./registry-to-compute-input";
import { snapshotF012State, toF012PersistedState, type F012CollectedData, type F012Deps } from "./types";
import type { FieldSource } from "../../contracts/FieldSource";
import type { F012CategoryId, ProfilCharges } from "../../capabilities/f012/types";

const EXERCISE = 2024;
const MES = "2023-01-01";
const MES_MID = "2024-08-01";
const TS = "2024-03-01T10:00:00.000Z";
const ctx = { dossierId: "test", fiscalYear: EXERCISE, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: MES };

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

/** OLD FLOW — mapping historique assistant.compute() avant Cycle 5. */
function computeFromCollectedDirect(
  collected: F012CollectedData,
  fieldSources: Partial<Record<string, FieldSource>>,
  dateMiseEnService = MES,
): ComputeChargesExerciceOutput {
  const travaux = collected.travaux.flatMap((t) => {
    if (!t.natureIntervention) return [];
    return [
      {
        id: t.id,
        description: t.description,
        montant: t.montant,
        natureIntervention: t.natureIntervention,
        montantReparation: t.montantReparation,
        source: fieldSources[`travaux-${t.id}`],
      },
    ];
  });
  return computeChargesExercice({
    exerciceFiscal: EXERCISE,
    dateMiseEnService,
    taxeFonciere: collected.taxeFonciere,
    assurancePno: collected.assurancePno,
    assuranceGli: collected.assuranceGli,
    coproLignes: collected.coproLignes,
    honorairesGestion: collected.honorairesGestion,
    fraisEtatDesLieux: collected.fraisEtatDesLieux,
    honorairesComptable: collected.honorairesComptable,
    fraisBancaires: collected.fraisBancaires,
    divers: collected.divers,
    travaux,
    fieldSources,
  });
}

/** NEW FLOW — collected → registry → adaptateur → même moteur. */
function computeFromCollectedViaRegistry(
  collected: F012CollectedData,
  fieldSources: Partial<Record<string, FieldSource>> = {},
  profil: ProfilCharges = PROFIL_SIMPLE,
  dateMiseEnService = MES,
): ComputeChargesExerciceOutput {
  const registry = collectedToChargeRegistry({
    collected,
    profil,
    categoryInventory: buildCategoryInventory(profil) as F012CategoryId[],
    fieldSources,
    exercise: EXERCISE,
  });
  return computeChargesExercice(
    chargeRegistryToComputeInput(registry, { dateMiseEnService, fieldSources }),
  );
}

function fiscalSlice(output: ComputeChargesExerciceOutput) {
  return {
    totalDeductible: output.charges.totalDeductible,
    totalPreExploitation: output.charges.totalPreExploitation,
    totalNonDeductible: output.charges.totalNonDeductible,
    totalAmortissable: output.charges.totalAmortissable,
    parCategorie: output.charges.parCategorie,
    composantsNouveaux: output.charges.composantsNouveaux,
    lignes: output.charges.lignes,
    anomalies: output.anomalies,
  };
}

function assertFiscalEquivalent(
  collected: F012CollectedData,
  opts: {
    fieldSources?: Partial<Record<string, FieldSource>>;
    profil?: ProfilCharges;
    dateMiseEnService?: string;
  } = {},
) {
  const fieldSources = opts.fieldSources ?? {};
  const profil = opts.profil ?? PROFIL_SIMPLE;
  const dateMiseEnService = opts.dateMiseEnService ?? MES;
  const oldResult = computeFromCollectedDirect(collected, fieldSources, dateMiseEnService);
  const newResult = computeFromCollectedViaRegistry(collected, fieldSources, profil, dateMiseEnService);
  assert.deepEqual(fiscalSlice(newResult), fiscalSlice(oldResult), "OLD RESULT === NEW RESULT");
  return { oldResult, newResult };
}

function toChargesFiscalInput(output: ComputeChargesExerciceOutput): ChargesFiscalInput {
  return {
    exerciceFiscal: output.charges.exerciceFiscal,
    totalDeductible: output.charges.totalDeductible,
    totalPreExploitation: output.charges.totalPreExploitation,
    parCategorie: output.charges.parCategorie,
  };
}

describe("F-012 Cycle 5 — équivalence fiscale collected → registry → compute", () => {
  it("A — aucune charge", () => {
    assertFiscalEquivalent(emptyCollected());
  });

  it("B — taxe foncière nominale", () => {
    assertFiscalEquivalent({ ...emptyCollected(), taxeFonciere: 1200 });
  });

  it("C — taxe foncière pré-exploitation", () => {
    const { oldResult, newResult } = assertFiscalEquivalent(
      { ...emptyCollected(), taxeFonciere: 1200 },
      { dateMiseEnService: MES_MID },
    );
    assert.ok(oldResult.charges.totalPreExploitation > 0);
    assert.equal(newResult.charges.totalPreExploitation, oldResult.charges.totalPreExploitation);
  });

  it("D — assurance PNO", () => {
    assertFiscalEquivalent({ ...emptyCollected(), assurancePno: 180 });
  });

  it("E — copro plusieurs lignes", () => {
    assertFiscalEquivalent(
      {
        ...emptyCollected(),
        coproLignes: [
          { type: "provisions", montant: 600 },
          { type: "regularisation", montant: -80 },
          { type: "fonds_travaux", montant: 200, description: "ALUR" },
        ],
      },
      { profil: { ...PROFIL_SIMPLE, copropriete: true } },
    );
  });

  it("F — travaux réparation", () => {
    assertFiscalEquivalent(
      {
        ...emptyCollected(),
        travaux: [
          {
            id: "travaux-1",
            description: "Peinture",
            montant: 800,
            choix: "reparation_identique",
            natureIntervention: "entretien",
          },
        ],
      },
      { profil: { ...PROFIL_SIMPLE, travaux: true } },
    );
  });

  it("G — travaux amélioration", () => {
    assertFiscalEquivalent(
      {
        ...emptyCollected(),
        travaux: [
          {
            id: "travaux-1",
            description: "Cuisine",
            montant: 5000,
            choix: "amelioration",
            natureIntervention: "amélioration",
          },
        ],
      },
      { profil: { ...PROFIL_SIMPLE, travaux: true } },
    );
  });

  it("H — travaux mixte", () => {
    assertFiscalEquivalent(
      {
        ...emptyCollected(),
        travaux: [
          {
            id: "travaux-1",
            description: "Salle de bain",
            montant: 4000,
            choix: "mixte",
            natureIntervention: "entretien",
            montantReparation: 1500,
          },
        ],
      },
      { profil: { ...PROFIL_SIMPLE, travaux: true } },
    );
  });

  it("I — divers", () => {
    assertFiscalEquivalent({
      ...emptyCollected(),
      divers: [{ id: "divers-1", description: "Clef", montant: 25 }],
    });
  });

  it("J — divers montant 0", () => {
    const { oldResult } = assertFiscalEquivalent({
      ...emptyCollected(),
      divers: [{ id: "divers-0", description: "Remboursé", montant: 0 }],
    });
    assert.equal(oldResult.charges.lignes.some((l) => l.id === "divers-0"), true);
  });

  it("K — skipped category : pas de Charge, résultat identique (0)", () => {
    const { oldResult, newResult } = assertFiscalEquivalent({
      ...emptyCollected(),
      skippedCategories: ["taxe_fonciere", "assurance_pno"],
    });
    assert.equal(oldResult.charges.totalDeductible, 0);
    assert.equal(newResult.charges.totalDeductible, 0);
    const registry = collectedToChargeRegistry({
      collected: { ...emptyCollected(), skippedCategories: ["taxe_fonciere"] },
      profil: PROFIL_SIMPLE,
      categoryInventory: buildCategoryInventory(PROFIL_SIMPLE) as F012CategoryId[],
      fieldSources: {},
      exercise: EXERCISE,
    });
    assert.equal(registry.charges.length, 0);
  });

  it("L — plusieurs divers", () => {
    assertFiscalEquivalent({
      ...emptyCollected(),
      divers: [
        { id: "divers-1", description: "Clef", montant: 15 },
        { id: "divers-2", description: "Cadenas", montant: 8 },
      ],
    });
  });

  it("M — multi-catégories", () => {
    assertFiscalEquivalent(
      {
        taxeFonciere: 1200,
        assurancePno: 180,
        honorairesGestion: 400,
        fraisEtatDesLieux: 90,
        honorairesComptable: 250,
        fraisBancaires: 30,
        coproLignes: [{ type: "provisions", montant: 500 }],
        travaux: [
          {
            id: "travaux-1",
            description: "Peinture",
            montant: 600,
            natureIntervention: "entretien",
          },
        ],
        divers: [{ id: "divers-1", description: "Clef", montant: 12 }],
        skippedCategories: [],
      },
      { profil: PROFIL_FULL },
    );
  });

  it("N — F-011 overlap : visible, jamais recomptée", () => {
    const { oldResult } = assertFiscalEquivalent({
      ...emptyCollected(),
      taxeFonciere: 1200,
      divers: [
        {
          id: "divers-ass",
          description: "Assurance emprunteur",
          montant: 300,
          financementOverlap: "assurance_emprunteur",
        },
      ],
    });
    assert.equal(oldResult.charges.totalDeductible, 1200);
    assert.ok(oldResult.charges.lignes.some((l) => l.id === "divers-ass" && l.deductibilite === "non_deductible"));
  });

  it("travaux incertain (sans nature) : omis des deux côtés", () => {
    assertFiscalEquivalent(
      {
        ...emptyCollected(),
        travaux: [{ id: "travaux-1", description: "Incertain", montant: 2000, choix: "incertain" }],
      },
      { profil: { ...PROFIL_SIMPLE, travaux: true } },
    );
  });
});

describe("F-012 Cycle 5 — F-006 contrat inchangé", () => {
  it("ChargesFiscalInput identique OLD vs NEW (totalDeductible, totalPreExploitation, parCategorie)", () => {
    const collected: F012CollectedData = {
      ...emptyCollected(),
      taxeFonciere: 1200,
      assurancePno: 180,
      divers: [{ id: "divers-1", description: "Clef", montant: 20 }],
    };
    const { oldResult, newResult } = assertFiscalEquivalent(collected, { dateMiseEnService: MES_MID });
    const oldInput = toChargesFiscalInput(oldResult);
    const newInput = toChargesFiscalInput(newResult);
    assert.deepEqual(newInput, oldInput);

    const base = {
      exerciceFiscal: EXERCISE,
      activite: { dateMiseEnService: MES_MID },
      revenusAssistant: { exerciceFiscal: EXERCISE, totalRecettes: 9000 },
      financementCharges: {
        exerciceFiscal: EXERCISE,
        totalChargesFinancementExercice: 0,
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: { exerciceFiscal: EXERCISE, totalDotations: 0, status: "validated" as const },
    };
    const oldAgg = aggregateFiscalInputs({ ...base, chargesAssistant: oldInput });
    const newAgg = aggregateFiscalInputs({ ...base, chargesAssistant: newInput });
    assert.deepEqual(newAgg.data, oldAgg.data);
  });
});

describe("F-012 Cycle 5 — persistence, reprise, GO_BACK", () => {
  it("O — legacy completed : blob sans registry, reprise inchangée", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    const persisted = toF012PersistedState(turn.state, TS);
    assert.equal(persisted.registry, undefined);
    assert.equal("result" in persisted, false);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, turn.state.step);
    assert.equal(resumed.state.collected.taxeFonciere, 1200);
  });

  it("R — persist → reload → registry identique → résultat identique", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_FULL });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 180 });
    turn = await assistant.handle(turn.state, {
      type: "submit_copro",
      lignes: [
        { type: "provisions", montant: 400 },
        { type: "regularisation", montant: -40 },
      ],
    });
    const persisted = toF012PersistedStateWithRegistry(turn.state, TS, EXERCISE);
    assert.ok(persisted.registry);
    assert.equal("result" in persisted, false);
    assert.equal("totalDeductible" in (persisted.registry ?? {}), false);

    const reloaded = JSON.parse(JSON.stringify(persisted)) as typeof persisted;
    const rebuilt = collectedToChargeRegistry({
      collected: reloaded.collected,
      profil: reloaded.profil,
      categoryInventory: reloaded.categoryInventory,
      fieldSources: reloaded.fieldSources,
      exercise: EXERCISE,
    });
    assert.deepEqual(rebuilt, reloaded.registry);

    const resumed = assistant.resume(reloaded);
    const afterReload = computeFromCollectedViaRegistry(
      resumed.state.collected,
      resumed.state.fieldSources,
      resumed.state.profil ?? PROFIL_FULL,
    );
    const beforeReload = computeFromCollectedViaRegistry(
      turn.state.collected,
      turn.state.fieldSources,
      turn.state.profil ?? PROFIL_FULL,
    );
    assert.deepEqual(fiscalSlice(afterReload), fiscalSlice(beforeReload));
  });

  it("S — GO_BACK : snapshots sans registry (volume inchangé)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    const snap = snapshotF012State(turn.state);
    assert.equal("registry" in snap, false);
    assert.equal("charges" in snap, false);
    assert.equal("familyCoverage" in snap, false);
    assert.equal("result" in snap, false);

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.collected.taxeFonciere, undefined);
    assert.equal(back.state.currentCategoryIndex, 0);
    const historySnap = turn.state.history?.[0];
    assert.ok(historySnap);
    assert.equal("registry" in (historySnap ?? {}), false);
  });

  it("V — result / LigneCharge / totaux jamais persistés comme vérité", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    while (turn.state.step === "category_collect") {
      turn = await assistant.handle(turn.state, { type: "skip_category" });
    }
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.ok(turn.state.result);

    const persisted = toF012PersistedStateWithRegistry(turn.state, TS, EXERCISE);
    const json = JSON.stringify(persisted);
    assert.equal("result" in persisted, false);
    assert.match(json, /"charges":\[/);
    assert.doesNotMatch(json, /"totalDeductible"/);
    assert.doesNotMatch(json, /"totalPreExploitation"/);
    assert.doesNotMatch(json, /"lignes":/);
    assert.ok(persisted.registry?.charges.every((c) => !("totalDeductible" in c)));
  });

  it("T runtime — mêmes données → mêmes IDs après handle", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 900 });
    const a = collectedToChargeRegistry({
      collected: turn.state.collected,
      profil: turn.state.profil,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: EXERCISE,
    });
    const b = collectedToChargeRegistry({
      collected: turn.state.collected,
      profil: turn.state.profil,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: EXERCISE,
    });
    assert.deepEqual(a.charges.map((c) => c.id), b.charges.map((c) => c.id));
    assert.deepEqual(a.charges.map((c) => c.id), ["taxe-fonciere:2024"]);
  });
});
