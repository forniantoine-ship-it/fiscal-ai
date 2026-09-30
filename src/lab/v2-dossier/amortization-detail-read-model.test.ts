/**
 * R15.8 — read model Amortissements (F014) structuré et property-scoped. Les états F010 / F012 / F014 sont produits par les
 * assistants RÉELS (voir amortization-test-support.ts) puis persistés par le reducer réel.
 *
 * Run: npx tsx --test src/lab/v2-dossier/amortization-detail-read-model.test.ts
 */
import "./test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { available, unavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { hasAmortissementDrifted } from "@/runtime/capabilities/f014/plan-consistency";
import { buildV3AmortizationDetail, type V3AmortizationDetail } from "./amortization-detail-read-model";
import { resolveF014Plan } from "./amortization-plan-seam";
import {
  HOUSING_YEAR, NOW, amortizedWithFurniture, amortizedWithWorks, f014AssistantFor, nativeAmortizedState, panelDeps, persistAmortissements,
} from "./amortization-test-support";
import { chargesWithAmortizableWorks, persistCharges, simpleCharges } from "./charges-test-support";
import { confirmedState, property, workspaceOf } from "./housing-test-support";

type Known = Extract<V3AmortizationDetail, { state: "known" }>;
function known(detail: V3AmortizationDetail): Known {
  assert.equal(detail.state, "known");
  return detail as Known;
}
const detailOf = (state: LmnpState, propertyId: string | null = "home-1") => buildV3AmortizationDetail(workspaceOf(state), propertyId);
const totalAmount = (detail: Known) => ("amount" in detail.total ? detail.total.amount : undefined);
const patch = (state: LmnpState, draft: Record<string, unknown>) => lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", patch: draft });

function takeoverState(base: LmnpState): LmnpState {
  const opening: FiscalYearOpening = {
    openingId: "o1", revision: 1, targetFiscalYear: HOUSING_YEAR, dossierId: "dossier-1",
    source: { kind: "external_takeover", takeoverId: "t1", sourceFiscalYear: HOUSING_YEAR - 1 },
    stocks: { deficits: unavailable(), amortissementsReportes: unavailable() },
    assets: available([
      { id: "a1", propertyId: "home-1", label: "Bâti", categorie: "batiment", coutBrut: available(100), cumulOuverture: available(10), plan: unavailable() },
    ] as never),
    loans: unavailable(), patrimoine: { ouvertureCompteExploitant: unavailable(), ran: unavailable(), tresorerieOuverture: unavailable() },
    properties: unavailable(), identity: unavailable(), provenance: {},
    validation: { status: "validated", openingRevision: 1, contentHash: "h", validatedAt: "2026-01-01", validator: "test" },
  };
  return {
    ...base,
    fiscalYear: {
      ...base.fiscalYear,
      priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: "2026-01-01" },
      externalTakeoverOpening: { sourceRef: "t1", opening },
    },
  };
}

test("A. aucune sortie F014 : total inconnu (« Non renseigné »), jamais 0 ; aucun détail", async () => {
  const detail = known(detailOf(await confirmedState()));
  assert.deepEqual(detail.total, { state: "unknown" });
  assert.equal(detail.planFreshness, "not_checked");
  assert.deepEqual(detail.lines, []);
  assert.equal(detail.land, undefined);
  assert.equal(totalAmount(detail), undefined);
});

test("B. logement natif : montant = amortissementAssistant.totalDotations persisté, plan concordant", async () => {
  const state = await nativeAmortizedState();
  const detail = known(detailOf(state));
  const persisted = state.declarationDraft!.amortissementAssistant!.totalDotations;
  assert.deepEqual(detail.total, { state: "known_amount", amount: persisted });
  assert.equal(detail.planFreshness, "consistent");
  assert.equal(detail.support, "full");
  assert.equal(detail.profile, "Première année d’amortissement");
  assert.ok(detail.lines.length > 0 && detail.lines.every(line => line.source === "housing"));
});

