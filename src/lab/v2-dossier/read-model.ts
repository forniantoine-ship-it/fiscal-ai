import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { readActiviteFieldProvenance } from "@/lib/lmnp/services/activite-field-provenance";
import { buildDossierSteps } from "@/lib/lmnp/services/validation-profile";

export type V3DomainId = "activity" | "property" | "financing" | "revenues" | "charges" | "depreciation";
export type V3DomainStatus = "complete" | "incomplete" | "unsupported";
export type V3ProvenanceLevel = "complete" | "partial" | "unavailable";

export interface V3Fact {
  id: string;
  label: string;
  value: string | null;
  evidence?: string;
  confidence?: number;
}

export interface V3DomainReadModel {
  id: V3DomainId;
  label: string;
  owner: string;
  status: V3DomainStatus;
  summary: string;
  facts: V3Fact[];
  sources: { id: string; label: string }[];
  provenance: V3ProvenanceLevel;
  missing: string[];
}

export interface V3DossierDetailReadModel {
  activity: V3DomainReadModel;
  // F010–F014 deliberately have no projection in V3-R1.
}

export type V3PrototypeSource = { mode: "demo" } | { mode: "real"; workspace: PersistedWorkspace };

export function resolveV3Activity(source: V3PrototypeSource): V3DomainReadModel | undefined {
  return source.mode === "real" ? buildV3DossierDetailReadModel(source.workspace).activity : undefined;
}

function known(value: string | undefined): string | null {
  return value?.trim() || null;
}

export function buildV3DossierDetailReadModel(workspace: PersistedWorkspace): V3DossierDetailReadModel {
  const emptyFacts: V3Fact[] = [
    { id: "identity", label: "Exploitant", value: null },
    { id: "activityType", label: "Activité", value: null },
    { id: "siren", label: "SIREN", value: null },
    { id: "siret", label: "SIRET", value: null },
    { id: "regime", label: "Régime", value: null },
    { id: "startDate", label: "Début d’activité", value: null },
  ];

  // The first bridge is explicitly mono-property: never project a partial aggregate.
  if (workspace.properties.length > 1 || workspace.fiscalYear.propertyIds.length > 1) {
    return { activity: {
      id: "activity", label: "Activité", owner: "F009", status: "unsupported",
      summary: "Dossier multi-biens non pris en charge dans ce lot.",
      facts: emptyFacts, sources: [], provenance: "unavailable",
      missing: emptyFacts.map(fact => fact.label),
    } };
  }

  const draft = workspace.declarationDraft;
  const provenance = readActiviteFieldProvenance(draft);
  const sourceDocument = workspace.documents.find(doc => doc.id === draft?.inpiDocumentId);
  const firstName = known(draft?.exploitantFirstName);
  const lastName = known(draft?.exploitantLastName);
  const identity = [firstName, lastName].filter(Boolean).join(" ") || null;
  const siren = known(draft?.siren);
  const sirenProof = siren && provenance.siren?.origin === "inpi_document" ? provenance.siren : undefined;
  const facts: V3Fact[] = [
    { id: "identity", label: "Exploitant", value: identity },
    { id: "activityType", label: "Activité", value: draft?.activityType ?? null },
    { id: "siren", label: "SIREN", value: siren, evidence: sirenProof?.evidence,
      confidence: sirenProof?.confidence },
    { id: "siret", label: "SIRET", value: known(draft?.siret) },
    // FiscalYear.regime has a default; it becomes a known choice only after confirmation.
    { id: "regime", label: "Régime", value: workspace.fiscalYear.regimeConfirmedAt
      ? workspace.fiscalYear.regime === "reel" ? "Réel" : "Micro-BIC" : null },
    { id: "startDate", label: "Début d’activité", value: known(draft?.activityStartDate) },
  ];
  const status = buildDossierSteps(draft, workspace.fiscalYear.year)
    .find(step => step.id === "activite")?.status ?? "incomplete";
  const hasFieldProvenance = Object.values(provenance).some(entry => Boolean(entry && entry.status !== "missing"));
  return { activity: {
    id: "activity", label: "Activité", owner: "F009", status,
    summary: status === "complete" ? "Activité validée" : "Activité à compléter",
    facts,
    sources: sourceDocument ? [{ id: sourceDocument.id, label: sourceDocument.fileName }] : [],
    // F009 stores useful excerpts/confidence but no universal page/region trail yet.
    provenance: sourceDocument || hasFieldProvenance ? "partial" : "unavailable",
    missing: facts.filter(fact => fact.value === null).map(fact => fact.label),
  } };
}
