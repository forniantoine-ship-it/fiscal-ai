/**
 * R15.7 — read model Charges structuré et property-scoped (sorties F012 réelles : voir charges-test-support.ts).
 * La V3 RESTITUE F012 : aucun test ne demande un calcul, tous vérifient un transport fidèle ou un masquage.
 *
 * Run: npx tsx --test src/lab/v2-dossier/charges-detail-read-model.test.ts
 */
import "./test-public-env";
import assert from "node:assert/strict";
import test from "node:test";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { buildV3ChargesDetail, isChargesRegistryFresh, type V3ChargesDetail } from "./charges-detail-read-model";
import { docRow, property, stateOf, workspaceOf } from "./housing-test-support";
import { resolveV3PropertyServiceDate } from "./property-service-date";
import {
  F009_CONFIRMED_AT, NOW, PROFIL_SIMPLE, SERVICE_DATE, chargesAssistantFor, chargesFromTaxDocument, chargesWithAmortizableWorks,
  chargesWithFinancingOverlap, persistCharges, rewriteChargesSession, simpleCharges, step,
} from "./charges-test-support";
import type { V3DocumentsReadModel } from "./document-read-model";

type Known = Extract<V3ChargesDetail, { state: "known" }>;
function known(detail: V3ChargesDetail): Known {
  assert.equal(detail.state, "known");
  return detail as Known;
}
const withDate = { draft: { dateMiseEnService: SERVICE_DATE, inpiConfirmedAt: F009_CONFIRMED_AT } };
const detailOf = (state: LmnpState, propertyId: string | null = "home-1", documents?: V3DocumentsReadModel) =>
  buildV3ChargesDetail(workspaceOf(state), propertyId, documents);
const simple = async (over: Parameters<typeof stateOf>[0] = withDate) => persistCharges(stateOf(over), await simpleCharges());

async function nothingPaid() {
  const assistant = chargesAssistantFor();
  let state = await step(assistant, assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  while (state.step === "category_collect") state = await step(assistant, state, { type: "skip_category" });
  state = await step(assistant, state, { type: "confirm_completeness", hasOther: false });
  const done = await assistant.handle(state, { type: "confirm_all" });
  assert.equal(done.completed, true);
  return done.state;
}

test("A. aucune sortie : inconnu, jamais zéro ; aucun détail", () => {
  const detail = known(detailOf(stateOf()));
  assert.deepEqual(detail.total, { state: "unknown" });
  assert.equal(detail.confirmed, false);
  assert.equal(detail.registry, "absent");
  assert.deepEqual([detail.categories, detail.notRetained, detail.open, detail.documents], [[], [], [], []]);
  assert.equal(detail.nonDeductible, undefined);
});

test("B. sortie confirmée à 0 : zéro confirmé, distinct de l'inconnu ; aucune catégorie fabriquée", async () => {
  const state = persistCharges(stateOf(withDate), await nothingPaid());
  assert.equal(state.declarationDraft!.chargesAssistant!.totalDeductible, 0);
  const detail = known(detailOf(state));
  assert.deepEqual(detail.total, { state: "confirmed_zero" });
  assert.deepEqual(detail.categories, []);
});

test("C. sortie confirmée > 0 : montant exact persisté, catégories > 0 seulement", async () => {
  const state = await simple();
  const persisted = state.declarationDraft!.chargesAssistant!;
  const detail = known(detailOf(state));
  assert.deepEqual(detail.total, { state: "known_amount", amount: persisted.totalDeductible });
  assert.equal(persisted.totalDeductible, 787.5);
  assert.equal(detail.confirmed, true);
  assert.equal(detail.registry, "fresh");
});

test("D. sortie présente sans chargesConfirmedAt : non confirmée, montant conservé tel quel", async () => {
  const state = persistCharges(stateOf(withDate), await simpleCharges(), { confirmed: false });
  const detail = known(detailOf(state));
  assert.deepEqual(detail.total, { state: "unconfirmed", amount: 787.5 });
  assert.equal(detail.confirmed, false);
});

test("E. suppression d'un document simulée par le reducer réel : ancienne sortie jamais confirmée, ni supprimée ni recalculée, document introuvable non inventé", async () => {
  const before = persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument());
  const beforeDetail = known(detailOf(before));
  assert.deepEqual(beforeDetail.total, { state: "known_amount", amount: 875 });
  assert.deepEqual(beforeDetail.documents.map(doc => doc.id), ["doc-tf"]);

  const after = lmnpReducer(before, { type: "REMOVE_DOCUMENT", documentId: "doc-tf" });
  assert.equal(after.declarationDraft!.chargesConfirmedAt, undefined, "précondition : la confirmation a bien été effacée par le reducer");
  assert.equal(after.declarationDraft!.chargesAssistant!.totalDeductible, 875, "précondition : la sortie est laissée en l'état");
  const detail = known(detailOf(after));
  assert.deepEqual(detail.total, { state: "unconfirmed", amount: 875 });
  assert.equal(detail.confirmed, false);
  assert.deepEqual(detail.documents, [], "le document supprimé n'est plus présenté");
  assert.ok(detail.open.some(item => item.kind === "tax_choice_pending"), "la dépense repassée à « à confirmer » reste à régler");
});

