import type { LmnpDocument } from "../types";
import type { PersistedWorkspace } from "../store/persistence";
import { ACTIVITE_ACTIVITY_TYPE, ACTIVITE_FISCAL_REGIME } from "../constants/activite-product";

/** Activité tunnel profile — entrepreneur identity + fiscal registration only. */
export interface InpiProfile {
  firstName?: string;
  lastName?: string;
  siren?: string;
  /** Internal storage only — not shown in Activité UI. */
  siret?: string;
  email?: string;
  telephone?: string;
  personalAddress?: string;
  personalCity?: string;
  personalPostalCode?: string;
  establishmentAddress?: string;
  establishmentCity?: string;
  establishmentPostalCode?: string;
}

export interface InpiDetectionResult {
  profile: InpiProfile;
  checks: { id: string; label: string; ok: boolean }[];
}

const SIREN_RE = /\b(\d{3}\s?\d{3}\s?\d{3})\b/;
const SIRET_RE = /\b(\d{3}\s?\d{3}\s?\d{3}\s?\d{5})\b/;

const INPI_DOC_PATTERN = /inpi|kbis|siren|siret|rcs|extrait/i;

export function isInpiDocument(doc: LmnpDocument, inpiDocumentId?: string): boolean {
  if (inpiDocumentId && doc.id === inpiDocumentId) return true;
  return INPI_DOC_PATTERN.test(doc.fileName);
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function extractFromText(blob: string): Partial<InpiProfile> {
  const out: Partial<InpiProfile> = {};
  const siret = blob.match(SIRET_RE);
  const siren = blob.match(SIREN_RE);
  if (siret) out.siret = digitsOnly(siret[1]);
  if (siren) out.siren = digitsOnly(siren[1]).slice(0, 9);
  if (out.siret && !out.siren) out.siren = out.siret.slice(0, 9);
  return out;
}

export function buildInpiDetection(
  ws: PersistedWorkspace,
  document: LmnpDocument,
): InpiDetectionResult {
  const draft = ws.declarationDraft ?? { completedSteps: [] };
  const profile = profileFromDraft(ws);

  const fromText = extractFromText(document.fileName);
  const merged: InpiProfile = {
    ...profile,
    siren: profile.siren ?? fromText.siren,
    siret: profile.siret ?? fromText.siret,
  };

  const checks = [
    { id: "siren", label: "SIREN identifié", ok: Boolean(merged.siren) },
    { id: "exploitant", label: "Exploitant détecté", ok: Boolean(merged.firstName || merged.lastName) },
    {
      id: "personal-address",
      label: "Coordonnées personnelles",
      ok: Boolean(merged.personalAddress || merged.personalPostalCode),
    },
  ];

  return { profile: merged, checks };
}

export function withActiviteMockFallbacks(profile: InpiProfile): InpiProfile {
  return {
    ...profile,
    siren: profile.siren ?? "829456123",
    firstName: profile.firstName ?? "Marie",
    lastName: profile.lastName ?? "Dupont",
    email: profile.email ?? "marie.dupont@example.com",
    telephone: profile.telephone ?? "06 12 34 56 78",
    personalAddress: profile.personalAddress ?? "4 allée Malbec",
    personalCity: profile.personalCity ?? "Saint-Médard-d'Eyrans",
    personalPostalCode: profile.personalPostalCode ?? "33650",
  };
}

export function profileFromDraft(ws: PersistedWorkspace): InpiProfile {
  const draft = ws.declarationDraft ?? { completedSteps: [] };

  return {
    siren: draft.siren,
    siret: draft.siret,
    firstName: draft.exploitantFirstName,
    lastName: draft.exploitantLastName,
    email: draft.exploitantEmail,
    telephone: draft.exploitantTelephone,
    personalAddress: draft.personalAddress ?? draft.entrepreneurAddress,
    personalCity: draft.personalCity ?? draft.entrepreneurCity,
    personalPostalCode: draft.personalPostalCode ?? draft.entrepreneurPostalCode,
    establishmentAddress: draft.establishmentAddress,
    establishmentCity: draft.establishmentCity,
    establishmentPostalCode: draft.establishmentPostalCode,
  };
}

/** Values persisted on confirm — includes internal product constants. */
export function activiteProfileForStorage(values: InpiProfile): {
  profile: InpiProfile;
  activityType: typeof ACTIVITE_ACTIVITY_TYPE;
  fiscalRegime: typeof ACTIVITE_FISCAL_REGIME;
} {
  return {
    profile: values,
    activityType: ACTIVITE_ACTIVITY_TYPE,
    fiscalRegime: ACTIVITE_FISCAL_REGIME,
  };
}