test("C. logement + mobilier : « Mobilier (lot) » est UNE ligne (aucun détail de meubles inventé), durée du plan persisté", async () => {
  const state = await amortizedWithFurniture();
  const detail = known(detailOf(state));
  const furniture = detail.lines.filter(line => /mobilier/i.test(line.label));
  assert.equal(furniture.length, 1);
  assert.equal(furniture[0]!.label, "Mobilier (lot)");
  assert.equal(furniture[0]!.base, 8000);
  const persistedLine = state.declarationDraft!.logementAmortissement!.plan.lignes.find(line => line.label === "Mobilier (lot)")!;
  assert.equal(furniture[0]!.durationYears, persistedLine.dureeAnnees);
  assert.equal(furniture[0]!.dotation, persistedLine.dotationExercice);
  assert.equal(furniture[0]!.source, "housing");
});

test("D. travaux F012 immobilisés : ligne « charges » avec id, base, durée, date du composant F012", async () => {
  const state = await amortizedWithWorks();
  const detail = known(detailOf(state));
  const component = state.declarationDraft!.chargesAssistant!.composantsNouveaux[0]!;
  const line = detail.lines.find(item => item.id === component.id)!;
  assert.deepEqual(
    [line.source, line.label, line.base, line.durationYears, line.startDate],
    ["charges", component.label, component.montant, component.dureeAnnees, component.dateDebut],
  );
});

test("E. travaux mixtes / entretien : la V3 ne requalifie rien — seuls les composants déjà retenus par F012 sont des lignes", async () => {
  const state = await nativeAmortizedState();
  const withRepair = persistCharges(await confirmedState(), await simpleCharges());
  // Ni « charges » ni réparation : F012 n'a produit aucun composant → aucune ligne « charges ».
  assert.equal(withRepair.declarationDraft!.chargesAssistant!.composantsNouveaux.length, 0);
  const detail = known(detailOf(await persistAmortissements(withRepair)));
  assert.ok(detail.lines.every(line => line.source !== "charges"));
  assert.equal(known(detailOf(state)).lines.length, detail.lines.length);
});

test("F. plusieurs composants : lignes distinctes, ids réels", async () => {
  const housing = await confirmedState();
  const works = await chargesWithAmortizableWorks();
  let state = persistCharges(housing, works);
  const first = state.declarationDraft!.chargesAssistant!.composantsNouveaux[0]!;
  const second = { ...first, id: "travaux-2", label: "Salle de bain", montant: 3000, dotationAnnuelle: 166.67, dateDebut: "2025-09-01" };
  state = patch(state, { chargesAssistant: { ...state.declarationDraft!.chargesAssistant!, composantsNouveaux: [first, second] } });
  const detail = known(detailOf(await persistAmortissements(state)));
  const chargeLines = detail.lines.filter(line => line.source === "charges");
  assert.deepEqual(chargeLines.map(line => line.id), [first.id, "travaux-2"]);
});

test("G. composant ajouté en cours d'année : dotation = celle du moteur F014 (prorata), pas la dotation annuelle", async () => {
  const state = await amortizedWithWorks();
  const detail = known(detailOf(state));
  const component = state.declarationDraft!.chargesAssistant!.composantsNouveaux[0]!;
  const line = detail.lines.find(item => item.id === component.id)!;
  const engine = f014AssistantFor(state).start().state.plan!.nouveaux_elements.find(item => item.id === component.id)!;
  assert.equal(line.dotation, engine.dotation_exercice);
  assert.notEqual(line.dotation, component.dotationAnnuelle, "prorata de première année appliqué par le moteur");
});

test("H. première année : profil PROF-001 du plan réel", async () => {
  const state = await nativeAmortizedState();
  assert.equal(state.declarationDraft!.amortissementAssistant!.profil, "PROF-001");
  const resolution = resolveF014Plan(workspaceOf(state), "home-1");
  assert.ok(resolution.ok && resolution.plan.premiere_annee && resolution.profil === "PROF-001");
});

test("I. exercice suivant : profil réel PROF-002 (plan repris sans nouvel élément), total = persisté", async () => {
  let state = await confirmedState();
  state = { ...state, fiscalYear: { ...state.fiscalYear, year: HOUSING_YEAR + 1 } };
  state = patch(state, { logementAmortissement: { ...state.declarationDraft!.logementAmortissement!, exerciceFiscal: HOUSING_YEAR + 1 } });
  state = await persistAmortissements(state);
  state = patch(state, {}); // no-op patch keeps the persisted output
  state = await persistAmortissements(state); // second validation: `planValidePrecedemment` is now true, exactly as in the panel
  const detail = known(detailOf(state));
  assert.equal(detail.year, HOUSING_YEAR + 1);
  assert.equal(state.declarationDraft!.amortissementAssistant!.profil, "PROF-002");
  assert.equal(detail.profile, "Plan repris sans nouvel élément");
  assert.equal(detail.total.state, "known_amount");
});

