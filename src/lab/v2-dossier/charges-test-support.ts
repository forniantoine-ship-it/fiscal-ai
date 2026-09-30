/**
 * R15.7 — fabriques de test Charges. Les sorties F012 sont produites par l'assistant F012 RÉEL, puis persistées avec le
 * reducer RÉEL et les mêmes écritures que le panel (`persistCompletion`) : `chargesAssistantState` (avec registre),
 * `chargesAssistant` (`buildChargesAssistantOutput`) et `chargesConfirmedAt`, tous horodatés au même instant.
 */
import "./test-public-env";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { buildChargesAssistantOutput } from "@/lib/lmnp/services/f012/charges-assistant-output";
import { F012ChargesAssistant } from "@/runtime/assistants/f012-charges/assistant";
import { expensesFromTaxeFonciereCorpus } from "@/runtime/assistants/f012-charges/expense-from-taxe-fonciere";
import { toF012PersistedStateWithRegistry } from "@/runtime/assistants/f012-charges/collected-to-registry";
import type { F012Action, F012Deps, F012State } from "@/runtime/assistants/f012-charges/types";
import { HOUSING_YEAR, NOW, SERVICE_DATE } from "./housing-test-support";

export { HOUSING_YEAR, NOW, SERVICE_DATE };
/** F009 completion time: before the F012 computation, so the date is demonstrably the one F012 read. */
export const F009_CONFIRMED_AT = "2026-02-15T10:00:00.000Z";

export const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };

export const chargesAssistantFor = (deps: F012Deps = { dateMiseEnService: SERVICE_DATE }) =>
  new F012ChargesAssistant({ dossierId: "fy-2025", fiscalYear: HOUSING_YEAR, route: "/assistants/charges" }, deps);

export async function step(assistant: F012ChargesAssistant, state: F012State, action: F012Action): Promise<F012State> {
  return (await assistant.handle(state, action)).state;
}

