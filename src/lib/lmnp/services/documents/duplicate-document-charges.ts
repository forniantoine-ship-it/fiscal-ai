/**
 * GATE-1.1 — risque de DOUBLE COMPTAGE par document de contenu identique.
 *
 * Invariant (décision PO) : `SAME_DOCUMENT_CONTENT` (même SHA-256 des octets originaux) ≠ `SAME_ACCOUNTING_FACT`.
 * Le hash DÉTECTE un risque ; il ne décide jamais d'une classe (B / ACTIVITY / EXCLUDED), d'un montant déductible ni de la suppression
 * d'une charge. Aucune déduplication automatique : si deux charges actives s'appuient sur un contenu identique et qu'aucune identité
 * métier ne démontre qu'il s'agit de deux faits distincts, la génération est BLOQUÉE (`NEEDS_CONFIRMATION`) — le client retire la copie
 * ou la charge en double (flux existants), jamais le système.
 *
 * Identité métier admise comme DÉMONTRANT deux faits distincts : UN SEUL document (même `documentId`) dont les dépenses portent des
 * identifiants dérivés `expense-doc-<documentId>-<itemKey>` à `itemKey` DISTINCTS (lignes distinctes d'un même document, ex. décompte
 * de syndic). Rien d'autre : ni montant, ni date, ni libellé, ni nom de fichier, ni texte OCR.
 *
 * Documents sans empreinte (non calculée) : identité inconnue, jamais « distincts » ni « identiques » — aucune détection (limite connue).
 */
import { isContentSha256 } from "@/lib/documents/content-identity";
import { isExpenseRecordable, type Expense } from "@/runtime/capabilities/f012/expense";
import type { F012CollectedData } from "@/runtime/assistants/f012-charges/types";

export const DUPLICATE_DOCUMENT_CONTENT_CODE = "document_duplicate_content_unconfirmed" as const;

export type DocumentIdentityFact = { id: string; contentSha256?: string };
export type ChargeDraftScope = { propertyId?: string; collected: F012CollectedData | undefined };

export type DuplicateDocumentConflict = {
  code: typeof DUPLICATE_DOCUMENT_CONTENT_CODE;
  /** SAME_DOCUMENT_CONTENT : jamais SAME_ACCOUNTING_FACT. */
  relation: "SAME_DOCUMENT_CONTENT";
  sha256: string;
  documentIds: readonly string[];
  expenseIds: readonly string[];
  propertyIds: readonly string[];
  message: string;
};

type Active = { expense: Expense; propertyId: string | undefined };

const derivedItemKey = (expense: Expense): string | undefined => {
  if (expense.documentId === undefined) return undefined;
  const prefix = `expense-doc-${expense.documentId}-`;
  return expense.id.startsWith(prefix) && expense.id.length > prefix.length ? expense.id.slice(prefix.length) : undefined;
};

/** Deux dépenses démontrées DISTINCTES : même document, `itemKey` dérivés différents. */
function provenDistinct(a: Expense, b: Expense): boolean {
  if (a.documentId === undefined || a.documentId !== b.documentId) return false;
  const ka = derivedItemKey(a);
  const kb = derivedItemKey(b);
  return ka !== undefined && kb !== undefined && ka !== kb;
}

function activeExpenses(drafts: readonly ChargeDraftScope[], fiscalYear: number): Active[] {
  const out: Active[] = [];
  for (const { propertyId, collected } of drafts) {
    if (collected === undefined) continue;
    const all = [...(collected.taxeFonciereExpense !== undefined ? [collected.taxeFonciereExpense] : []), ...(collected.documentExpenses ?? [])];
    for (const expense of all) {
      if (expense.exerciceFiscal === fiscalYear && isExpenseRecordable(expense) && expense.documentId !== undefined) out.push({ expense, propertyId });
    }
  }
  return out;
}

export function detectDuplicateDocumentCharges(input: {
  documents: readonly DocumentIdentityFact[];
  drafts: readonly ChargeDraftScope[];
  fiscalYear: number;
}): DuplicateDocumentConflict[] {
  const shaOf = new Map<string, string>();
  for (const doc of input.documents) if (isContentSha256(doc.contentSha256)) shaOf.set(doc.id, doc.contentSha256);

  const bySha = new Map<string, Active[]>();
  for (const active of activeExpenses(input.drafts, input.fiscalYear)) {
    const sha = shaOf.get(active.expense.documentId!);
    if (sha === undefined) continue;
    bySha.set(sha, [...(bySha.get(sha) ?? []), active]);
  }

  const conflicts: DuplicateDocumentConflict[] = [];
  for (const [sha256, group] of [...bySha.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (group.length < 2) continue;
    // Conflit dès qu'UNE paire n'est pas démontrée distincte (même propriété ou non : un même contenu sur deux biens est aussi suspect).
    const suspicious = group.some((x, i) => group.slice(i + 1).some((y) => !provenDistinct(x.expense, y.expense)));
    if (!suspicious) continue;
    const documentIds = [...new Set(group.map((g) => g.expense.documentId!))].sort();
    const expenseIds = group.map((g) => g.expense.id).sort();
    const propertyIds = [...new Set(group.flatMap((g) => (g.propertyId === undefined ? [] : [g.propertyId])))].sort();
    conflicts.push({
      code: DUPLICATE_DOCUMENT_CONTENT_CODE,
      relation: "SAME_DOCUMENT_CONTENT",
      sha256,
      documentIds,
      expenseIds,
      propertyIds,
      message:
        `Des documents de contenu strictement identique (SHA-256) justifient ${group.length} charges de l'exercice : rien ne démontre qu'il s'agit de faits distincts. ` +
        "Retirez la copie ou la charge en double ; le système ne fusionne et ne supprime jamais une charge de lui-même.",
    });
  }
  return conflicts;
}

/** Brouillons de charges d'un workspace : mono (plat) ou multi (par bien). */
export function chargeDraftsOfWorkspace(draft: unknown): ChargeDraftScope[] {
  const d = draft as { chargesAssistantState?: { collected?: F012CollectedData }; biens?: Record<string, { chargesAssistantState?: { collected?: F012CollectedData } } | undefined> } | undefined;
  const scopes: ChargeDraftScope[] = [{ collected: d?.chargesAssistantState?.collected }];
  for (const [propertyId, bien] of Object.entries(d?.biens ?? {})) scopes.push({ propertyId, collected: bien?.chargesAssistantState?.collected });
  return scopes;
}
