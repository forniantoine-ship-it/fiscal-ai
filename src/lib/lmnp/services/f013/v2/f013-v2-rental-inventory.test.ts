/**
 * F013 v2.4 — inventaire locatif commun F013 / bilan : INVENTORY-01 → INVENTORY-15.
 * Run: npx tsx --test src/lib/lmnp/services/f013/v2/f013-v2-rental-inventory.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { representativeMonoWorkspaces } from "@/lab/v2-dossier/bien-read-test-support";
import { canCloseFiscalYear } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { processRawFinancialLines } from "@/lib/lmnp/services/revenue-transaction-pipeline";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { RevenueRawLine } from "@/lib/lmnp/types";
import { assemblePatrimoine } from "@/runtime/capabilities/bilan/assemble-patrimoine";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import { map2033AFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033a";

import { acceptProposedFact, applyDocumentaryProposals, proposeFactsFromObservations } from "./f013-v2-documentary-bridge";
import { answerBalance, answerCollections, answerCoverage, answerExceptions } from "./f013-v2-manual-flow";
import { observationFromRevenueTransaction } from "./f013-v2-observation";
import { mergeRentInventoryIntoBilan, projectRentalInventoryToBilan, readRentalInventory } from "./f013-v2-rental-inventory";
import {
  confirmRentReconciliation,
  createRentReconciliationState,
  evaluateRentReconciliation,
  parseRentReconciliationState,
  type RentReconciliationV2State,
} from "./f013-v2-state";
import { isF013V2ContinuityBlocked } from "./f013-v2-transition-guard";

const Y = 2025;
const NOW = "2026-03-01T10:00:00.000Z";
const eur = (n: number) => Math.round(n * 100);
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true);
  return r as Extract<T, { ok: true }>;
};
type Bal = Partial<Record<"openingReceivables" | "closingReceivables" | "openingAdvances" | "closingAdvances", number>>;

function facts(propertyId: string, e: number, o: Bal = {}, year = Y): RentReconciliationV2State {
  const scope = { propertyId, fiscalYear: year };
  let s = createRentReconciliationState(scope);
  s = ok(answerCollections(s, eur(e))).state;
  s = answerCoverage(s, "all");
  for (const k of ["openingReceivables", "closingReceivables", "openingAdvances", "closingAdvances"] as const) {
    const a = o[k];
    s = ok(answerBalance(s, k, a ? { answer: "some", amountCents: eur(a) } : { answer: "none" })).state;
  }
  return ok(answerExceptions(s, { answer: "none" })).state;
}
const acquired = (s: RentReconciliationV2State) => {
  const r = evaluateRentReconciliation(s, { propertyId: s.facts.propertyId, fiscalYear: s.facts.fiscalYear }).result;
  return r.status === "SUPPORTED" ? r.loyersAcquisCents : null;
};

// --- Bilan réel (assemblePatrimoine → 2033-A) -------------------------------------------------------------------
const FISCAL_RESULT: FiscalResult = {
  exercice: Y, recettes: { total: 12000 },
  charges: { totalDeductible: 4000, chargesExploitation: 4000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
  resultatAvantAmort: 7000, amortCalcule: 1500, amortDeduct: 1500, amortReporte: 0, amortNonDeduitExercice: 0, amortReportesUtilises: 0,
  resultatFiscal: 5500, deficitNouveau: 0, deficitsImputes: 0, perteExceptionnelle: 0,
  stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
  trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
  status: "computed", anomalies: [],
};
const RFS: FiscalRepresentation = {
  exercice: Y,
  identite: { siren: "104545108", siret: "10454510800011", denomination: "Inventaire" },
  fiscalResult: FISCAL_RESULT,
  immobilisations: { lignes: [{ label: "Composant", montant: 45000, dureeAnnees: 30, dotationExercice: 1500, amortissementsCumules: 1500, vnc: 43500 }], totalAnnuelExercice: 1500, totalBrut: 45000, valeurTerrain: 15000 },
  emprunts: [],
  trace: { ksArtifacts: ["TRF-0032"], assembledAt: "2026-08-31T00:00:00.000Z", sourceFiscalResultAt: FISCAL_RESULT.trace.computedAt, sources: { identite: "x", fiscalResult: "y" } },
} as FiscalRepresentation;
const BILAN: BilanInputs = {
  tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
  compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
  ran: { situation: "NATIF" },
  tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
  subventionsInvestissement: { status: "NUL_CONFIRME" },
};
const bilanCases = (inputs: BilanInputs) => {
  const patrimoine = assemblePatrimoine(RFS, inputs);
  const form = map2033AFromRfs({ ...RFS, patrimoine });
  return { cases: patrimoine.ventilationTiers.cases, conflits: patrimoine.ventilationTiers.conflits, c068: form.cases.find((c) => c.caseId === "068")?.value, c174: form.cases.find((c) => c.caseId === "174")?.value };
};
const project = (states: RentReconciliationV2State[], propertyIds = states.map((s) => s.facts.propertyId), year = Y) =>
  projectRentalInventoryToBilan({ fiscalYear: year, propertyIds, states });
const bilanFor = (states: RentReconciliationV2State[], base: BilanInputs = BILAN, propertyIds?: string[]) =>
  mergeRentInventoryIntoBilan(base, project(states, propertyIds));

describe("INVENTORY-01 → 04 : F013 et bilan lisent le même fait", () => {
  it("INVENTORY-01 créance de clôture : F013 = 12 000 €, bilan LOYER_DU_PAR_LOCATAIRE = 1 000 € (case 068)", () => {
    const s = facts("A", 11000, { closingReceivables: 1000 });
    assert.equal(acquired(s), eur(12000));
    const { bilan } = bilanFor([s]);
    const out = bilanCases(bilan);
    assert.equal(out.cases.clients.status, "DECLARE");
    assert.equal(out.cases.clients.status === "DECLARE" && out.cases.clients.montant, 1000);
    assert.equal(out.c068, 1000, "2033-A case 068 par le chemin existant (bilan → RFS)");
    assert.equal(out.cases.produitsConstatesAvance.status, "NUL_CONFIRME", "AC validée à 0 : zéro confirmé par l'utilisateur, aucune avance fabriquée");
  });
  it("INVENTORY-02 avance de clôture : F013 = 12 000 €, bilan LOYER_ENCAISSE_D_AVANCE = 1 000 € (case 174)", () => {
    const s = facts("A", 13000, { closingAdvances: 1000 });
    assert.equal(acquired(s), eur(12000));
    const out = bilanCases(bilanFor([s]).bilan);
    assert.equal(out.cases.produitsConstatesAvance.status === "DECLARE" && out.cases.produitsConstatesAvance.montant, 1000);
    assert.equal(out.c174, 1000);
    assert.equal(out.cases.clients.status, "NUL_CONFIRME", "créance de clôture validée à 0 : zéro confirmé, pas inventé");
  });
  it("INVENTORY-03 créance d'ouverture : F013 = 12 000 €, aucun actif de clôture", () => {
    const s = facts("A", 13000, { openingReceivables: 1000 });
    assert.equal(acquired(s), eur(12000));
    const view = readRentalInventory(s);
    assert.equal(view.facts.openingReceivables.amountCents, eur(1000));
    assert.equal(view.facts.openingReceivables.side, "opening");
    assert.equal(view.facts.closingReceivables.amountCents, 0);
    const p = project([s]);
    assert.equal(p.postes.length, 0);
    assert.deepEqual(p.naturesConfirmeesVides, ["LOYER_DU_PAR_LOCATAIRE", "LOYER_ENCAISSE_D_AVANCE"]);
    assert.equal(bilanCases(bilanFor([s]).bilan).cases.clients.status, "NUL_CONFIRME");
  });
  it("INVENTORY-04 avance d'ouverture : F013 = 12 000 €, aucun passif de clôture", () => {
    const s = facts("A", 11000, { openingAdvances: 1000 });
    assert.equal(acquired(s), eur(12000));
    const p = project([s]);
    assert.equal(p.postes.length, 0);
    assert.equal(bilanCases(bilanFor([s]).bilan).cases.produitsConstatesAvance.status, "NUL_CONFIRME");
  });
});

describe("INVENTORY-05, 06 : UNKNOWN ≠ ZERO, PROPOSED ≠ VALIDATED", () => {
  it("INVENTORY-05 CC et AC inconnues : F013 bloqué, bilan INCONNU (jamais 0)", () => {
    let s = createRentReconciliationState({ propertyId: "A", fiscalYear: Y });
    s = ok(answerCollections(s, eur(12000))).state;
    s = answerCoverage(s, "all");
    for (const k of ["openingReceivables", "openingAdvances"] as const) s = ok(answerBalance(s, k, { answer: "none" })).state;
    s = ok(answerExceptions(s, { answer: "none" })).state;
    assert.equal(acquired(s), null);
    const p = project([s]);
    assert.deepEqual(p.providedNatures, []);
    assert.deepEqual(p.unknown.map((u) => u.nature).sort(), ["LOYER_DU_PAR_LOCATAIRE", "LOYER_ENCAISSE_D_AVANCE"]);
    const merged = mergeRentInventoryIntoBilan(BILAN, p);
    assert.equal(merged.bilan, BILAN, "bilan strictement inchangé sans inventaire définitif");
    const out = bilanCases(merged.bilan);
    assert.equal(out.cases.clients.status, "INCONNU");
    assert.equal(out.cases.produitsConstatesAvance.status, "INCONNU");
  });
  it("INVENTORY-06 PROPOSED : conservé, jamais ventilé ni confirmé ; reload inchangé", async () => {
    const lines: RevenueRawLine[] = [{ label: "Loyer décembre 2025", amount: 1000, date: "05/01/2026", direction: "credit", sourceDocumentId: "doc1", sourceType: "bank_statement", confidence: 90 }];
    const tx = processRawFinancialLines(lines, Y)[0]!;
    const obs = ok(observationFromRevenueTransaction(tx, { fiscalYear: Y, attribution: { kind: "property", propertyId: "A" } })).observation;
    const { state } = applyDocumentaryProposals(createRentReconciliationState({ propertyId: "A", fiscalYear: Y }), proposeFactsFromObservations({ scope: { propertyId: "A", fiscalYear: Y }, observations: [obs] }), [obs]);
    const view = readRentalInventory(state);
    assert.equal(view.facts.closingReceivables.status, "PROPOSED");
    const p = project([state]);
    assert.deepEqual(p.proposed, [{ propertyId: "A", nature: "LOYER_DU_PAR_LOCATAIRE", amountCents: 100000 }]);
    assert.deepEqual(p.providedNatures, []);
    assert.equal(bilanCases(mergeRentInventoryIntoBilan(BILAN, p).bilan).cases.clients.status, "INCONNU");
    const mono = (await representativeMonoWorkspaces()).f013;
    const next = lmnpReducer(mono, { type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: state } });
    const env = ok(serializeWorkspaceSnapshot(next)).envelope;
    const back = parseRentReconciliationState(ok(parseWorkspaceSnapshot(JSON.parse(JSON.stringify(env)))).envelope.workspace.declarationDraft.rentReconciliationV2)!;
    assert.equal(readRentalInventory(back).facts.closingReceivables.status, "PROPOSED");
  });
});

describe("INVENTORY-07, 10 : correction et faits différents à total égal", () => {
  async function inMono(state: RentReconciliationV2State): Promise<LmnpState> {
    const mono = (await representativeMonoWorkspaces()).f013;
    const withOutputs = { ...mono, declarationDraft: { ...mono.declarationDraft!, fiscalResult: {} as never, rfs: {} as never, liasseResult: {} as never, liasseRfs: {} as never } } as LmnpState;
    return lmnpReducer(withOutputs, { type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: state } });
  }
  it("INVENTORY-07 CC 1 000 → 1 200 : une seule donnée, confirmation invalidée, bilan 1 200, sorties périmées", async () => {
    const mono = (await representativeMonoWorkspaces()).f013;
    const pid = mono.properties[0]!.id;
    const year = mono.fiscalYear.year;
    const s1 = ok(confirmRentReconciliation(facts(pid, 11000, { closingReceivables: 1000 }, year), { propertyId: pid, fiscalYear: year }, NOW)).state;
    let state = await inMono(s1);
    // Les sorties sont posées APRÈS l'écriture des faits (écrire des faits périme déjà les sorties existantes).
    state = { ...state, declarationDraft: { ...state.declarationDraft!, fiscalResult: {} as never, rfs: {} as never } };
    assert.ok(state.declarationDraft?.fiscalResult, "précondition : sorties présentes");
    const s2 = ok(answerBalance(s1, "closingReceivables", { answer: "some", amountCents: eur(1200) })).state;
    assert.equal(s2.confirmation, undefined);
    assert.ok(s2.facts.revision > s1.facts.revision);
    state = lmnpReducer({ ...state, declarationDraft: { ...state.declarationDraft!, fiscalResult: {} as never } }, { type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: s2 } });
    assert.equal(state.declarationDraft?.fiscalResult, undefined, "sorties dépendantes invalidées (mécanisme existant)");
    const stored = state.declarationDraft!.rentReconciliationV2!;
    assert.equal(evaluateRentReconciliation(stored, { propertyId: pid, fiscalYear: year }).confirmationFresh, false);
    const poste = project([stored], [pid], year).postes[0]!;
    assert.equal(poste.montant, 1200);
    assert.equal(JSON.stringify(project([stored], [pid], year)).includes('"montant":1000'), false, "aucun ancien 1 000 courant");
  });
  it("INVENTORY-10 même total, faits différents : confirmation invalidée, inventaire et downstream changent", async () => {
    const mono = (await representativeMonoWorkspaces()).f013;
    const pid = mono.properties[0]!.id;
    const year = mono.fiscalYear.year;
    const before = ok(confirmRentReconciliation(facts(pid, 12000, {}, year), { propertyId: pid, fiscalYear: year }, NOW)).state;
    const after = facts(pid, 11000, { closingReceivables: 1000 }, year);
    assert.equal(acquired(before), acquired(after));
    assert.equal(project([before], [pid], year).postes.length, 0);
    assert.equal(project([after], [pid], year).postes[0]!.montant, 1000);
    let state = await inMono(before);
    state = lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: after } });
    assert.equal(state.declarationDraft?.fiscalResult, undefined, "stale malgré un total F013 identique");
    assert.equal(after.confirmation, undefined);
    // Une confirmation seule ne périme rien en aval.
    const confirmed = ok(confirmRentReconciliation(after, { propertyId: pid, fiscalYear: year }, NOW)).state;
    const kept = lmnpReducer({ ...state, declarationDraft: { ...state.declarationDraft!, fiscalResult: {} as never } }, { type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: confirmed } });
    assert.ok(kept.declarationDraft?.fiscalResult, "la confirmation seule n'invalide pas les sorties");
  });
});
describe("INVENTORY-08, 09 : multi et persistance", () => {
  it("INVENTORY-08 multi : A (CC 1 000) et B (AC 700) isolés ; consolidation par nature", () => {
    const a = facts("A", 11000, { closingReceivables: 1000 });
    const b = facts("B", 7700, { closingAdvances: 700 });
    const p = project([a, b], ["A", "B"]);
    assert.deepEqual(p.byProperty.A, { receivableCents: 100000, advanceCents: 0, revision: a.facts.revision });
    assert.deepEqual(p.byProperty.B, { receivableCents: 0, advanceCents: 70000, revision: b.facts.revision });
    assert.deepEqual(p.postes.map((x) => [x.id, x.montant]), [
      [`rent-inventory:A:${Y}:closingReceivables`, 1000],
      [`rent-inventory:B:${Y}:closingAdvances`, 700],
    ]);
    const out = bilanCases(mergeRentInventoryIntoBilan(BILAN, p).bilan);
    assert.equal(out.c068, 1000);
    assert.equal(out.c174, 700);
    // Un bien manquant ou d'un autre exercice : rien de définitif (jamais une somme partielle).
    assert.deepEqual(project([a], ["A", "B"]).providedNatures, []);
    assert.deepEqual(projectRentalInventoryToBilan({ fiscalYear: Y, propertyIds: ["A"], states: [facts("A", 1, {}, 2024)] }).providedNatures, []);
    // Modifier B ne touche pas A.
    const b2 = ok(answerBalance(b, "closingAdvances", { answer: "some", amountCents: eur(900) })).state;
    assert.deepEqual(project([a, b2], ["A", "B"]).byProperty.A, p.byProperty.A);
  });
  it("INVENTORY-09 save → snapshot v3 → reload : montants, statuts, bien, exercice, provenance, références", async () => {
    let s = facts("home", 11000, { closingReceivables: 1000 });
    s = ok(answerBalance(s, "closingAdvances", { answer: "some", amountCents: eur(500) })).state;
    const proposed: RentReconciliationV2State = {
      ...s,
      facts: { ...s.facts, closingAdvances: { status: "PROPOSED", amountCents: eur(500), provenance: { kind: "extraction", ref: "documentary_observations" } }, links: { observationIds: ["obs_1", "obs_2"] } },
    };
    const mono = (await representativeMonoWorkspaces()).f013;
    const next = lmnpReducer(mono, { type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: proposed } });
    const env = ok(serializeWorkspaceSnapshot(next)).envelope;
    assert.equal(env.schemaVersion, 3);
    const back = parseRentReconciliationState(ok(parseWorkspaceSnapshot(JSON.parse(JSON.stringify(env)))).envelope.workspace.declarationDraft.rentReconciliationV2)!;
    assert.deepEqual(readRentalInventory(back), readRentalInventory(proposed));
    const v = readRentalInventory(back);
    assert.equal(v.facts.closingReceivables.status, "VALIDATED");
    assert.equal(v.facts.closingAdvances.status, "PROPOSED");
    assert.equal(v.facts.closingAdvances.provenance?.kind, "extraction");
    assert.deepEqual(v.facts.closingAdvances.observationIds, ["obs_1", "obs_2"]);
    assert.equal(v.propertyId, "home");
  });
});

describe("INVENTORY-11 → 15 : observation, source unique, double comptage, legacy, clôture", () => {
  it("INVENTORY-11 observation V2.3 → proposition du même inventaire → validation → F013 + bilan", () => {
    const lines: RevenueRawLine[] = [{ label: "Loyer décembre 2025", amount: 1000, date: "05/01/2026", direction: "credit", sourceDocumentId: "doc1", sourceType: "bank_statement", confidence: 90 }];
    const tx = processRawFinancialLines(lines, Y)[0]!;
    const obs = ok(observationFromRevenueTransaction(tx, { fiscalYear: Y, attribution: { kind: "property", propertyId: "A" } })).observation;
    let s = applyDocumentaryProposals(createRentReconciliationState({ propertyId: "A", fiscalYear: Y }), proposeFactsFromObservations({ scope: { propertyId: "A", fiscalYear: Y }, observations: [obs] }), [obs]).state;
    assert.deepEqual(readRentalInventory(s).facts.closingReceivables.observationIds, [obs.observationId]);
    s = ok(answerCollections(s, 0)).state;
    s = answerCoverage(s, "all");
    for (const k of ["openingReceivables", "openingAdvances", "closingAdvances"] as const) s = ok(answerBalance(s, k, { answer: "none" })).state;
    s = ok(answerExceptions(s, { answer: "none" })).state;
    s = acceptProposedFact(s, "closingReceivables");
    assert.equal(acquired(s), eur(1000));
    assert.equal(bilanCases(bilanFor([s]).bilan).c068, 1000);
    assert.equal(s.observations?.length, 1, "une seule représentation : l'observation reste une preuve");
  });
  it("INVENTORY-12 F013 et bilan lisent la même source : le moteur et la projection suivent le même fait", () => {
    const s = facts("A", 11000, { closingReceivables: 1000 });
    const engine = evaluateRentReconciliation(s, { propertyId: "A", fiscalYear: Y }).result;
    assert.equal(engine.status, "SUPPORTED");
    const engineCC = engine.status === "SUPPORTED" ? engine.inventory.closingReceivablesCents : -1;
    assert.equal(project([s]).postes[0]!.montant * 100, engineCC);
    const s2 = ok(answerBalance(s, "closingReceivables", { answer: "some", amountCents: eur(1500) })).state;
    const engine2 = evaluateRentReconciliation(s2, { propertyId: "A", fiscalYear: Y }).result;
    assert.equal(engine2.status === "SUPPORTED" && engine2.inventory.closingReceivablesCents, 150000);
    assert.equal(project([s2]).postes[0]!.montant, 1500);
    assert.deepEqual(project([s2]), project([structuredClone(s2)]), "projection pure et déterministe");
    const code = readFileSync("src/lib/lmnp/services/f013/v2/f013-v2-rental-inventory.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.doesNotMatch(code, /reconcileRentV2|evaluateRentReconciliation|loyersAcquis|applyFactsChange/, "ni formule, ni écriture : lecture seule");
  });
  it("INVENTORY-13 pas de double comptage : saisie bilan indépendante remplacée, ligne simple 174 détectée en conflit", () => {
    const s = facts("A", 11000, { closingReceivables: 1000 });
    const withOwn: BilanInputs = { ...BILAN, ventilationTiers: { postes: [{ id: "own", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 1000 }] } };
    const merged = mergeRentInventoryIntoBilan(withOwn, project([s]));
    assert.deepEqual(merged.superseded.map((x) => [x.nature, x.kind, x.montant]), [["LOYER_DU_PAR_LOCATAIRE", "poste", 1000]]);
    const out = bilanCases(merged.bilan);
    assert.equal(out.cases.clients.status === "DECLARE" && out.cases.clients.montant, 1000, "1 000 et non 2 000");
    assert.equal(bilanCases(withOwn).c068, 1000, "la saisie bilan seule n'est pas modifiée dans le stockage");
    const sAdv = facts("A", 13000, { closingAdvances: 1000 });
    // Ligne simple 174 indépendante : divergente → conflit (mécanisme existant) ; identique → une seule valeur, jamais une somme.
    // (`tiers.dettes: NUL_CONFIRME` contredirait toute avance déclarée : BUCKET_TIERS_ET_VENTILATION, règle bilan existante.)
    const lineOf = (montant: number): BilanInputs => ({ ...BILAN, tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "INCONNU" } }, lignesSimples: { produitsConstatesAvance: { status: "DECLARE", montant } } as never });
    const diverging = bilanCases(mergeRentInventoryIntoBilan(lineOf(800), project([sAdv])).bilan);
    assert.ok(diverging.conflits.some((c) => c.code === "LIGNE_SIMPLE_ET_VENTILATION"), "mécanisme existant de détection conservé");
    const same = bilanCases(mergeRentInventoryIntoBilan(lineOf(1000), project([sAdv])).bilan);
    assert.equal(same.conflits.length, 0);
    assert.equal(same.c174, 1000, "1 000 et non 2 000");
  });
  it("INVENTORY-14 legacy V1 inchangé : sans état v2, projection vide et bilan strictement identique", () => {
    const p = projectRentalInventoryToBilan({ fiscalYear: Y, propertyIds: ["A"], states: [] });
    assert.deepEqual(p.providedNatures, []);
    assert.equal(mergeRentInventoryIntoBilan(BILAN, p).bilan, BILAN);
    for (const file of ["src/lib/lmnp/dossier/fiscal-consolidation.ts", "src/lib/lmnp/services/declaration/run-declaration-generation.ts"]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /f013-v2|rentReconciliationV2|rental-inventory/, `${file} ne consomme pas v2 (pas de bascule F006)`);
    }
  });
  it("INVENTORY-15 garde de clôture toujours actif", () => {
    const s = facts("A", 11000, { closingReceivables: 1000 });
    assert.equal(isF013V2ContinuityBlocked({ declarationDraft: { completedSteps: [], rentReconciliationV2: s } }), true);
    const pre = canCloseFiscalYear({
      fiscalYear: { id: "fy", year: Y, status: "ready_to_close", regime: "reel", propertyIds: ["A"], closures: [], createdAt: NOW, updatedAt: NOW } as never,
      declarationDraft: { completedSteps: [], rentReconciliationV2: s },
      properties: [{ id: "A", label: "A" }] as never,
    });
    assert.equal(!pre.ok && pre.code, "f013_v2_continuity_not_supported");
  });
});