/** Real flow: taxe foncière 1 200, assurance PNO 150, no bank fees, no other charge — then the final confirmation. */
export async function simpleCharges(assistant = chargesAssistantFor()): Promise<F012State> {
  let state = await step(assistant, assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  state = await step(assistant, state, { type: "submit_taxe_fonciere", montant: 1200 });
  state = await step(assistant, state, { type: "submit_assurance_pno", montant: 150 });
  state = await step(assistant, state, { type: "skip_category" }); // frais_bancaires
  state = await step(assistant, state, { type: "skip_category" }); // divers
  return confirmAll(assistant, state);
}

/** Real flow with nothing left open: every family answered (amounts typed, or « rien payé »). */
export async function completeCharges(opts: { nothingPaid?: boolean } = {}): Promise<F012State> {
  const assistant = chargesAssistantFor();
  let state = await step(assistant, assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  if (opts.nothingPaid) {
    while (state.step === "category_collect") state = await step(assistant, state, { type: "none_category" });
  } else {
    state = await step(assistant, state, { type: "submit_taxe_fonciere", montant: 1200 });
    state = await step(assistant, state, { type: "submit_assurance_pno", montant: 150 });
    while (state.step === "category_collect") state = await step(assistant, state, { type: "none_category" });
  }
  return confirmAll(assistant, state);
}

async function confirmAll(assistant: F012ChargesAssistant, state: F012State): Promise<F012State> {
  let next = state;
  if (next.step === "completeness") next = await step(assistant, next, { type: "confirm_completeness", hasOther: false });
  const done = await assistant.handle(next, { type: "confirm_all" });
  if (!done.completed) throw new Error(`F012 did not complete (step ${done.state.step})`);
  return done.state;
}

/** Real F011 overlap: an "Assurance emprunteur" line of 300 declared in "divers" while F011 already counted 300. */
export async function chargesWithFinancingOverlap(): Promise<F012State> {
  const assistant = chargesAssistantFor({ dateMiseEnService: SERVICE_DATE, financementCharges: { totalAssurance: 300, totalCapitalRembourse: 5000, exerciceFiscal: HOUSING_YEAR } });
  let state = await step(assistant, assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  state = await step(assistant, state, { type: "submit_taxe_fonciere", montant: 1200 });
  state = await step(assistant, state, { type: "skip_category" }); // assurance_pno
  state = await step(assistant, state, { type: "skip_category" }); // frais_bancaires
  state = await step(assistant, state, { type: "submit_divers", description: "Assurance emprunteur", montant: 300 });
  return confirmAll(assistant, state);
}

/** Real flow: an improvement work (qualified "amélioration") is oriented toward amortization, not deducted. */
export async function chargesWithAmortizableWorks(): Promise<F012State> {
  const assistant = chargesAssistantFor();
  let state = await step(assistant, assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE, travaux: true });
  state = await step(assistant, state, { type: "submit_taxe_fonciere", montant: 1200 });
  while (state.step === "category_collect" && state.categoryInventory[state.currentCategoryIndex] !== "travaux") {
    state = await step(assistant, state, { type: "skip_category" });
  }
  state = await step(assistant, state, { type: "start_travaux" });
  state = await step(assistant, state, { type: "submit_travaux_description", description: "Cuisine équipée", montant: 5000 });
  state = await step(assistant, state, { type: "submit_travaux_qualification", choix: "amelioration" });
  state = await step(assistant, state, { type: "submit_travaux_date", dateDebut: "2025-03-15" });
  state = await step(assistant, state, { type: "finish_travaux_category" });
  while (state.step === "category_collect") state = await step(assistant, state, { type: "skip_category" });
  return confirmAll(assistant, state);
}

/** Same writes as the panel's `persistCompletion` (session + output at the same instant, then the confirmation). */
export function persistCharges(
  state: LmnpState, finalState: F012State, opts: { confirmed?: boolean; at?: string } = {},
): LmnpState {
  const result = finalState.result;
  if (!result) throw new Error("F012 state has no result");
  const at = opts.at ?? NOW;
  return lmnpReducer(state, {
    type: "DECLARATION_PATCH_DRAFT",
    patch: {
      chargesAssistantState: toF012PersistedStateWithRegistry(finalState, at, HOUSING_YEAR),
      chargesAssistant: buildChargesAssistantOutput(result.charges, finalState.fieldSources, at),
      ...(opts.confirmed === false ? {} : { chargesConfirmedAt: at }),
    },
  });
}

/** Later session write (resume, edit): same content, new `updatedAt` — the output is left as it was. */
export function rewriteChargesSession(state: LmnpState, at = "2026-03-02T09:00:00.000Z"): LmnpState {
  const session = state.declarationDraft?.chargesAssistantState;
  if (!session) throw new Error("no F012 session");
  return lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", patch: { chargesAssistantState: { ...session, updatedAt: at } } });
}

/** Real document path: a taxe foncière notice (net 1 500) read into an Expense, then confirmed by the user. */
export async function chargesFromTaxDocument(documentId = "doc-tf", assistant = chargesAssistantFor()): Promise<F012State> {
  const corpus = `\nAvis de taxe foncière — Année ${HOUSING_YEAR}\nNet à payer : 1 500,00 EUR\nPayé le 12/03/${HOUSING_YEAR}\n`;
  const [expense] = expensesFromTaxeFonciereCorpus({ corpus, documentId, fiscalYear: HOUSING_YEAR });
  if (!expense) throw new Error("no expense read from the notice");
  let state = await step(assistant, assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  state = await step(assistant, state, { type: "receive_taxe_fonciere_expense", expense });
  state = await step(assistant, state, { type: "confirm_taxe_fonciere_expense" });
  while (state.step === "category_collect") state = await step(assistant, state, { type: "skip_category" });
  return confirmAll(assistant, state);
}