test("F/G. catégories : seules celles > 0 sont exposées, jamais un 0 pour une catégorie absente", async () => {
  const detail = known(detailOf(await simple()));
  assert.deepEqual(detail.categories.map(item => [item.id, item.label, item.amount]), [["taxe_fonciere", "Taxe foncière", 700], ["assurance_pno", "Assurance PNO", 87.5]]);
  assert.ok(detail.categories.every(item => item.amount > 0));
  assert.equal(detail.categories.some(item => item.id === "assurance_gli"), false);
  const zeroed = structuredClone(await simple());
  zeroed.declarationDraft!.chargesAssistant!.parCategorie = { taxe_fonciere: 700, assurance_gli: 0 };
  assert.deepEqual(known(detailOf(zeroed)).categories.map(item => item.id), ["taxe_fonciere"], "une catégorie à 0 n'est pas exposée");
});

test("H. recouvrement F011 : montant persisté exposé à part, jamais recompté dans le total ni les catégories", async () => {
  const state = persistCharges(stateOf(withDate), await chargesWithFinancingOverlap());
  const persisted = state.declarationDraft!.chargesAssistant!;
  const detail = known(detailOf(state));
  assert.deepEqual(detail.financingAlreadyCounted, { amount: 300, parts: [{ kind: "insurance", amount: 300 }] });
  assert.deepEqual(detail.total, { state: "known_amount", amount: persisted.totalDeductible });
  assert.equal(persisted.totalDeductible, 700, "F012 n'a pas recompté l'assurance déjà comptée par F011");
  assert.equal(detail.categories.reduce((sum, item) => sum + item.amount, 0), 700);
  assert.deepEqual(detail.notRetained.map(item => [item.label, item.amount, item.reason]), [["Assurance emprunteur", 300, "financing_overlap"]]);
  assert.equal(detail.nonDeductible, undefined, "le recouvert n'est pas requalifié en non déductible");
  assert.equal(detail.amortizable, undefined);
});

test("H'. aucun recouvrement persisté → aucun « déjà compté » (rien n'est déduit du libellé)", async () => {
  const detail = known(detailOf(await simple()));
  assert.equal(detail.financingAlreadyCounted, undefined);
  const stripped = structuredClone(persistCharges(stateOf(withDate), await chargesWithFinancingOverlap()));
  delete stripped.declarationDraft!.chargesAssistant!.recouvrementAssuranceF011;
  assert.equal(known(detailOf(stripped)).financingAlreadyCounted, undefined);
});

test("I. totalNonDeductible : exposé à part, jamais ajouté au total déductible", async () => {
  const state = structuredClone(await simple());
  state.declarationDraft!.chargesAssistant!.totalNonDeductible = 90;
  state.declarationDraft!.chargesAssistant!.parCategorieNonDeductible = { divers: 90 };
  const detail = known(detailOf(state));
  assert.deepEqual(detail.nonDeductible, { amount: 90, byCategory: [{ id: "divers", label: "Divers", amount: 90 }] });
  assert.deepEqual(detail.total, { state: "known_amount", amount: 787.5 });
});

