import type { DeclarationDraft } from "../../types";

/**
 * État crédit d'un dossier — UNE seule lecture, partagée par F-006, la RFS, l'estimation, la
 * détection de recouvrement F-012 et les écritures « aucun crédit » (reducer + F-011).
 *
 * Contexte (latence « prêt saisi puis aucun crédit ») : quand un client renseigne un prêt
 * (`financementCharges` calculées, `creditFinancing.loans` confirmés) puis déclare ensuite
 * explicitement n'avoir aucun crédit, l'ancienne charge de financement continuait d'influencer
 * F-006, la RFS, la liasse et l'estimation, car rien ne l'écartait ni ne la purgeait.
 *
 * Quatre états, jamais confondus :
 *  - `CREDIT_PRESENT`        : des charges de financement existent et rien ne les contredit.
 *  - `AUCUN_CREDIT_ETABLI`   : le client a explicitement déclaré ne pas avoir de crédit
 *                              (`creditDeclaredNoneAt`), sans prêt confirmé, sans document de
 *                              prêt, sans extraction en attente, et toute charge de financement
 *                              résiduelle est ANTÉRIEURE à cette déclaration (donc périmée).
 *  - `INCONNU`               : aucune réponse — jamais assimilé à « aucun crédit ».
 *  - `AMBIGU`                : « aucun crédit » coexiste avec des éléments contradictoires (prêt
 *                              confirmé, document, extraction en attente, ou charges de
 *                              financement POSTÉRIEURES à la déclaration). Rien n'est détruit ni
 *                              écarté : les consommateurs gardent exactement leur comportement
 *                              historique (les charges de financement, si elles existent, sont
 *                              lues), et l'état est exposé pour pouvoir être signalé.
 */
export type CreditState = "CREDIT_PRESENT" | "AUCUN_CREDIT_ETABLI" | "INCONNU" | "AMBIGU";

export type CreditStateResolution = {
  etat: CreditState;
  /** Pourquoi l'état est `AMBIGU` (vide sinon). */
  raisons: string[];
};

/** Données de prêt fournies par le client et pas (ou plus) réductibles à un simple calcul dérivé. */
function pendingCreditEvidence(draft: DeclarationDraft): string[] {
  const evidence: string[] = [];
  if (draft.creditConfirmedAt) evidence.push("un prêt est confirmé (creditConfirmedAt)");
  if (draft.creditDocumentId) evidence.push("un document de prêt est déposé (creditDocumentId)");
  if (draft.creditGptSession?.amortization || draft.creditGptSession?.loanOffer) {
    evidence.push("une extraction de prêt est en attente (creditGptSession)");
  }
  if ((draft.creditFinancing?.loans?.length ?? 0) > 0) {
    evidence.push("des prêts confirmés subsistent (creditFinancing.loans)");
  }
  return evidence;
}

/** `true` seulement si l'ordre est établi ET que le calcul est antérieur (ou égal) à la déclaration. */
function financementOlderThanDeclaration(draft: DeclarationDraft): boolean {
  const declared = Date.parse(draft.creditDeclaredNoneAt ?? "");
  const computed = Date.parse(draft.financementCharges?.computedAt ?? "");
  return Number.isFinite(declared) && Number.isFinite(computed) && computed <= declared;
}

export function resolveCreditState(draft: DeclarationDraft | undefined): CreditStateResolution {
  if (!draft) return { etat: "INCONNU", raisons: [] };

  const declaredNone = Boolean(draft.creditDeclaredNoneAt);
  const financement = draft.financementCharges;

  if (!declaredNone) {
    return { etat: financement ? "CREDIT_PRESENT" : "INCONNU", raisons: [] };
  }

  const raisons = pendingCreditEvidence(draft);
  if (financement && !financementOlderThanDeclaration(draft)) {
    raisons.push("des charges de financement ne sont pas antérieures à la déclaration « aucun crédit » (ordre non établi ou postérieur)");
  }
  return raisons.length === 0 ? { etat: "AUCUN_CREDIT_ETABLI", raisons: [] } : { etat: "AMBIGU", raisons };
}

/**
 * Charges de financement EFFECTIVES : celles de `draft.financementCharges`, sauf si « aucun crédit »
 * est établi (elles sont alors périmées : un prêt saisi puis explicitement retiré n'influence plus rien).
 * Dans tous les autres états, `draft.financementCharges` est retourné tel quel.
 */
export function effectiveFinancementCharges(draft: DeclarationDraft | undefined): DeclarationDraft["financementCharges"] {
  return resolveCreditState(draft).etat === "AUCUN_CREDIT_ETABLI" ? undefined : draft?.financementCharges;
}

/**
 * Patch de PURGE à appliquer lorsque le client déclare explicitement ne pas avoir de crédit : efface les
 * copies dérivées d'un ancien prêt confirmé (`financementCharges`, `creditFinancing`, `creditConfirmedAt`).
 * Retourne `{}` — rien n'est détruit — dès qu'une donnée de prêt en attente existe (document déposé,
 * extraction en cours) : le doute ne se résout jamais par une suppression.
 *
 * Les clés sont explicitement présentes à `undefined` : `flushWorkspace` fusionne le patch sur l'état
 * précédent, un simple retrait de clé ne purgerait pas la version persistée.
 */
export function noCreditSupersessionPatch(draft: DeclarationDraft | undefined): Partial<DeclarationDraft> {
  if (!draft) return {};
  if (draft.creditDocumentId || draft.creditGptSession?.amortization || draft.creditGptSession?.loanOffer) return {};
  return { financementCharges: undefined, creditFinancing: undefined, creditConfirmedAt: undefined };
}
