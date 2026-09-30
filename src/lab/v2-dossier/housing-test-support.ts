/**
 * R15.5 — fabriques de test Logement. Les états F010 sont produits par l'assistant F010 RÉEL (achat, saisie ou analyse d'un
 * acte), puis persistés avec le reducer RÉEL et les mêmes écritures que le panel (`persistCompletion` / `persistSession`).
 */
import "./test-public-env";
import type { LmnpDocument, Property } from "@/lib/lmnp/types";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { F010ActePrefill } from "@/lib/lmnp/services/f010/acte-to-assistant";
import { F010LogementAssistant } from "@/runtime/assistants/f010-logement/assistant";
import { toF010PersistedState, type F010Action, type F010State } from "@/runtime/assistants/f010-logement/types";

export const HOUSING_YEAR = 2025;
export const NOW = "2026-03-01T10:00:00.000Z";
export const SERVICE_DATE = "2025-06-01";

export const property = (id: string, over: Partial<Property> = {}): Property => ({
  id, label: `Logement ${id}`, address: "1 rue Test", city: "Lyon", postalCode: "69001", ...over,
});

export function docRow(id: string, fileName: string): LmnpDocument {
  return {
    id, fiscalYearId: "fy-2025", fiscalYear: HOUSING_YEAR, fileName, mimeType: "application/pdf", sizeBytes: 100,
    category: "autre", documentType: "unknown", status: "analyzed", uploadedAt: "2026-02-01",
  };
}

export function stateOf(opts: {
  properties?: Property[];
  propertyIds?: string[];
  documents?: LmnpDocument[];
  draft?: Partial<DeclarationDraft>;
  fiscalYear?: Partial<PersistedWorkspace["fiscalYear"]>;
} = {}): LmnpState {
  const properties = opts.properties ?? [property("home-1")];
  return {
    fiscalYear: {
      id: "fy-2025", dossierId: "dossier-1", year: HOUSING_YEAR, status: "draft", regime: "reel",
      propertyIds: opts.propertyIds ?? properties.map(item => item.id), createdAt: "2026-01-01", updatedAt: "2026-01-01",
      ...opts.fiscalYear,
    },
    properties,
    documents: opts.documents ?? [],
    extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { completedSteps: [], ...opts.draft },
    fileRegistry: new Map(),
  };
}

export function workspaceOf(state: LmnpState): PersistedWorkspace {
  const { fileRegistry: _ignored, ...workspace } = state;
  void _ignored;
  return workspace;
}

export const assistantFor = (dateMiseEnService: string | undefined = SERVICE_DATE) =>
  new F010LogementAssistant({ dossierId: "fy-2025", fiscalYear: HOUSING_YEAR, route: "/assistants/logement" }, { dateMiseEnService });

/** F009 precondition not satisfied: F010 has no service date (the real blocking case). */
export const assistantWithoutDate = () =>
  new F010LogementAssistant({ dossierId: "fy-2025", fiscalYear: HOUSING_YEAR, route: "/assistants/logement" }, {});

export const handle = async (assistant: F010LogementAssistant, state: F010State, action: F010Action) => (await assistant.handle(state, action)).state;

export const PROPOSAL: F010ActePrefill = {
  prixAcquisition: 200000, fraisNotaire: 15000, dateAcquisition: "2025-03-10", surface: 45, typeBien: "appartement",
  adresse: "12 rue du Port, 33000 Bordeaux",
};

/** Real manual flow up to the plan review (every answer typed by the user). */
export async function manualToReview(assistant: F010LogementAssistant): Promise<F010State> {
  let state = assistant.start().state;
  state = await handle(assistant, state, { type: "select_nature", nature: "achat" });
  state = await handle(assistant, state, {
    type: "submit_bien", prixAcquisition: 200000, typeBien: "appartement", dateAcquisition: "2025-03-10", surface: 45,
    fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual", surface: "manual" },
  });
  state = await handle(assistant, state, { type: "submit_frais", fraisNotaire: 15000, choixTraitementFrais: "integration" });
  state = await handle(assistant, state, { type: "skip_mobilier" });
  state = await handle(assistant, state, { type: "submit_ventilation", ratioTerrain: 0.15 });
  return state;
}

/** Real document flow: an acte is analysed and every proposal is confirmed, one correction included when asked. */
export async function analysedThenReview(assistant: F010LogementAssistant, documentId = "doc-acte", proposal: F010ActePrefill = PROPOSAL): Promise<F010State> {
  let state = assistant.start().state;
  state = await handle(assistant, state, { type: "select_nature", nature: "achat" });
  return handle(assistant, state, { type: "analysis_success", documentId, proposal });
}

/** Same writes as the panel's `persistSession`. */
export function persistSession(state: LmnpState, f010: F010State, analyzingDocumentId?: string): LmnpState {
  return lmnpReducer(state, {
    type: "DECLARATION_PATCH_DRAFT",
    patch: { logementAssistantState: toF010PersistedState(f010, NOW, undefined, analyzingDocumentId) },
  });
}

/** Same writes as the panel's `persistCompletion`, through the real reducer. */
export function persistCompletion(state: LmnpState, finalState: F010State): LmnpState {
  const r = finalState.result;
  if (!r) throw new Error("F010 state has no result");
  let next = lmnpReducer(state, {
    type: "CONFIRM_LOGEMENT_PROFILE",
    profile: {
      propertyType: finalState.typeBien === "maison" ? "maison" : finalState.typeBien === "autre" ? "non-classe" : "appartement",
      surface: finalState.surface,
      acquisitionDate: finalState.dateAcquisition,
      address: finalState.adresse,
    },
    backgroundExtraction: {
      acquisitionPrice: finalState.prixAcquisition, notaryFees: finalState.fraisNotaire, furnitureAmount: finalState.montantMobilier,
    },
  });
  const logementAmortissement = {
    exerciceFiscal: HOUSING_YEAR,
    prixRevient: r.prixRevient, fraisEnCharges: r.fraisEnCharges, valeurTerrain: r.valeurTerrain, valeurBati: r.valeurBati,
    baseAmortissableBati: r.baseAmortissableBati, montantMobilier: r.montantMobilierIsole, dotationAnnuelle: r.dotationAnnuelle,
    dureeMoyenneAnnees: r.dureeMoyenneAnnees, prorataRatio: r.prorataRatio, plan: r.plan, fieldSources: finalState.fieldSources,
    computedAt: NOW,
  };
  next = lmnpReducer(next, { type: "DECLARATION_PATCH_DRAFT", patch: { logementAmortissement } });
  next = lmnpReducer(next, { type: "DECLARATION_COMPLETE_STEP", stepId: "logement-assistant" });
  return lmnpReducer(next, {
    type: "DECLARATION_PATCH_DRAFT",
    patch: { logementAssistantState: toF010PersistedState(finalState, NOW), logementAmortissement, logementConfirmedAt: NOW },
  });
}

/** Real confirmed dossier (manual path). */
export async function confirmedState(over: Parameters<typeof stateOf>[0] = {}): Promise<LmnpState> {
  const assistant = assistantFor();
  const review = await manualToReview(assistant);
  const done = await assistant.handle(review, { type: "confirm" });
  if (!done.completed) throw new Error("F010 did not complete");
  return persistCompletion(stateOf({ ...over, draft: { dateMiseEnService: SERVICE_DATE, ...over.draft } }), done.state);
}
