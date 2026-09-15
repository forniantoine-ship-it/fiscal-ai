/**
 * Cycle 7 — adaptateur décompte syndic → ChargeProposal[].
 * Réutilise parseCoproprieteDocument + normalizeChargeTransactions.
 * Le total du document n'est jamais une Charge.
 */

import { parseFrenchCurrencyAmount } from "@/lib/lmnp/services/charges/charge-parse-utils";
import {
  normalizeChargeTransactions,
  rawTransactionsFromCopro,
} from "@/lib/lmnp/services/charges/normalize-charge-transactions";
import { parseCoproprieteDocument } from "@/lib/lmnp/services/charges/parse-copropriete-document";
import type { CoproLigneType } from "../../capabilities/f012/types";
import type { ChargeProposal } from "./charge-proposal";

export type CoproProposalInput = {
  corpus: string;
  documentId: string;
  fiscalYear: number;
  fileName?: string;
};

export type CoproProposalDiagnostics = {
  documentLineTotal: number;
  deductibleProposed: number;
};

function coproTypeFromLine(label: string, category: string): CoproLigneType | undefined {
  if (/r[eé]gularis/i.test(label)) return "regularisation";
  if (category === "fonds_travaux") return "fonds_travaux";
  if (category === "charges_copro") return "provisions";
  return undefined;
}

function exclusionFor(category: string, coproType: CoproLigneType | undefined): string | undefined {
  if (category === "fonds_travaux" || coproType === "fonds_travaux") {
    return "épargne pour de futurs travaux — pas encore une dépense";
  }
  if (category === "avance_tresorerie") {
    return "avance de trésorerie — pas une charge de l'exercice";
  }
  return undefined;
}

/**
 * Correctif post-audit P1 — clé d'item STABLE pour une ligne syndic, dérivée
 * du contenu réellement extrait par le parseur (`label` + `amount`) plutôt
 * que de l'INDEX de la ligne dans `normalized.transactions`. Cet index
 * dépendait de l'ordre de sortie du parseur, recomposé à chaque extraction —
 * un réordonnancement OCR entre deux passes du même document (même lignes)
 * faisait donc changer `ChargeProposal.id` puis `Expense.id`
 * (`deriveExpenseIdFromDocument`, expense-from-document-review.ts), causant
 * des Expense orphelines et des doublons possibles au recommit.
 *
 * `label` et `amount` sont les SEULS champs par ligne réellement porteurs
 * d'un discriminant de contenu à ce point du pipeline : `CoproParsedTransaction`
 * (parse-copropriete-document.ts) ne porte que
 * category/label/amount/deductible/amortizable/sourceDocument — aucune
 * date/période n'est jamais peuplée pour une ligne syndic (`rawTransactionsFromCopro`,
 * normalize-charge-transactions.ts, ne copie pas non plus `lineIndex`/`rawLine`,
 * pourtant calculés en amont par `extractLineCandidates` puis abandonnés par
 * `normalizeCoproTransaction`). `label` porte déjà tout texte distinctif
 * réellement présent dans le document à cet endroit (ex. "T1"/"T2" s'il
 * figure dans la ligne source), donc n'est pas un simple recodage de
 * l'index — deux lignes économiquement différentes gardent des clés
 * différentes tant que leur libellé ou leur montant diffère.
 *
 * CORRECTIF POST-AUDIT P1-bis — collision réelle intra-document : deux
 * lignes STRICTEMENT identiques (même label, même montant) dans le MÊME
 * document obtenaient jusqu'ici la même `stableCoproItemKey`, donc le même
 * `ChargeProposal.id` puis le même `Expense.id` — décisions confuses
 * (`decideProposal`/`decideProposalGroup` matchent par id, apply-document-review.ts)
 * et collision détectée par `collectedToChargeRegistry` au commit
 * (collected-to-registry.ts). `label`+`amount` restent la clé SÉMANTIQUE de
 * base (deux lignes économiquement différentes ne doivent jamais être
 * fusionnées automatiquement). `withOccurrenceDiscriminatedIds` ci-dessous
 * ajoute un discriminant d'OCCURRENCE UNIQUEMENT quand une collision de clé
 * de base existe réellement dans le tableau produit par CETTE extraction :
 * le rang (1er, 2e, …) de l'occurrence dans `normalized.transactions`, qui
 * reflète l'ordre de balayage séquentiel du texte source
 * (`extractLineCandidates`, parse-copropriete-document.ts, itère
 * `lines = splitOcrLines(rawOcrText)` de gauche à droite et alimente
 * `candidates` dans cet ordre ; `parseCoproprieteDocument` puis
 * `normalizeChargeTransactions` préservent cet ordre sans le trier) — donc
 * PAS un index de position après un tri/reorder du tableau final, mais une
 * position d'occurrence dérivée d'un scan déterministe du texte source.
 *
 * Stabilité au reorder testé au P1 (`DECOMPTE_AB`/`DECOMPTE_BA`, deux
 * lignes de libellés DIFFÉRENTS dont l'ordre textuel est inversé) : ces
 * clés ne collisionnent pas, donc `withOccurrenceDiscriminatedIds` ne les
 * touche pas — comportement inchangé, id toujours `label+amount` seul.
 *
 * Stabilité au reorder pour une VRAIE collision (deux lignes label+amount
 * strictement identiques) : reparser deux fois le MÊME texte source non
 * modifié produit toujours le même ordre de balayage, donc le même rang
 * d'occurrence pour chaque ligne → mêmes ids. Réordonner les deux lignes
 * colliding L'UNE PAR RAPPORT À L'AUTRE dans le texte source n'est pas un
 * scénario observable : les deux lignes étant du texte strictement
 * identique, aucune opération de reorder ne peut les distinguer l'une de
 * l'autre ni produire un texte source différent — il n'existe donc pas de
 * "mauvais" reorder possible à couvrir pour ce cas précis (voir le test
 * "SYNDIC COLLISION REORDER" : d'autres lignes autour peuvent être
 * réordonnées sans affecter le rang relatif des deux occurrences
 * colliding).
 */