test("J. actif totalement amorti : dotation 0 confirmée ≠ absence de sortie", async () => {
  let state = await confirmedState();
  const housing = state.declarationDraft!.logementAmortissement!;
  const plan = { ...housing.plan, totalAnnuelExercice: 0, lignes: housing.plan.lignes.map(line => ({ ...line, dotationExercice: 0 })) };
  state = patch(state, { logementAmortissement: { ...housing, plan } });
  state = await persistAmortissements(state);
  const detail = known(detailOf(state));
  assert.deepEqual(detail.total, { state: "known_amount", amount: 0 });
  assert.notDeepEqual(detail.total, { state: "unknown" });
  assert.ok(detail.lines.every(line => line.dotation === 0));
});

test("K. terrain : valeurTerrain persisté, exposé à part, jamais dans les lignes amorties", async () => {
  const state = await nativeAmortizedState();
  const detail = known(detailOf(state));
  assert.equal(detail.land?.amount, state.declarationDraft!.logementAmortissement!.valeurTerrain);
  assert.ok(detail.lines.every(line => !/terrain/i.test(line.label)));
  assert.ok(!detail.lines.some(line => line.base === detail.land?.amount));
});

test("L. sortie validée + amortissementConfirmedAt : montant confirmé (known_amount)", async () => {
  const state = await nativeAmortizedState();
  assert.ok(state.declarationDraft!.amortissementConfirmedAt);
  assert.equal(known(detailOf(state)).total.state, "known_amount");
});

test("M. sortie validated SANS amortissementConfirmedAt : « à confirmer », jamais confirmée ; détail concordant conservé", async () => {
  const state = patch(await nativeAmortizedState(), { amortissementConfirmedAt: undefined });
  assert.equal(state.declarationDraft!.amortissementAssistant!.status, "validated");
  const detail = known(detailOf(state));
  assert.equal(detail.total.state, "unconfirmed");
  assert.equal(detail.total.state === "unconfirmed" && detail.total.contested, false);
  assert.ok(detail.lines.length > 0);
});

test("N. plan recomposé == total persisté : détail visible", async () => {
  const state = await amortizedWithWorks();
  const detail = known(detailOf(state));
  assert.equal(detail.planFreshness, "consistent");
  assert.ok(detail.lines.length > 0);
  const resolution = resolveF014Plan(workspaceOf(state), "home-1");
  assert.ok(resolution.ok);
  assert.equal(hasAmortissementDrifted(state.declarationDraft!.amortissementAssistant!.totalDotations, resolution.ok ? resolution.plan.total_dotations_exercice : -1), false);
});

test("O. plan recomposé != total persisté : « à revoir », détail masqué, ancien total conservé comme ancienne sortie", async () => {
  const state = await nativeAmortizedState();
  const persisted = state.declarationDraft!.amortissementAssistant!;
  // Écriture directe hors reducer (donc sans invalidation) : l'état qu'un panel ouvert reconnaîtrait comme « dérivé ».
  const drifted = { ...workspaceOf(state), declarationDraft: { ...state.declarationDraft!, amortissementAssistant: { ...persisted, totalDotations: persisted.totalDotations + 100 } } };
  const detail = known(buildV3AmortizationDetail(drifted, "home-1"));
  assert.equal(detail.planFreshness, "drifted");
  assert.deepEqual(detail.total, { state: "stale", amount: persisted.totalDotations + 100 });
  assert.deepEqual(detail.lines, []);
  assert.equal(detail.land, undefined);
});

test("O'. plan non composable (logement effacé) alors qu'une sortie existe : « à revoir », raison exposée, détail masqué", async () => {
  const state = await nativeAmortizedState();
  const ws = { ...workspaceOf(state), declarationDraft: { ...state.declarationDraft!, logementAmortissement: undefined } };
  const detail = known(buildV3AmortizationDetail(ws, "home-1"));
  assert.equal(detail.planFreshness, "unavailable");
  assert.equal(detail.total.state, "stale");
  assert.deepEqual(detail.planBlock, { kind: "housing_plan_missing" });
  assert.deepEqual(detail.lines, []);
});