test("J/K. amortissable et composants : zone distincte, jamais dans le total ni les catégories déductibles", async () => {
  const state = persistCharges(stateOf(withDate), await chargesWithAmortizableWorks());
  const persisted = state.declarationDraft!.chargesAssistant!;
  const detail = known(detailOf(state));
  assert.equal(persisted.totalAmortissable, 5000);
  assert.deepEqual(detail.amortizable, { amount: 5000, components: [{ id: "travaux-1", label: "Cuisine équipée", amount: 5000 }] });
  assert.deepEqual(detail.total, { state: "known_amount", amount: 700 }, "amortissable ≠ déductible");
  assert.notEqual(detail.total.state === "known_amount" ? detail.total.amount : -1, persisted.totalDeductible + persisted.totalAmortissable);
  assert.equal(detail.categories.some(item => item.id === "travaux"), false);
});

test("L. registre frais : provenance réelle par catégorie, documents résolus, états ouverts", async () => {
  const state = persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument());
  const detail = known(detailOf(state));
  assert.equal(detail.registry, "fresh");
  assert.deepEqual(detail.categories.map(item => [item.id, item.origin.kind]), [["taxe_fonciere", "extracted"]]);
  assert.deepEqual(detail.documents, [{ id: "doc-tf", label: "Avis TF.pdf", status: "unknown" }]);
  assert.deepEqual(detail.open.map(item => item.kind), ["family_unknown", "family_unknown"]);
  const manual = known(detailOf(await simple()));
  assert.deepEqual(manual.categories.map(item => item.origin.kind), ["manual", "manual"]);
});

test("M. registre périmé (session réécrite après la sortie) : provenance, documents, états et exclusions masqués, total jamais confirmé", async () => {
  const fresh = persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument());
  const stale = rewriteChargesSession(fresh);
  assert.equal(isChargesRegistryFresh(stale.declarationDraft!.chargesAssistantState, stale.declarationDraft!.chargesAssistant), false);
  const detail = known(detailOf(stale));
  assert.equal(detail.registry, "stale");
  assert.deepEqual(detail.total, { state: "stale", amount: 875 }, "montant de la dernière sortie, marqué à revoir");
  assert.equal(detail.confirmed, true);
  assert.deepEqual(detail.categories.map(item => item.origin.kind), ["unknown"]);
  assert.deepEqual([detail.documents, detail.open, detail.notRetained, detail.nothingPaidFamilies], [[], [], [], []]);
  const overlap = known(detailOf(rewriteChargesSession(persistCharges(stateOf(withDate), await chargesWithFinancingOverlap()))));
  assert.deepEqual(overlap.notRetained, [], "les exclusions du registre périmé ne sont pas exposées");
});

test("M'. fraîcheur : égalité stricte des horodatages, session ou sortie absente = non démontré", () => {
  assert.equal(isChargesRegistryFresh({ updatedAt: NOW }, { computedAt: NOW }), true);
  assert.equal(isChargesRegistryFresh({ updatedAt: NOW }, { computedAt: "2026-03-01T10:00:00.001Z" }), false);
  assert.equal(isChargesRegistryFresh(undefined, { computedAt: NOW }), false);
  assert.equal(isChargesRegistryFresh({ updatedAt: NOW }, undefined), false);
  assert.equal(isChargesRegistryFresh({ updatedAt: "" }, { computedAt: "" }), false);
});

test("N/O. documents : résolus depuis workspace.documents ; un id sans document n'est jamais inventé ; chargesDocumentIds (canal historique) jamais lu", async () => {
  const withoutRow = persistCharges(stateOf(withDate), await chargesFromTaxDocument("doc-ghost"));
  assert.deepEqual(known(detailOf(withoutRow)).documents, [], "id du registre sans document réel");
  const legacy = structuredClone(await simple());
  legacy.declarationDraft!.chargesDocumentIds = ["doc-legacy"];
  legacy.documents = [docRow("doc-legacy", "Historique.pdf")];
  assert.deepEqual(known(detailOf(legacy)).documents, [], "canal historique ignoré");
  const known1: V3DocumentsReadModel = {
    state: "known", documents: [{ id: "doc-tf", fileName: "Avis TF.pdf", label: "Avis TF.pdf", processingStatus: "analyzed" } as never],
  } as never;
  const withRow = persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument());
  assert.equal(known(detailOf(withRow, "home-1", known1)).documents[0]?.status, "analyzed");
});

