/**
 * R15.6 — fabriques de test Revenus. Les sorties F013 sont produites par l'assistant F013 RÉEL (canal conversationnel)
 * et par le pont documentaire RÉEL (`buildRevenusAssistantFromSession`), puis persistées avec le reducer RÉEL et les
 * mêmes écritures que le panel (`persistCompletion`) / l'étape documentaire (`handleConfirm`).
 */
import "./test-public-env";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { sessionToExtractionData } from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import type { RevenueGptSession, RevenueTransaction } from "@/lib/lmnp/types/domain";
import { F013RevenusAssistant } from "@/runtime/assistants/f013-revenus/assistant";
import type { F013Action, F013State } from "@/runtime/assistants/f013-revenus/types";
import { HOUSING_YEAR, NOW, SERVICE_DATE } from "./housing-test-support";

export { HOUSING_YEAR, NOW, SERVICE_DATE };
/** F009 completion time: before the F013 computation, so the date is demonstrably the one F013 read. */
export const F009_CONFIRMED_AT = "2026-02-15T10:00:00.000Z";

export const assistantFor = (dateMiseEnService: string | undefined = SERVICE_DATE) =>
  new F013RevenusAssistant({ dossierId: "fy-2025", fiscalYear: HOUSING_YEAR, route: "/assistants/revenus" }, { dateMiseEnService });
/** F009 precondition not satisfied: F013 falls back internally on a historical default date. */
export const assistantWithoutDate = () =>
  new F013RevenusAssistant({ dossierId: "fy-2025", fiscalYear: HOUSING_YEAR, route: "/assistants/revenus" }, {});

const run = async (assistant: F013RevenusAssistant, state: F013State, action: F013Action) => (await assistant.handle(state, action)).state;

/** Real conversational flow: monthly rent 800, 5 600 declared over 7 months from 2025-06-01, January carry-over = +800. */
export async function conversationalConfirmed(assistant = assistantFor()): Promise<F013State> {
  let state = assistant.start().state;
  state = await run(assistant, state, { type: "submit_diagnostic", typeLocation: "longue_duree", continuiteBail: "un_locataire", modeCharges: "charges_comprises" });
  state = await run(assistant, state, { type: "submit_loyer", loyerMensuel: 800 });
  state = await run(assistant, state, { type: "submit_declaration", montant: 5600 });
  state = await run(assistant, state, { type: "submit_decalage", janvierOui: true, decembreOui: false });
  const done = await assistant.handle(state, { type: "confirm_all" });
  if (!done.completed) throw new Error("F013 did not complete");
  return done.state;
}

/** Same writes as the panel's `persistCompletion`. */
export function persistConversational(state: LmnpState, finalState: F013State, opts: { confirmed?: boolean } = {}): LmnpState {
  const result = finalState.result;
  if (!result) throw new Error("F013 state has no result");
  const next = lmnpReducer(state, {
    type: "DECLARATION_PATCH_DRAFT",
    patch: {
      revenusAssistant: {
        exerciceFiscal: result.recettes.exerciceFiscal,
        totalRecettes: result.recettes.totalRecettes,
        loyersEncaisses: result.recettes.loyersEncaisses,
        indemnitesAssurance: result.recettes.indemnitesAssurance,
        recettesPlateforme: result.recettes.recettesPlateforme,
        ajustementsJanDec: result.recettes.ajustementsJanDec,
        moisLocationEffectifs: result.recettes.moisLocationEffectifs,
        revenuTheorique: result.recettes.revenuTheorique?.montantAttendu,
        fieldSources: finalState.fieldSources,
        computedAt: NOW,
        anomalies: result.anomalies,
      },
      ...(opts.confirmed === false ? {} : { revenusConfirmedAt: NOW }),
    },
  });
  return next;
}

export const transaction = (over: Partial<RevenueTransaction> & Pick<RevenueTransaction, "id" | "amount" | "category" | "date">): RevenueTransaction => ({
  description: over.id, direction: "credit", ...over,
});

export function documentSession(transactions: RevenueTransaction[], propertyId = "home-1", label = "Logement home-1"): RevenueGptSession {
  return { mode: "upload", properties: [{ id: `session-${propertyId}`, label, propertyId, rows: [], transactions }] };
}

export const DEFAULT_TRANSACTIONS = (): RevenueTransaction[] => [
  transaction({ id: "t1", amount: 700, category: "rent", date: "2025-03-05" }),
  transaction({ id: "t2", amount: 700, category: "rent", date: "2025-04-05" }),
  transaction({ id: "t3", amount: 300, category: "platform_payout", date: "2025-05-10" }),
  transaction({ id: "t4", amount: 120, category: "insurance_indemnity", date: "2025-06-01" }),
];

/**
 * Same writes, in the same order, as `RevenusDocumentStep.handleConfirm`: `CONFIRM_REVENUS`, then the bridge output patch.
 * Observed with the real reducer: that second patch changes `revenusAssistant` without carrying `revenusConfirmedAt`, so the
 * downstream invalidation (E) clears the confirmation the first dispatch just set. `confirmAfterBridge` models a state where
 * the confirmation is present anyway (older data, or any later write of `revenusConfirmedAt`).
 */
export function persistDocumentChannel(
  state: LmnpState, session: RevenueGptSession, documentIds: string[],
  opts: { confirmed?: boolean; date?: string | undefined; confirmAfterBridge?: boolean } = {},
): LmnpState {
  const bridged = buildRevenusAssistantFromSession(session, HOUSING_YEAR, "date" in opts ? opts.date : SERVICE_DATE);
  let next = state;
  if (opts.confirmed !== false) {
    next = lmnpReducer(next, { type: "CONFIRM_REVENUS", extraction: sessionToExtractionData(session, HOUSING_YEAR), session, documentIds });
  }
  next = lmnpReducer(next, {
    type: "DECLARATION_PATCH_DRAFT",
    patch: { revenusAssistant: { ...bridged.revenusAssistant, computedAt: NOW, anomalies: bridged.anomalies } },
  });
  return opts.confirmAfterBridge ? lmnpReducer(next, { type: "DECLARATION_PATCH_DRAFT", patch: { revenusConfirmedAt: NOW } }) : next;
}
