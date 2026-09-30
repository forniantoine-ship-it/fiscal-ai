/**
 * R15.8 — fabriques de test Amortissements. Le logement (F010) et les travaux (F012) sont produits par les assistants
 * RÉELS ; la sortie F014 l'est par l'assistant F014 RÉEL alimenté par les MÊMES dépendances que le panel
 * (`panelDeps`, recopie littérale de `F014AmortissementsAssistantPanel`) puis persistée avec le reducer RÉEL et les
 * mêmes écritures que `persistCompletion` du panel.
 */
import "./test-public-env";
import { mergeComposantsF012 } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { F014AmortissementsAssistant } from "@/runtime/assistants/f014-amortissements/assistant";
import type { F014Deps } from "@/runtime/assistants/f014-amortissements/types";
import { chargesWithAmortizableWorks, persistCharges } from "./charges-test-support";
import { HOUSING_YEAR, NOW, SERVICE_DATE, assistantFor, confirmedState, handle, persistCompletion, stateOf } from "./housing-test-support";

export { HOUSING_YEAR, NOW };

/** Dépendances F014 exactement telles que le panel les assemble (`properties[0]` compris : les tests sont mono-bien). */
export function panelDeps(state: LmnpState): F014Deps {
  const draft = state.declarationDraft;
  const amortissementBase = state.properties[0]?.amortissementBase;
  const composantsNouveaux = mergeComposantsF012(draft?.chargesAssistant?.composantsNouveaux, amortissementBase);
  return {
    dateMiseEnService: draft?.dateMiseEnService,
    planLogement: draft?.logementAmortissement?.plan,
    prorataRatio: draft?.logementAmortissement?.prorataRatio,
    composantsNouveaux,
    planValidePrecedemment: Boolean(draft?.amortissementAssistant?.validatedAt),
    anneeValidationInitiale: draft?.amortissementAssistant?.anneeValidationInitiale ?? null,
  };
}

export const f014AssistantFor = (state: LmnpState) =>
  new F014AmortissementsAssistant(
    { dossierId: state.fiscalYear.id, fiscalYear: state.fiscalYear.year, route: "/assistants/amortissements" },
    panelDeps(state),
  );

/** Real F014 confirmation persisted like the panel (`persistCompletion`). `at` dates the validation. */
export async function persistAmortissements(state: LmnpState, opts: { at?: string; confirmed?: boolean } = {}): Promise<LmnpState> {
  const assistant = f014AssistantFor(state);
  const start = assistant.start();
  const done = await assistant.handle(start.state, { type: "confirm" });
  const result = done.state.result;
  if (!done.completed || !result) throw new Error(`F014 did not complete (step ${done.state.step})`);
  const validatedAt = opts.at ?? result.validation.validated_at;
  const patch: Record<string, unknown> = {
    ...(opts.confirmed === false ? {} : { amortissementConfirmedAt: validatedAt }),
    amortissementAssistant: {
      exerciceFiscal: result.validation.exercice,
      totalDotations: result.validation.total_dotations,
      status: result.validation.status,
      planVersion: result.validation.plan_version,
      profil: result.profil,
      validatedAt,
      anneeValidationInitiale:
        result.profil === "PROF-001"
          ? result.validation.exercice
          : state.declarationDraft?.amortissementAssistant?.anneeValidationInitiale ?? result.validation.exercice,
    },
  };
  const next = lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", patch });
  return lmnpReducer(next, { type: "DECLARATION_COMPLETE_STEP", stepId: "amortissement-assistant" });
}

/** F010 confirmed (manual path) → F014 confirmed. */
export async function nativeAmortizedState(over: Parameters<typeof confirmedState>[0] = {}): Promise<LmnpState> {
  return persistAmortissements(await confirmedState(over));
}

/** F010 confirmed → F012 qualifies a 5 000 € kitchen as an improvement (oriented to amortization) → F014 confirmed. */
export async function amortizedWithWorks(over: Parameters<typeof confirmedState>[0] = {}): Promise<LmnpState> {
  const housing = await confirmedState(over);
  const withCharges = persistCharges(housing, await chargesWithAmortizableWorks());
  return persistAmortissements(withCharges);
}

/** F010 confirmed WITH a furniture lot of 8 000 € (real `submit_mobilier`, mode « lot ») → F014 confirmed. */
export async function amortizedWithFurniture(): Promise<LmnpState> {
  const assistant = assistantFor();
  let state = assistant.start().state;
  state = await handle(assistant, state, { type: "select_nature", nature: "achat" });
  state = await handle(assistant, state, {
    type: "submit_bien", prixAcquisition: 200000, typeBien: "appartement", dateAcquisition: "2025-03-10", surface: 45,
    fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual", surface: "manual" },
  });
  state = await handle(assistant, state, { type: "submit_frais", fraisNotaire: 15000, choixTraitementFrais: "integration" });
  state = await handle(assistant, state, { type: "submit_mobilier", montantMobilier: 8000, mode: "lot" });
  state = await handle(assistant, state, { type: "submit_ventilation", ratioTerrain: 0.15 });
  const done = await assistant.handle(state, { type: "confirm" });
  if (!done.completed) throw new Error("F010 did not complete");
  return persistAmortissements(persistCompletion(stateOf({ draft: { dateMiseEnService: SERVICE_DATE } }), done.state));
}