test("P. taxe foncière : le montant F012 persisté (875), jamais l'avis (1 500) ni un recalcul", async () => {
  const detail = known(detailOf(persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument())));
  assert.equal(detail.categories.find(item => item.id === "taxe_fonciere")?.amount, 875);
});

test("Q. familles « je ne sais pas » et choix en attente : à régler ; « rien payé » : couverture, distincte", async () => {
  const detail = known(detailOf(await simple()));
  assert.deepEqual(detail.open.map(item => [item.kind, item.kind === "family_unknown" ? item.familyId : null]), [["family_unknown", "autres"]]);
  const assistant = chargesAssistantFor();
  let state = await step(assistant, assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  state = await step(assistant, state, { type: "none_category" }); // taxe_fonciere: « rien payé »
  while (state.step === "category_collect") state = await step(assistant, state, { type: "skip_category" });
  state = await step(assistant, state, { type: "confirm_completeness", hasOther: false });
  const done = await assistant.handle(state, { type: "confirm_all" });
  const none = known(detailOf(persistCharges(stateOf(withDate), done.state)));
  assert.deepEqual(none.nothingPaidFamilies.map(item => item.familyId), ["impots"]);
  assert.equal(none.open.some(item => item.kind === "family_unknown" && item.familyId === "impots"), false, "« rien payé » n'est pas « je ne sais pas »");
});

test("R. date réelle démontrée : avant mise en location exposé ; date = accessor R15.5", async () => {
  const state = await simple();
  const detail = known(detailOf(state));
  assert.deepEqual(detail.serviceDate, resolveV3PropertyServiceDate(workspaceOf(state), "home-1"));
  assert.equal(detail.serviceDate.status, "known");
  assert.equal(detail.preExploitation?.amount, 562.5);
  assert.deepEqual(detail.preExploitation?.byCategory.map(item => item.id), ["taxe_fonciere", "assurance_pno"]);
});

test("S. date absente : F012 a utilisé son repli historique, la V3 ne présente aucun chiffre « avant mise en location » ni de date fabriquée", async () => {
  const state = persistCharges(stateOf({ draft: { inpiConfirmedAt: F009_CONFIRMED_AT } }), await simpleCharges(chargesAssistantFor({})));
  assert.ok(state.declarationDraft!.chargesAssistant!.totalPreExploitation > 0, "précondition : F012 a bien calculé sur sa date par défaut");
  const detail = known(detailOf(state));
  assert.equal(detail.serviceDate.status, "absent");
  assert.equal(detail.preExploitation, undefined);
  assert.doesNotMatch(JSON.stringify(detail), /-06-01/);
});

test("T. date en conflit, en attente, non confirmée ou modifiée depuis : aucune donnée « avant mise en location »", async () => {
  const conflict = persistCharges(stateOf({ ...withDate, properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2024-05-02" } })] }), await simpleCharges());
  assert.equal(known(detailOf(conflict)).serviceDate.status, "conflict");
  assert.equal(known(detailOf(conflict)).preExploitation, undefined);
  const notConfirmed = persistCharges(stateOf({ draft: { dateMiseEnService: SERVICE_DATE } }), await simpleCharges());
  assert.equal(known(detailOf(notConfirmed)).preExploitation, undefined, "date jamais confirmée par F009");
  const changed = persistCharges(stateOf({ draft: { ...withDate.draft, activiteAssistantState: { dateMiseEnService: "2025-09-01" } as never } }), await simpleCharges());
  assert.equal(known(detailOf(changed)).preExploitation, undefined, "modification de la date en cours");
  const baseOnly = persistCharges(stateOf({ properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: SERVICE_DATE } })] }), await simpleCharges());
  assert.equal(known(detailOf(baseOnly)).preExploitation, undefined, "F012 lit le draft, pas la base du bien");
});