test("P. F010 modifié (nouvelle sortie logement) : sortie F014 invalidée par le comportement réel → « Non renseigné »", async () => {
  const state = await nativeAmortizedState();
  const housing = state.declarationDraft!.logementAmortissement!;
  const changed = patch(state, { logementAmortissement: { ...housing, prixRevient: housing.prixRevient + 1, computedAt: "2026-04-01T00:00:00.000Z" } });
  assert.equal(changed.declarationDraft!.amortissementAssistant, undefined);
  assert.deepEqual(known(detailOf(changed)).total, { state: "unknown" });
});

test("Q. composant F012 modifié : sortie F014 invalidée par le comportement réel", async () => {
  const state = await amortizedWithWorks();
  const output = state.declarationDraft!.chargesAssistant!;
  const changed = patch(state, { chargesAssistant: { ...output, composantsNouveaux: output.composantsNouveaux.map(item => ({ ...item, montant: item.montant + 500 })) } });
  assert.equal(changed.declarationDraft!.amortissementAssistant, undefined);
  assert.deepEqual(known(detailOf(changed)).total, { state: "unknown" });
});

test("R. date de mise en service modifiée : sortie F014 (et confirmation) invalidées", async () => {
  const state = await nativeAmortizedState();
  const changed = patch(state, { dateMiseEnService: "2025-07-01" });
  assert.equal(changed.declarationDraft!.amortissementAssistant, undefined);
  assert.equal(changed.declarationDraft!.amortissementConfirmedAt, undefined);
  assert.deepEqual(known(detailOf(changed)).total, { state: "unknown" });
});

test("S. reprise comptable : le total F014 du draft n'est jamais présenté ; aucun détail, aucun terrain", async () => {
  const native = await nativeAmortizedState();
  const state = takeoverState(native);
  assert.ok(state.declarationDraft!.amortissementAssistant!.totalDotations > 0, "un total draft existe bel et bien");
  const detail = known(detailOf(state));
  assert.deepEqual(detail.entry, { kind: "takeover", openingAssets: { attributed: 1, unattributed: 0 } });
  assert.deepEqual(detail.total, { state: "takeover" });
  assert.deepEqual(detail.lines, []);
  assert.equal(detail.land, undefined);
  assert.equal(totalAmount(detail), undefined);
  assert.ok(!JSON.stringify(detail).includes(String(state.declarationDraft!.amortissementAssistant!.totalDotations)));
});

test("T. reprise + nouvel actif F012 : aucun total consolidé, aucune ligne", async () => {
  const state = takeoverState(await amortizedWithWorks());
  assert.equal(state.declarationDraft!.chargesAssistant!.composantsNouveaux.length, 1);
  const detail = known(detailOf(state));
  assert.deepEqual(detail.total, { state: "takeover" });
  assert.deepEqual(detail.lines, []);
  const serialized = JSON.stringify(detail);
  assert.ok(!serialized.includes(String(state.declarationDraft!.amortissementAssistant!.totalDotations)));
  assert.ok(!serialized.includes("Cuisine"));
});

test("S'. reprise déclarée non validée, ou continuité de reprise : jamais de total draft non plus (fail-closed)", async () => {
  const native = await nativeAmortizedState();
  const declared: LmnpState = { ...native, fiscalYear: { ...native.fiscalYear, priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: "x" } } };
  assert.deepEqual(known(detailOf(declared)).total, { state: "takeover" });
  const continued: LmnpState = { ...native, fiscalYear: { ...native.fiscalYear, repriseHistoriqueEnContinuite: true } };
  assert.deepEqual(known(detailOf(continued)).total, { state: "takeover" });
});

test("U/V/W. propertyId absent, faux, hors exercice : scope_unresolved, rien d'exposé", async () => {
  const state = await nativeAmortizedState();
  for (const id of [null, undefined, "", "   "] as const) {
    assert.deepEqual(buildV3AmortizationDetail(workspaceOf(state), id), { state: "scope_unresolved", reason: "no_property_id", year: HOUSING_YEAR });
  }
  assert.deepEqual(detailOf(state, "nope"), { state: "scope_unresolved", reason: "unknown_property", year: HOUSING_YEAR });
  const outside: LmnpState = { ...state, properties: [...state.properties, property("home-2")] };
  assert.deepEqual(detailOf(outside, "home-2"), { state: "scope_unresolved", reason: "not_in_fiscal_year", year: HOUSING_YEAR });
  assert.equal(resolveF014Plan(workspaceOf(state), null).ok, false);
});

