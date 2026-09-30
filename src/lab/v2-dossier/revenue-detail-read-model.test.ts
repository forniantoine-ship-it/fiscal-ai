/**
 * R15.6 — read model Revenus structuré et property-scoped (sorties F013 réelles : voir revenue-test-support.ts).
 *
 * Run: npx tsx --test src/lab/v2-dossier/revenue-detail-read-model.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyRevenueSession } from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import type { V3DocumentsReadModel } from "./document-read-model";
import { buildV3RevenueDetail, type V3RevenueDetail } from "./revenue-detail-read-model";
import { docRow, property, stateOf, workspaceOf } from "./housing-test-support";
import {
  DEFAULT_TRANSACTIONS, F009_CONFIRMED_AT, HOUSING_YEAR, NOW, SERVICE_DATE, assistantWithoutDate, conversationalConfirmed,
  documentSession, persistConversational, persistDocumentChannel, transaction,
} from "./revenue-test-support";

type Known = Extract<V3RevenueDetail, { state: "known" }>;
function known(detail: V3RevenueDetail): Known {
  assert.equal(detail.state, "known");
  return detail as Known;
}
const withDate = { draft: { dateMiseEnService: SERVICE_DATE, inpiConfirmedAt: F009_CONFIRMED_AT } };
const conversational = async (over: Parameters<typeof stateOf>[0] = withDate) =>
  persistConversational(stateOf(over), await conversationalConfirmed());

test("A. aucune sortie : inconnu, jamais 0", () => {
  const detail = known(buildV3RevenueDetail(workspaceOf(stateOf()), "home-1"));
  assert.deepEqual(detail.total, { state: "unknown" });
  assert.equal(detail.confirmed, false);
  assert.deepEqual([detail.components, detail.blocking, detail.documents], [[], [], []]);
  assert.equal(detail.theoretical, undefined);
});

test("B. saisie manuelle confirmée : total persisté tel quel, provenance Saisi, aucun document", async () => {
  const state = await conversational();
  const persisted = state.declarationDraft!.revenusAssistant!;
  const workspace = workspaceOf(state);
  const before = structuredClone(workspace);
  const detail = known(buildV3RevenueDetail(workspace, "home-1"));
  assert.equal(detail.channel, "conversational");
  assert.equal(detail.confirmed, true);
  assert.deepEqual(detail.total, { state: "known_amount", amount: persisted.totalRecettes });
  assert.equal(persisted.totalRecettes, 6400);
  const rents = detail.components.find(item => item.id === "rents");
  assert.deepEqual(rents?.origin, { kind: "manual" });
  assert.deepEqual(detail.documents, []);
  assert.deepEqual(workspace, before, "T. aucune mutation");
});

test("C. document : total et catégories persistés, provenance Extrait, seuls les documents réellement résolus", () => {
  const options = { confirmAfterBridge: true };
  const state = persistDocumentChannel(
    stateOf({ documents: [docRow("doc-rev", "Releve.pdf")], ...withDate }),
    documentSession(DEFAULT_TRANSACTIONS()), ["doc-rev", "ghost-doc"], options,
  );
  const persisted = state.declarationDraft!.revenusAssistant!;
  const documents: V3DocumentsReadModel = { state: "known", documents: [{ id: "doc-rev", label: "Relevé", fileName: "Releve.pdf", processingStatus: "analyzed" }] };
  const detail = known(buildV3RevenueDetail(workspaceOf(state), "home-1", documents));
  assert.equal(detail.channel, "documents");
  assert.deepEqual(detail.total, { state: "known_amount", amount: persisted.totalRecettes });
  assert.deepEqual(detail.components.map(item => [item.id, item.amount, item.origin.kind]), [["rents", 1400, "extracted"], ["insurance", 120, "extracted"], ["platform", 300, "extracted"]]);
  assert.deepEqual(detail.documents, [{ id: "doc-rev", label: "Releve.pdf", status: "analyzed" }], "S. le document fantôme n'apparaît pas");
  assert.equal(known(buildV3RevenueDetail(workspaceOf(state), "home-1")).documents[0]?.status, "unknown", "sans lecture documentaire fiable : état non déterminé");
});

test("C bis. séquence réelle de l'étape documentaire : la confirmation est effacée par le reducer, la V3 le restitue fidèlement (à confirmer)", () => {
  const state = persistDocumentChannel(stateOf({ ...withDate }), documentSession(DEFAULT_TRANSACTIONS()), []);
  assert.equal(state.declarationDraft!.revenusConfirmedAt, undefined, "constat sur le reducer réel (dette backend, hors R15.6)");
  const detail = known(buildV3RevenueDetail(workspaceOf(state), "home-1"));
  assert.deepEqual(detail.total, { state: "unconfirmed", amount: 1820 });
  assert.equal(detail.confirmed, false);
});

test("D. sortie présente mais non confirmée : à confirmer, montant conservé", async () => {
  const state = persistConversational(stateOf(withDate), await conversationalConfirmed(), { confirmed: false });
  const detail = known(buildV3RevenueDetail(workspaceOf(state), "home-1"));
  assert.deepEqual(detail.total, { state: "unconfirmed", amount: 6400 });
  assert.equal(detail.confirmed, false);
});

test("E. total confirmé à 0 : zéro confirmé, distinct d'inconnu", () => {
  const state = persistDocumentChannel(stateOf(withDate), documentSession([]), [], { confirmAfterBridge: true });
  const detail = known(buildV3RevenueDetail(workspaceOf(state), "home-1"));
  assert.equal(state.declarationDraft!.revenusAssistant!.totalRecettes, 0);
  assert.deepEqual(detail.total, { state: "confirmed_zero" });
  assert.notDeepEqual(detail.total, known(buildV3RevenueDetail(workspaceOf(stateOf()), "home-1")).total, "zéro confirmé ≠ inconnu");
  assert.deepEqual(detail.components, []);
});

test("F. total > 0 : montant exact, cents conservés", () => {
  const state = persistDocumentChannel(
    stateOf(withDate), documentSession([transaction({ id: "x", amount: 1234.56, category: "rent", date: "2025-02-01" })]), [], { confirmAfterBridge: true },
  );
  const detail = known(buildV3RevenueDetail(workspaceOf(state), "home-1"));
  assert.deepEqual(detail.total, { state: "known_amount", amount: 1234.56 });
});

test("G. composante à 0 avec fieldSource extracted : aucune composante, aucune fausse provenance", () => {
  const state = persistDocumentChannel(stateOf(withDate), documentSession([transaction({ id: "t", amount: 900, category: "rent", date: "2025-03-05" })]), []);
  const output = state.declarationDraft!.revenusAssistant!;
  assert.deepEqual([output.fieldSources.indemnites, output.fieldSources.plateforme], ["extracted", "extracted"], "le pont marque bien extracted");
  assert.equal(output.indemnitesAssurance, 0);
  const detail = known(buildV3RevenueDetail(workspaceOf(state), "home-1"));
  assert.deepEqual(detail.components.map(item => item.id), ["rents"]);
});

test("H. théorique > 0 avec date réelle démontrée : exposé à part, jamais dans le total ni les composantes", async () => {
  const detail = known(buildV3RevenueDetail(workspaceOf(await conversational()), "home-1"));
  assert.deepEqual(detail.theoretical, { amount: 5600, rentalMonths: 7 });
  assert.deepEqual(detail.total, { state: "known_amount", amount: 6400 });
  assert.ok(detail.components.every(item => item.amount !== 5600));
});

test("I. théorique masqué : pas de preuve de date, date absente, canal documentaire, conflit, valeur nulle", async () => {
  const noConfirmation = await conversational({ draft: { dateMiseEnService: SERVICE_DATE } });
  assert.equal(known(buildV3RevenueDetail(workspaceOf(noConfirmation), "home-1")).theoretical, undefined, "sans preuve que la date précède le calcul");
  const laterConfirmation = await conversational({ draft: { dateMiseEnService: SERVICE_DATE, inpiConfirmedAt: "2026-04-01T00:00:00.000Z" } });
  assert.equal(known(buildV3RevenueDetail(workspaceOf(laterConfirmation), "home-1")).theoretical, undefined, "date reconfirmée après le calcul");
  const noDate = persistConversational(stateOf({ draft: { inpiConfirmedAt: F009_CONFIRMED_AT } }), await conversationalConfirmed(assistantWithoutDate()));
  const noDateDetail = known(buildV3RevenueDetail(workspaceOf(noDate), "home-1"));
  assert.equal(noDateDetail.theoretical, undefined, "K. calculé avec la date par défaut historique : jamais exposé");
  assert.equal(noDateDetail.serviceDate.status, "absent");
  const conflict = await conversational({ ...withDate, properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2024-05-02" } })] });
  assert.equal(known(buildV3RevenueDetail(workspaceOf(conflict), "home-1")).theoretical, undefined);
  const documentChannel = persistDocumentChannel(stateOf(withDate), documentSession(DEFAULT_TRANSACTIONS()), []);
  assert.equal(known(buildV3RevenueDetail(workspaceOf(documentChannel), "home-1")).theoretical, undefined);
  const zero = structuredClone(await conversational());
  zero.declarationDraft!.revenusAssistant!.revenuTheorique = 0;
  assert.equal(known(buildV3RevenueDetail(workspaceOf(zero), "home-1")).theoretical, undefined, "I. théorique nul : non affiché");
});

test("J/K/L. date de mise en service : accessor R15.5 (connue), absente sans date fabriquée, conflit visible", async () => {
  const detail = known(buildV3RevenueDetail(workspaceOf(await conversational()), "home-1"));
  assert.equal(detail.serviceDate.status === "known" && detail.serviceDate.value, SERVICE_DATE);
  const noDate = persistConversational(stateOf(), await conversationalConfirmed(assistantWithoutDate()));
  const absent = known(buildV3RevenueDetail(workspaceOf(noDate), "home-1"));
  assert.equal(absent.serviceDate.status, "absent");
  assert.doesNotMatch(JSON.stringify(absent), /-01-01|-06-01/, "aucune date fabriquée exposée");
  const conflict = await conversational({ ...withDate, properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2024-05-02" } })] });
  assert.equal(known(buildV3RevenueDetail(workspaceOf(conflict), "home-1")).serviceDate.status, "conflict");
});

test("M. ajustement janvier/décembre : aucun double comptage", async () => {
  const state = await conversational();
  const persisted = state.declarationDraft!.revenusAssistant!;
  assert.equal(persisted.ajustementsJanDec, 800);
  assert.equal(persisted.loyersEncaisses, 6400, "loyersEncaisses contient déjà l'ajustement");
  const detail = known(buildV3RevenueDetail(workspaceOf(state), "home-1"));
  assert.deepEqual(detail.total, { state: "known_amount", amount: persisted.totalRecettes });
  assert.deepEqual(detail.components.map(item => [item.id, item.amount]), [["rents", 6400]], "aucune composante « ajustement »");
  assert.equal(detail.components[0]?.includesJanDecAdjustment, 800, "l'ajustement est une information, déjà compris");
  assert.deepEqual(detail.reconciliation, { reconciled: true });
  const naive = persisted.loyersEncaisses + persisted.ajustementsJanDec + persisted.indemnitesAssurance + persisted.recettesPlateforme;
  assert.notEqual(naive, persisted.totalRecettes);
  assert.ok(!JSON.stringify(detail).includes(String(naive)), "la somme naïve n'apparaît nulle part");
});

test("N/O/P. propertyId absent, inconnu, hors exercice : scope_unresolved, aucune donnée", async () => {
  const state = await conversational();
  const ws = workspaceOf(state);
  assert.deepEqual(buildV3RevenueDetail(ws, undefined), { state: "scope_unresolved", reason: "no_property_id", year: HOUSING_YEAR });
  assert.deepEqual(buildV3RevenueDetail(ws, "ghost"), { state: "scope_unresolved", reason: "unknown_property", year: HOUSING_YEAR });
  const outside = workspaceOf(stateOf({ properties: [property("home-1"), property("home-2")], propertyIds: ["home-1"], draft: state.declarationDraft }));
  assert.equal((buildV3RevenueDetail(outside, "home-2") as { reason: string }).reason, "not_in_fiscal_year");
  const duplicate = workspaceOf(stateOf({ properties: [property("home-1"), property("home-1")], propertyIds: ["home-1"] }));
  assert.equal((buildV3RevenueDetail(duplicate, "home-1") as { reason: string }).reason, "ambiguous");
  assert.equal((buildV3RevenueDetail(workspaceOf(stateOf({ properties: [], propertyIds: [] })), "home-1") as { reason: string }).reason, "no_property");
});

test("Q. multi-biens : facts_only, aucun total ni détail global attribué au bien", async () => {
  const single = await conversational();
  const multi = stateOf({
    properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2023-03-01" } }), property("home-2")],
    draft: { ...single.declarationDraft, revenusDocumentIds: ["doc-rev"] }, documents: [docRow("doc-rev", "Releve.pdf")],
  });
  const detail = known(buildV3RevenueDetail(workspaceOf(multi), "home-1"));
  assert.equal(detail.support, "facts_only");
  assert.deepEqual(detail.total, { state: "not_attributable" });
  assert.deepEqual([detail.components, detail.documents, detail.blocking], [[], [], []]);
  assert.equal(detail.theoretical, undefined);
  assert.equal(detail.confirmed, false);
  assert.doesNotMatch(JSON.stringify(detail), /6400|5600/);
  assert.equal(detail.serviceDate.status === "known" && detail.serviceDate.value, "2023-03-01", "la base propre au bien reste attribuable");
  assert.deepEqual(detail.entry, { kind: "undetermined", reason: "not_attributable_to_property" });
});

test("R. données fictives du pipeline documentaire : jamais exposées", () => {
  const properties = [property("home-1", { label: "", address: "", city: "", postalCode: "" })];
  const demo = createEmptyRevenueSession(properties, HOUSING_YEAR);
  assert.match(JSON.stringify(demo), /Bordeaux Gambetta/, "le pipeline fabrique bien ce libellé par défaut");
  const state = persistDocumentChannel(stateOf({ properties, ...withDate }), demo, [], { confirmAfterBridge: true });
  const mono = JSON.stringify(buildV3RevenueDetail(workspaceOf(state), "home-1"));
  assert.doesNotMatch(mono, /Bordeaux|Gambetta|Lyon Part-Dieu|Studio/);
  const twoProperties = [property("home-1", { label: "", address: "", city: "", postalCode: "" }), property("home-2", { label: "", address: "", city: "", postalCode: "" })];
  const multiDemo = createEmptyRevenueSession(twoProperties, HOUSING_YEAR);
  assert.match(JSON.stringify(multiDemo), /Studio Lyon Part-Dieu/);
  const multi = persistDocumentChannel(stateOf({ properties: twoProperties, ...withDate }), multiDemo, []);
  assert.doesNotMatch(JSON.stringify(buildV3RevenueDetail(workspaceOf(multi), "home-1")), /Bordeaux|Gambetta|Lyon Part-Dieu|Studio/);
});

test("anomalies bloquantes persistées : messages transportés via blockingAnomalies, avertissements ignorés", async () => {
  const state = await conversational();
  const withAnomalies = structuredClone(state);
  withAnomalies.declarationDraft!.revenusAssistant!.anomalies = [
    { severity: "error", message: "Indemnité GLI signalée comme perçue mais montant non renseigné.", field: "indemnites" },
    { severity: "warning", message: "Avertissement sans blocage." },
  ];
  const detail = known(buildV3RevenueDetail(workspaceOf(withAnomalies), "home-1"));
  assert.deepEqual(detail.blocking, ["Indemnité GLI signalée comme perçue mais montant non renseigné."]);
});

test("sorties anciennes ou hors exercice : jamais de plantage, jamais de zéro inventé", async () => {
  const legacy = stateOf({ draft: { revenusAssistant: { exerciceFiscal: HOUSING_YEAR, totalRecettes: 7150 } as never, revenusConfirmedAt: NOW } });
  const detail = known(buildV3RevenueDetail(workspaceOf(legacy), "home-1"));
  assert.deepEqual(detail.total, { state: "known_amount", amount: 7150 });
  assert.deepEqual(detail.components, []);
  assert.equal(detail.reconciliation, undefined, "détail absent : aucun contrôle inventé");
  const stale = structuredClone(await conversational());
  stale.declarationDraft!.revenusAssistant!.exerciceFiscal = HOUSING_YEAR - 1;
  assert.deepEqual(known(buildV3RevenueDetail(workspaceOf(stale), "home-1")).total, { state: "unknown" });
});