test("U/V/W. scope : propertyId absent, faux, hors exercice → scope_unresolved, aucune donnée", async () => {
  const state = await simple();
  for (const id of [null, undefined, "", "ghost"]) {
    const detail = buildV3ChargesDetail(workspaceOf(state), id);
    assert.equal(detail.state, "scope_unresolved");
    assert.doesNotMatch(JSON.stringify(detail), /787|700|Taxe/);
  }
  assert.deepEqual(detailOf(state, null), { state: "scope_unresolved", reason: "no_property_id", year: 2025 });
  assert.equal((detailOf(state, "ghost") as { reason: string }).reason, "unknown_property");
  const outside = persistCharges(stateOf({ properties: [property("home-1"), property("home-2")], propertyIds: ["home-1"], ...withDate }), await simpleCharges());
  assert.deepEqual(detailOf(outside, "home-2"), { state: "scope_unresolved", reason: "not_in_fiscal_year", year: 2025 });
  assert.deepEqual(detailOf(stateOf({ properties: [] }), "home-1"), { state: "scope_unresolved", reason: "no_property", year: 2025 });
  const ambiguous = stateOf({ properties: [property("home-1"), property("home-1")], propertyIds: ["home-1"] });
  assert.equal((detailOf(ambiguous, "home-1") as { reason: string }).reason, "ambiguous");
});

test("X. multi-biens : facts_only, aucun total, catégorie, document ni registre global attribué au bien", async () => {
  const single = persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument());
  const multi = stateOf({ properties: [property("home-1"), property("home-2")], documents: single.documents, draft: single.declarationDraft! });
  for (const id of ["home-1", "home-2"]) {
    const detail = known(detailOf(multi, id));
    assert.equal(detail.support, "facts_only");
    assert.deepEqual(detail.total, { state: "not_attributable" });
    assert.deepEqual([detail.categories, detail.documents, detail.open, detail.notRetained], [[], [], [], []]);
    assert.deepEqual([detail.nonDeductible, detail.amortizable, detail.preExploitation, detail.financingAlreadyCounted], [undefined, undefined, undefined, undefined]);
    assert.equal(detail.registry, "absent");
    assert.equal(detail.entry.kind, "undetermined");
  }
});

test("Y. non-mutation du workspace (y compris registre et sortie)", async () => {
  const workspace = workspaceOf(persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument()));
  const before = structuredClone(workspace);
  buildV3ChargesDetail(workspace, "home-1");
  buildV3ChargesDetail(workspace, "ghost");
  assert.deepEqual(workspace, before);
});

test("Z. oracle : le total principal EST chargesAssistant.totalDeductible, même si la somme des données disponibles donne autre chose", async () => {
  const state = structuredClone(await chargesWithFinancingOverlap().then(final => persistCharges(stateOf(withDate), final)));
  const output = state.declarationDraft!.chargesAssistant!;
  const naive = Object.values(output.parCategorie).reduce((sum, amount) => sum + (amount ?? 0), 0) + (output.recouvrementAssuranceF011?.recouvert ?? 0) + output.totalNonDeductible + output.totalAmortissable + output.totalPreExploitation;
  assert.notEqual(naive, output.totalDeductible, "précondition : une somme naïve donnerait autre chose");
  assert.deepEqual(known(detailOf(state)).total, { state: "known_amount", amount: output.totalDeductible });
  // Même quand le détail par nature ne reconstitue pas le total, le total persisté reste le seul montant retenu.
  output.parCategorie = { taxe_fonciere: 100 };
  const detail = known(detailOf(state));
  assert.deepEqual(detail.total, { state: "known_amount", amount: 700 });
  assert.deepEqual(detail.reconciliation, { reconciled: false });
});

test("sortie d'un autre exercice : non exposée (même garde d'année que les autres domaines)", async () => {
  const state = structuredClone(await simple());
  state.declarationDraft!.chargesAssistant!.exerciceFiscal = 2024;
  assert.deepEqual(known(detailOf(state)).total, { state: "unknown" });
});