test("X. multi-biens : facts_only — aucun total, plan, composant ni base attribués au bien", async () => {
  const native = await nativeAmortizedState();
  const multi: LmnpState = {
    ...native,
    properties: [...native.properties, property("home-2", { amortissementBase: { composants: [{ id: "old", label: "Ancien", montant: 100, dureeAnnees: 10, dotationAnnuelle: 10, nature: "amélioration", dateDebut: "2020-01-01", origin: "f012_travaux" }], dateMiseEnService: "2020-01-01" } as never })],
    fiscalYear: { ...native.fiscalYear, propertyIds: ["home-1", "home-2"] },
  };
  for (const id of ["home-1", "home-2"]) {
    const detail = known(detailOf(multi, id));
    assert.equal(detail.support, "facts_only");
    assert.deepEqual(detail.total, { state: "not_attributable" });
    assert.deepEqual(detail.lines, []);
    assert.equal(detail.land, undefined);
    assert.deepEqual(resolveF014Plan(workspaceOf(multi), id), { ok: false, reason: { kind: "not_attributable" } });
  }
});

test("Y. non-mutation : le workspace est identique avant/après lecture et résolution du plan", async () => {
  const workspace = workspaceOf(await amortizedWithWorks());
  const before = structuredClone(workspace);
  buildV3AmortizationDetail(workspace, "home-1");
  resolveF014Plan(workspace, "home-1");
  assert.deepEqual(workspace, before);
});

test("Z. oracle : le montant exposé est EXACTEMENT amortissementAssistant.totalDotations (jamais la somme des lignes)", async () => {
  for (const state of [await nativeAmortizedState(), await amortizedWithWorks(), await amortizedWithFurniture()]) {
    const detail = known(detailOf(state));
    assert.equal(totalAmount(detail), state.declarationDraft!.amortissementAssistant!.totalDotations);
  }
});

test("AA. oracle seam : le plan de la seam == plan du vrai F014 avec les mêmes dépendances que le panel", async () => {
  for (const state of [await nativeAmortizedState(), await amortizedWithWorks(), await amortizedWithFurniture()]) {
    const resolution = resolveF014Plan(workspaceOf(state), "home-1");
    assert.ok(resolution.ok);
    const engine = f014AssistantFor(state).start().state;
    assert.deepEqual(resolution.ok && resolution.plan, engine.plan);
    assert.equal(resolution.ok && resolution.profil, engine.profil);
    assert.deepEqual(resolution.ok && resolution.deps, panelDeps(state));
  }
});

test("AA'. les dépendances de la seam sont celles du panel : le source du panel les assemble de la même façon", () => {
  const panel = readFileSync(path.join(process.cwd(), "src/components/lmnp/assistants/F014AmortissementsAssistantPanel.tsx"), "utf8");
  for (const expression of [
    "dateMiseEnService: draft?.dateMiseEnService",
    "planLogement: draft?.logementAmortissement?.plan",
    "prorataRatio: draft?.logementAmortissement?.prorataRatio",
    "planValidePrecedemment: Boolean(draft?.amortissementAssistant?.validatedAt)",
    "anneeValidationInitiale: draft?.amortissementAssistant?.anneeValidationInitiale ?? null",
    "mergeComposantsF012(draft?.chargesAssistant?.composantsNouveaux, amortissementBase)",
  ]) assert.ok(panel.includes(expression), `le panel a changé : ${expression}`);
});

