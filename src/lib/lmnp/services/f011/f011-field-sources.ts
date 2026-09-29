import type { F011LoanDraft } from "@/runtime";
import type { F011LoanProvenance } from "@/runtime/assistants/f011-financement/types";
import type { FieldSource } from "@/runtime";

/**
 * Correctif Cycle 11 (F-011) — invariant : `fieldSources` ne doit jamais
 * revendiquer une provenance pour un champ que `pendingLoan` ne porte plus.
 *
 * Bug corrigé : `go_back` restaure `pendingLoan` depuis l'historique mais
 * conserve le `fieldSources` courant tel quel (celui-ci n'a jamais fait
 * partie du snapshot d'historique — voir `F011HistorySnapshot`). Après un
 * retour en arrière suffisamment profond pour vider `pendingLoan` (au-delà
 * d'une extraction abandonnée), `fieldSources` continue de prétendre
 * `"extracted"` sur des champs redevenus inconnus. Une saisie manuelle
 * fraîche sur l'un de ces champs est alors classée à tort `"user_correction"`
 * par `classifyManualSource` (qui ne compare que la valeur, jamais si le
 * champ existe encore réellement dans `pendingLoan`).
 *
 * Cette fonction ne fait que rétablir l'invariant : jamais de provenance
 * sans valeur correspondante. Elle ne touche jamais un champ dont
 * `pendingLoan` porte encore une valeur réelle (extraite ou saisie) — jamais
 * de correction d'une provenance métier valide.
 */
export function reconcileFieldSourcesWithPendingLoan(
  fieldSources: Partial<Record<string, FieldSource>>,
  pendingLoan: Partial<F011LoanDraft> | undefined,
): Partial<Record<string, FieldSource>> {
  const reconciled = { ...fieldSources };
  for (const key of Object.keys(reconciled)) {
    if (pendingLoan?.[key as keyof F011LoanDraft] === undefined) {
      delete reconciled[key];
    }
  }
  return reconciled;
}

/**
 * Champs d'un prêt dont la provenance est persistée (`F011LoanDraft.provenance`). Ce sont les champs
 * qui portent une provenance dans `fieldSources`, plus `capitalInitialOffre` (lu sur l'offre, toujours
 * documentaire, donc suivi uniquement par son document).
 */
export const F011_PROVENANCE_KEYS = [
  "typePret",
  "capitalInitial",
  "tauxNominal",
  "dureeMois",
  "datePremiereMensualite",
  "assuranceAnnuelle",
  "commissionCaution",
  "fraisDossier",
  "capitalInitialOffre",
] as const satisfies readonly (keyof F011LoanDraft)[];

const DOCUMENT_BACKED_SOURCES: ReadonlySet<FieldSource> = new Set<FieldSource>(["extracted", "user_correction"]);

/**
 * Invariant miroir de `reconcileFieldSourcesWithPendingLoan` : jamais de document sans valeur
 * correspondante dans `pendingLoan`. Ne touche jamais un champ dont `pendingLoan` porte encore une valeur.
 */
export function reconcileFieldDocumentIdsWithPendingLoan(
  fieldDocumentIds: Partial<Record<string, string>> | undefined,
  pendingLoan: Partial<F011LoanDraft> | undefined,
): Partial<Record<string, string>> {
  const reconciled = { ...fieldDocumentIds };
  for (const key of Object.keys(reconciled)) {
    if (pendingLoan?.[key as keyof F011LoanDraft] === undefined) {
      delete reconciled[key];
    }
  }
  return reconciled;
}

/** Retire un champ de la map des documents (le champ redevient absent : plus aucun document ne l'a fourni). */
export function withoutFieldDocumentId(
  fieldDocumentIds: Partial<Record<string, string>> | undefined,
  field: string,
): Partial<Record<string, string>> {
  const next = { ...fieldDocumentIds };
  delete next[field];
  return next;
}

/**
 * Fige la provenance d'un prêt à `confirm_loan`. Jamais inventée :
 * - uniquement pour un champ qui porte une valeur ET une provenance connue (`fieldSources`) ;
 * - `documentId` uniquement pour `extracted` / `user_correction` (document d'origine conservé après correction),
 *   jamais pour une saisie purement manuelle ;
 * - `capitalInitialOffre` n'est tracé que si le document qui l'a lu est connu.
 * Retourne `undefined` (clé absente du prêt) quand rien n'est prouvé.
 */
export function buildLoanProvenance(
  loan: Partial<F011LoanDraft>,
  fieldSources: Partial<Record<string, FieldSource>>,
  fieldDocumentIds: Partial<Record<string, string>> | undefined,
): F011LoanProvenance | undefined {
  const provenance: F011LoanProvenance = {};
  for (const key of F011_PROVENANCE_KEYS) {
    if (loan[key] === undefined) continue;
    const documentId = fieldDocumentIds?.[key];
    if (key === "capitalInitialOffre") {
      if (documentId) provenance[key] = { source: "extracted", documentId };
      continue;
    }
    const source = fieldSources[key];
    if (!source) continue;
    provenance[key] = documentId && DOCUMENT_BACKED_SOURCES.has(source) ? { source, documentId } : { source };
  }
  return Object.keys(provenance).length > 0 ? provenance : undefined;
}

/** Restaure les maps de l'assistant depuis la provenance figée d'un prêt (`edit_loan`) ; prêt sans provenance → maps vides. */
export function restoreFieldMapsFromLoanProvenance(provenance: F011LoanProvenance | undefined): {
  fieldSources: Partial<Record<string, FieldSource>>;
  fieldDocumentIds: Partial<Record<string, string>>;
} {
  const fieldSources: Partial<Record<string, FieldSource>> = {};
  const fieldDocumentIds: Partial<Record<string, string>> = {};
  for (const [key, entry] of Object.entries(provenance ?? {})) {
    if (!entry) continue;
    if (key !== "capitalInitialOffre") fieldSources[key] = entry.source;
    if (entry.documentId) fieldDocumentIds[key] = entry.documentId;
  }
  return { fieldSources, fieldDocumentIds };
}
