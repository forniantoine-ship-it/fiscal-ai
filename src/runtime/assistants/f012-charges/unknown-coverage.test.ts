import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { test } from "node:test";

import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { isolatePreExploitationCharge } from "../../capabilities/f012/isolate-pre-exploitation-charge";
import { adaptF012ToArticle39cContributions } from "@/lib/lmnp/services/article-39c/from-f012";
import { bienScopeFor, withActivePropertyId } from "@/lib/lmnp/dossier/bien-scope";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { createDefaultWorkspace } from "@/lib/lmnp/store/persistence";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { F012ChargesAssistant } from "./assistant";
import { toF012PersistedStateWithRegistry } from "./collected-to-registry";

const YEAR = 2025;
const START = "2025-02-20";
const NOW = "2026-10-05T20:00:00.000Z";

async function accounting(dateMiseEnService = START, amount = 1000) {
  const assistant = new F012ChargesAssistant({ dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" }, { dateMiseEnService });
  let turn = await assistant.handle(assistant.start().state, {
    type: "submit_profilage", copropriete: false, agence: false, travaux: false, vacance: false, comptable: true,
  });
  while (turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0] !== "gestion") {
    assert.equal(turn.state.step, "category_collect");
    turn = await assistant.handle(turn.state, { type: "none_family" });
  }
  turn = await assistant.handle(turn.state, { type: "open_family_manual" });
  turn = await assistant.handle(turn.state, { type: "submit_family_gestion", honorairesComptable: amount, paidAt: "2025-12-15" });
  while (turn.state.step === "category_collect") turn = await assistant.handle(turn.state, { type: "none_family" });
  turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
  assert.ok(turn.state.result);
  return { assistant, turn, persisted: toF012PersistedStateWithRegistry(turn.state, NOW, YEAR) };
}

test("B1: structured accounting paid in 2025, unknown coverage → 1000 ACTIVITY, no invented pre-exploitation", async () => {
  const { assistant, turn, persisted } = await accounting();
  assert.equal(persisted.registry?.charges[0]?.category, "honoraires_comptable", "structured slot survives the registry");
  const charges = turn.state.result!.charges;
  assert.deepEqual([charges.totalDeductible, charges.totalPreExploitation], [1000, 0]);
  const adapted = adaptF012ToArticle39cContributions({ owner: { level: "PROPERTY", propertyId: "A" }, fiscalYear: YEAR, lignes: charges.lignes });
  assert.deepEqual(adapted.contributions.map(c => [c.class, c.amountCents]), [["ACTIVITY", 100000]]);
  assert.equal(adapted.contributions.filter(c => c.class === "B").length, 0);
  const resumed = assistant.resume(JSON.parse(JSON.stringify(persisted)));
  assert.deepEqual(resumed.state.result?.charges, charges);
});

test("B1: unknown divers stays NEEDS_QUALIFICATION, even with accounting words", () => {
  for (const description of ["1000", "Frais de comptabilité"]) {
    const { charges } = computeChargesExercice({ exerciceFiscal: YEAR, dateMiseEnService: START, divers: [{ id: "unknown", description, montant: 1000 }] });
    assert.deepEqual([charges.totalDeductible, charges.totalPreExploitation], [1000, 0]);
    const adapted = adaptF012ToArticle39cContributions({ owner: { level: "PROPERTY", propertyId: "A" }, fiscalYear: YEAR, lignes: charges.lignes });
    assert.deepEqual(adapted.contributions.map(c => c.class), ["NEEDS_QUALIFICATION"]);
  }
});

test("B1: no unknown-period scalar charge borrows the property's start date", () => {
  for (const key of ["assurancePno", "assuranceGli", "honorairesGestion", "fraisEtatDesLieux", "fraisBancaires"] as const) {
    const { charges } = computeChargesExercice({ exerciceFiscal: YEAR, dateMiseEnService: START, [key]: 1000 });
    assert.deepEqual([charges.totalDeductible, charges.totalPreExploitation], [1000, 0], key);
  }
});

test("B1: established annual period retains its dedicated tax-foncière treatment (TRF-0018)", () => {
  // No approved accounting-period splitter exists. Keep the existing annual-tax rule
  // and its explicit monthly/day helper; do not invent a new coverage capability.
  const { charges } = computeChargesExercice({ exerciceFiscal: YEAR, dateMiseEnService: START, taxeFonciere: 1200 });
  assert.deepEqual([charges.totalDeductible, charges.totalPreExploitation], [1100, 100]);
  assert.deepEqual(isolatePreExploitationCharge({ montant: 1200, exerciceFiscal: YEAR, dateMiseEnService: START, methodeProrata: "mois" }), {
    montantDeductible: 1100, montantPreExploitation: 100, ratioDeductible: 0.92,
  });
  const daily = isolatePreExploitationCharge({ montant: 1200, exerciceFiscal: YEAR, dateMiseEnService: START, methodeProrata: "jours" });
  assert.equal(daily.montantPreExploitation, 164.4);
  assert.equal(daily.montantDeductible + daily.montantPreExploitation, 1200);
});

test("B1: copropriété and supported repairs retain full deductibility", () => {
  const { charges } = computeChargesExercice({ exerciceFiscal: YEAR, dateMiseEnService: START,
    coproLignes: [{ type: "provisions", montant: 700 }],
    travaux: [{ id: "repair", description: "Réparation", montant: 300, natureIntervention: "entretien" }],
  });
  assert.deepEqual([charges.totalDeductible, charges.totalPreExploitation], [1000, 0]);
  const adapted = adaptF012ToArticle39cContributions({ owner: { level: "PROPERTY", propertyId: "A" }, fiscalYear: YEAR, lignes: charges.lignes });
  assert.equal(adapted.contributions.reduce((sum, c) => sum + (c.class === "B" ? c.amountCents : 0), 0), 100000);
});

test("B1: multi A/B keeps each start date and structured charge through scoped writes and reload", async () => {
  const initial = createDefaultWorkspace(new Date(NOW));
  initial.fiscalYear.year = YEAR;
  initial.properties[0].id = "A";
  initial.fiscalYear.propertyIds = ["A"];
  let ws = lmnpReducer({ ...initial, fileRegistry: new Map() } as LmnpState, { type: "ADD_PROPERTY", property: { ...initial.properties[0], id: "B", label: "B" } });
  for (const [id, date, amount] of [["A", START, 1000], ["B", "2025-09-01", 2000]] as const) {
    const beforeOther = structuredClone(ws.declarationDraft!.biens![id === "A" ? "B" : "A"]);
    const { persisted, turn } = await accounting(date, amount);
    assert.deepEqual([turn.state.result!.charges.totalDeductible, turn.state.result!.charges.totalPreExploitation], [amount, 0]);
    ws = lmnpReducer(ws, withActivePropertyId({ type: "DECLARATION_PATCH_DRAFT", patch: { dateMiseEnService: date, chargesAssistantState: persisted } }, id));
    assert.deepEqual(ws.declarationDraft!.biens![id === "A" ? "B" : "A"], beforeOther);
  }
  const snapshot = serializeWorkspaceSnapshot(ws);
  assert.ok(snapshot.ok);
  const restored = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(snapshot.envelope)));
  assert.ok(restored.ok);
  for (const [id, date, amount] of [["A", START, 1000], ["B", "2025-09-01", 2000]] as const) {
    const scope = bienScopeFor(restored.envelope.workspace, id);
    assert.equal(scope.status, "ready");
    if (scope.status !== "ready") continue;
    assert.equal(scope.draft.dateMiseEnService, date);
    assert.equal(scope.draft.chargesAssistantState?.registry?.charges[0]?.amount, amount);
  }
});