test("AB. date absente / en conflit : la seam est fail-closed, aucune date inventée", async () => {
  const state = await nativeAmortizedState();
  const noDate = patch(state, { dateMiseEnService: undefined });
  assert.deepEqual(resolveF014Plan(workspaceOf(noDate), "home-1"), { ok: false, reason: { kind: "service_date", status: "absent" } });
  const conflict: LmnpState = { ...state, properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2024-05-02" } })] };
  assert.deepEqual(resolveF014Plan(workspaceOf(conflict), "home-1"), { ok: false, reason: { kind: "service_date", status: "conflict" } });
  assert.deepEqual(known(detailOf(conflict)).planBlock, { kind: "service_date", status: "conflict" });
});

test("AB'. date connue seulement par la base du bien (le panel n'aurait pas de date) : fail-closed", async () => {
  const state = await nativeAmortizedState();
  const baseOnly: LmnpState = {
    ...state,
    declarationDraft: { ...state.declarationDraft!, dateMiseEnService: undefined },
    properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2025-06-01" } })],
  };
  assert.deepEqual(resolveF014Plan(workspaceOf(baseOnly), "home-1"), { ok: false, reason: { kind: "service_date", status: "not_in_draft" } });
});

test("AB''. la base reportée d'un exercice antérieur est lue sur CE bien (jamais properties[0]) et marquée « reportée »", async () => {
  const state = await nativeAmortizedState();
  const carried = { id: "old-1", label: "Ancienne cuisine", montant: 2000, dureeAnnees: 10, dotationAnnuelle: 200, nature: "amélioration", dateDebut: "2023-01-01", origin: "f012_travaux" };
  const withBase: LmnpState = {
    ...state,
    properties: [property("home-1", { amortissementBase: { composants: [carried], dateMiseEnService: SERVICE } as never })],
  };
  const resolution = resolveF014Plan(workspaceOf(withBase), "home-1");
  assert.ok(resolution.ok && resolution.plan.nouveaux_elements.some(item => item.id === "old-1"));
  // La sortie persistée ne contient pas ce composant : dérive détectée, jamais d'ancien détail présenté.
  const detail = known(detailOf(withBase));
  assert.equal(detail.planFreshness, "drifted");
  assert.deepEqual(detail.lines, []);
});
const SERVICE = "2025-06-01";

test("garde source : aucune référence à properties[0] / propertyIds[0] dans le nouveau code V3", () => {
  const files = [
    "src/lab/v2-dossier/amortization-plan-seam.ts",
    "src/lab/v2-dossier/amortization-detail-read-model.ts",
    "src/lab/v3-dossier/amortization-view-model.ts",
    "src/lab/v3-dossier/RealAmortization.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /properties\[0\]|propertyIds\[0\]|\.at\(0\)/, file);
  }
});

test("garde source : la V3 ne recalcule ni terrain, ni base, ni durée, ni dotation, ni prorata (aucun moteur F010 / Opening importé)", () => {
  const files = [
    "src/lab/v2-dossier/amortization-plan-seam.ts",
    "src/lab/v2-dossier/amortization-detail-read-model.ts",
    "src/lab/v3-dossier/amortization-view-model.ts",
    "src/lab/v3-dossier/RealAmortization.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /computeAmortizationPlan|decomposeBati|amortizeMobilier|prorataPremiereAnnee|assemblePlan|resolveOpeningDepreciation|continueTakeoverSnapshot|ratioTerrain|round2|produceFiscalResult/, file);
    assert.doesNotMatch(source, /fixtures|\.\/model|V3Prototype/, file);
  }
  const seam = readFileSync(path.join(process.cwd(), "src/lab/v2-dossier/amortization-plan-seam.ts"), "utf8");
  assert.match(seam, /composePlanAmortissement\(/);
  assert.doesNotMatch(seam, /mapComposantNouveau|function composePlan/);
});

test("comptable ≠ fiscal : le read model ne lit jamais F006 (fiscalResult / amortDeduct) — F014 totalDotations n'est pas amortDeduct", async () => {
  const source = readFileSync(path.join(process.cwd(), "src/lab/v2-dossier/amortization-detail-read-model.ts"), "utf8");
  assert.doesNotMatch(source, /fiscalResult|amortDeduct|amortNonDeduit/);
  // Un résultat fiscal F006 plafonné n'altère pas la dotation calculée restituée.
  const state = await nativeAmortizedState();
  const total = state.declarationDraft!.amortissementAssistant!.totalDotations;
  const capped = patch(state, {
    fiscalResult: { exercice: HOUSING_YEAR, amortDeduct: Math.round(total / 2), amortNonDeduitExercice: total - Math.round(total / 2), trace: { journal: [] } },
  });
  void NOW;
  assert.deepEqual(known(detailOf(capped)).total, { state: "known_amount", amount: total });
});