function stableCoproItemKey(label: string, amount: number): string {
  const slug = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cents = Math.round(amount * 100);
  return `${slug || "ligne"}-${cents}`;
}

type CoproProposalDraft = Omit<ChargeProposal, "id"> & { baseKey: string };

/**
 * N'ajoute un discriminant d'occurrence (`--occN`) qu'aux propositions dont
 * la `stableCoproItemKey` de base collisionne réellement dans CE tableau —
 * les clés non colliding gardent l'id exact déjà en production (aucune
 * régression du comportement P1 déjà validé). Le rang est calculé en
 * parcourant `drafts` dans l'ordre reçu, lui-même l'ordre de balayage du
 * texte source (voir commentaire de `stableCoproItemKey`) — jamais un index
 * recalculé après un tri/reorder du tableau de sortie.
 */
function withOccurrenceDiscriminatedIds(
  drafts: CoproProposalDraft[],
  documentId: string,
): ChargeProposal[] {
  const totalByBaseKey = new Map<string, number>();
  for (const draft of drafts) {
    totalByBaseKey.set(draft.baseKey, (totalByBaseKey.get(draft.baseKey) ?? 0) + 1);
  }
  const occurrenceSeen = new Map<string, number>();
  return drafts.map((draft) => {
    const { baseKey, ...proposal } = draft;
    const total = totalByBaseKey.get(baseKey) ?? 1;
    let suffix = baseKey;
    if (total > 1) {
      const occurrenceIndex = (occurrenceSeen.get(baseKey) ?? 0) + 1;
      occurrenceSeen.set(baseKey, occurrenceIndex);
      suffix = `${baseKey}--occ${occurrenceIndex}`;
    }
    return { ...proposal, id: `${documentId}:copro:${suffix}` };
  });
}

export function coproProposalDiagnostics(proposals: ChargeProposal[]): CoproProposalDiagnostics {
  const documentLineTotal = proposals.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const deductibleProposed = proposals
    .filter((item) => !item.exclusionReason)
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  return { documentLineTotal, deductibleProposed };
}

export function proposalsFromCoproCorpus(input: CoproProposalInput): ChargeProposal[] {
  const parsed = parseCoproprieteDocument(input.corpus, { logTraces: false });
  const normalized = normalizeChargeTransactions(rawTransactionsFromCopro(parsed.transactions), {
    logTraces: false,
  });

  if (normalized.transactions.length === 0) {
    return [
      {
        id: `${input.documentId}:copro-incomplete`,
        documentId: input.documentId,
        familyId: "syndic",
        description: "Ligne du décompte syndic",
        exercise: input.fiscalYear,
        missingFields: ["amount"],
        decision: "pending",
      },
    ];
  }

  const drafts: CoproProposalDraft[] = normalized.transactions.map((tx) => {
    const label = tx.label ?? tx.category;
    const coproType = coproTypeFromLine(label, tx.category);
    const exclusionReason = exclusionFor(tx.category, coproType);
    return {
      baseKey: stableCoproItemKey(label, tx.amount),
      documentId: input.documentId,
      familyId: "syndic" as const,
      description: label,
      amount: tx.amount,
      exercise: input.fiscalYear,
      ...(coproType !== undefined ? { coproType } : {}),
      ...(exclusionReason !== undefined ? { exclusionReason } : {}),
      missingFields: [] as ChargeProposal["missingFields"],
      decision: "pending" as const,
    };
  });
  const fromParser = withOccurrenceDiscriminatedIds(drafts, input.documentId);
  const alreadyHasRegularisation = fromParser.some((item) => item.coproType === "regularisation");
  if (alreadyHasRegularisation) return fromParser;
  return [...fromParser, ...regularisationProposalsFromCorpus(input)];
}

const REGULARISATION_LINE =
  /r[eé]gularis[\s\S]{0,80}?(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})/gi;

function regularisationProposalsFromCorpus(input: CoproProposalInput): ChargeProposal[] {
  const proposals: ChargeProposal[] = [];
  REGULARISATION_LINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = REGULARISATION_LINE.exec(input.corpus)) !== null) {
    const amount = parseFrenchCurrencyAmount(match[1] ?? "", { min: 0.01, max: 50_000 });
    if (amount === null) continue;
    index += 1;
    proposals.push({
      id: `${input.documentId}:regularisation:${index}`,
      documentId: input.documentId,
      familyId: "syndic",
      description: match[0]!.replace(/\s+/g, " ").trim(),
      amount,
      exercise: input.fiscalYear,
      coproType: "regularisation",
      missingFields: [],
      decision: "pending",
    });
  }
  return proposals;
}
