import type { Extraction, LmnpDocument } from "../types";
import type { PersistedWorkspace } from "../store/persistence";

export interface InpiProfile {
  siren?: string;
  siret?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  postalCode?: string;
}

export interface InpiDetectionResult {
  profile: InpiProfile;
  checks: { id: string; label: string; ok: boolean }[];
}

const SIREN_RE = /\b(\d{3}\s?\d{3}\s?\d{3})\b/;
const SIRET_RE = /\b(\d{3}\s?\d{3}\s?\d{3}\s?\d{5})\b/;
const POSTAL_RE = /\b(\d{5})\b/;

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

  const postal = blob.match(POSTAL_RE);
  if (postal) out.postalCode = postal[1];

  return out;
}

function extractFromExtractions(extractions: Extraction[]): Partial<InpiProfile> {
  const out: Partial<InpiProfile> = {};
  let textBlob = "";

  for (const e of extractions) {
    const raw = e.rawValue ?? "";
    textBlob += ` ${raw}`;
    if (e.ocrFieldKey === "supplierName" || e.displayLabel?.toLowerCase().includes("fournisseur")) {
      const parts = raw.trim().split(/\s+/);
      if (parts.length >= 2) {
        out.firstName = parts[0];
        out.lastName = parts.slice(1).join(" ");
      } else if (parts.length === 1) {
        out.lastName = parts[0];
      }
    }
    if (e.ocrFieldKey === "address" || raw.length > 12) {
      if (!out.address && /\d/.test(raw)) out.address = raw;
    }
  }

  return { ...out, ...extractFromText(textBlob) };
}

/** Déduit le profil exploitant depuis le document INPI et les extractions OCR. */
export function buildInpiDetection(
  ws: PersistedWorkspace,
  document: LmnpDocument,
): InpiDetectionResult {
  const draft = ws.declarationDraft ?? { completedSteps: [] };
  const extractions = ws.extractions.filter((e) => e.documentId === document.id);

  const fromOcr = extractFromExtractions(extractions);
  const fromName = extractFromText(document.fileName);

  const profile: InpiProfile = {
    siren: draft.siren ?? fromOcr.siren ?? fromName.siren,
    siret: draft.siret ?? fromOcr.siret ?? fromName.siret,
    firstName: draft.exploitantFirstName ?? fromOcr.firstName,
    lastName: draft.exploitantLastName ?? fromOcr.lastName,
    address: ws.properties[0]?.address || fromOcr.address,
    city: ws.properties[0]?.city || fromOcr.city,
    postalCode: ws.properties[0]?.postalCode || fromOcr.postalCode,
  };

  if (!profile.firstName && !profile.lastName && document.fileName) {
    const base = document.fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
    const tokens = base.split(/\s+/).filter((t) => t.length > 1 && !/inpi|kbis|siren/i.test(t));
    if (tokens.length >= 2) {
      profile.firstName = tokens[0];
      profile.lastName = tokens.slice(1, 3).join(" ");
    }
  }

  const checks = [
    { id: "siret", label: "SIRET identifié", ok: Boolean(profile.siret || profile.siren) },
    { id: "exploitant", label: "Exploitant détecté", ok: Boolean(profile.firstName || profile.lastName) },
    { id: "address", label: "Adresse récupérée", ok: Boolean(profile.address || profile.postalCode) },
  ];

  return { profile, checks };
}
