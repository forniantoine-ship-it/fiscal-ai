/**
 * Cycle 12A — extraire plusieurs dépenses d'une saisie libre.
 * Aucune règle fiscale : classement vers les slots déjà existants.
 * Jamais un total unique quand deux natures sont distinguables.
 */

import type { ChargeFamilyId } from "../../capabilities/f012/charge";
import type { CoproLigneType } from "../../capabilities/f012/types";

export type ParsedExpenseKind =
  | "taxe_fonciere"
  | "autre_taxe"
  | "copro_provisions"
  | "copro_regularisation"
  | "copro_fonds_travaux"
  | "assurance_pno"
  | "assurance_gli"
  | "assurance_emprunteur"
  | "honoraires_gestion"
  | "frais_etat_des_lieux"
  | "mise_en_location"
  | "honoraires_comptable"
  | "travaux"
  | "frais_bancaires"
  | "divers";

export type ParsedExpense = {
  amount: number;
  description: string;
  kind: ParsedExpenseKind;
  coproType?: CoproLigneType;
};

/**
 * Groupe millier (`1 800`) d'abord, puis entier (`1200`).
 * L'euro est exigé pour ne jamais prendre une année (`2024`) pour un montant.
 */
const AMOUNT_RE =
  /(?<![\d])(\d{1,3}(?:[ .\u00a0]\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:€|euros?\b|eur\b)/gi;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseFrenchAmount(raw: string): number | undefined {
  const compact = raw.replace(/[ .\u00a0]/g, "").replace(",", ".");
  const amount = Number(compact);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return amount;
}

/**
 * Cycle 12B — champs structurés uniquement (pas le parser freeText 12A).
 * `1 800` et `1 800,50` doivent produire un montant, sans exiger `€`.
 */
export function parseStructuredAmount(raw: string): number | undefined {
  const trimmed = raw
    .trim()
    .replace(/(?:€|euros?\b|eur\b)/gi, "")
    .trim();
  if (!trimmed) return undefined;
  return parseFrenchAmount(trimmed);
}

/**
 * Cycle 12B — deux montants reliés par « ou » : information ambiguë.
 * Ne pas transformer silencieusement en un montant fiscal certain.
 */
export function isAmbiguousAmountText(text: string): boolean {
  const n = normalize(text);
  return /\d[\d .\u00a0]*(?:€|euros?|eur)?\s+ou\s+\d/.test(n);
}

function looksLikeYear(raw: string): boolean {
  const digits = raw.replace(/[ .\u00a0]/g, "");
  return /^(19|20)\d{2}$/.test(digits);
}

type AmountHit = { amount: number; start: number; end: number };

function collectAmountHits(text: string): AmountHit[] {
  const hits: AmountHit[] = [];
  const re = new RegExp(AMOUNT_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1] ?? "";
    if (looksLikeYear(raw)) {
      if (match[0].length === 0) re.lastIndex += 1;
      continue;
    }
    const amount = parseFrenchAmount(raw);
    if (amount === undefined) continue;
    hits.push({ amount, start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return hits;
}

function segmentForHit(text: string, hits: AmountHit[], index: number): string {
  const from = index === 0 ? 0 : hits[index]!.start;
  const to = index === hits.length - 1 ? text.length : hits[index + 1]!.start;
  return text.slice(from, to);
}

function classifyAssurances(context: string): ParsedExpenseKind {
  const n = normalize(context);
  if (/assurance.{0,40}(emprunt|pret|credit|financement)/.test(n) || /\bemprunteur\b/.test(n)) {
    return "assurance_emprunteur";
  }
  if (/loyers?\s+impay|garantie\s+locative|\bgli\b/.test(n)) return "assurance_gli";
  return "assurance_pno";
}

function classifySyndic(context: string): ParsedExpenseKind {
  const n = normalize(context);
  if (/fonds\s+travaux|epargne.{0,20}travaux/.test(n)) return "copro_fonds_travaux";
  if (/regularis|regul\b/.test(n)) return "copro_regularisation";
  return "copro_provisions";
}

function classifyGestion(context: string): ParsedExpenseKind {
  const n = normalize(context);
  if (/etat\s+des\s+lieux|\bedl\b/.test(n)) return "frais_etat_des_lieux";
  if (/comptable|logiciel/.test(n)) return "honoraires_comptable";
  if (/mise\s+en\s+location|annonce|commission\s+de\s+placement/.test(n)) return "mise_en_location";
  return "honoraires_gestion";
}

function classifyImpots(context: string): ParsedExpenseKind {
  const n = normalize(context);
  if (/fonciere|\btf\b/.test(n)) return "taxe_fonciere";
  return "autre_taxe";
}

function classifyAutres(context: string): ParsedExpenseKind {
  const n = normalize(context);
  if (/bancaire|frais\s+du\s+compte|tenue\s+de\s+compte/.test(n)) return "frais_bancaires";
  if (/plomb|repar|artisan|fuite|chauffe|peinture|serrur/.test(n)) return "travaux";
  return "divers";
}

function classifyForFamily(familyId: ChargeFamilyId, context: string): ParsedExpenseKind {
  switch (familyId) {
    case "impots":
      return classifyImpots(context);
    case "syndic":
      return classifySyndic(context);
    case "assurances":
      return classifyAssurances(context);
    case "gestion":
      return classifyGestion(context);
    case "travaux":
      return "travaux";
    case "autres":
      return classifyAutres(context);
  }
}

function defaultDescription(kind: ParsedExpenseKind, snippet: string): string {
  const cleaned = snippet.replace(/\s+/g, " ").trim();
  if (cleaned.length >= 3 && cleaned.length <= 80) return cleaned;
  switch (kind) {
    case "taxe_fonciere":
      return "Taxe foncière";
    case "autre_taxe":
      return "Autre taxe liée au logement";
    case "copro_provisions":
      return "Charges d'immeuble";
    case "copro_regularisation":
      return "Régularisation";
    case "copro_fonds_travaux":
      return "Épargne pour de futurs travaux";
    case "assurance_pno":
      return "Assurance du logement";
    case "assurance_gli":
      return "Loyers impayés";
    case "assurance_emprunteur":
      return "Assurance emprunteur";
    case "honoraires_gestion":
      return "Frais de gestion";
    case "frais_etat_des_lieux":
      return "État des lieux";
    case "mise_en_location":
      return "Mise en location";
    case "honoraires_comptable":
      return "Comptable ou logiciel";
    case "travaux":
      return "Réparation";
    case "frais_bancaires":
      return "Frais du compte";
    case "divers":
      return "Autre dépense";
  }
}

function coproTypeFor(kind: ParsedExpenseKind): CoproLigneType | undefined {
  if (kind === "copro_provisions") return "provisions";
  if (kind === "copro_regularisation") return "regularisation";
  if (kind === "copro_fonds_travaux") return "fonds_travaux";
  return undefined;
}

export function parseFamilyExpenseMentions(
  text: string,
  familyId: ChargeFamilyId,
): ParsedExpense[] {
  return parseFamilyExpenseMentionsBounded(text, familyId).items;
}

/**
 * Cycle 13A — parse toujours borné à `familyId`.
 * Les montants dont le segment signale une *autre* famille ne sont pas classés ici.
 * Ce n'est pas un parser global : aucune écriture hors famille ouverte.
 */
export function parseFamilyExpenseMentionsBounded(
  text: string,
  familyId: ChargeFamilyId,
): { items: ParsedExpense[]; foreignFamilies: ChargeFamilyId[] } {
  const trimmed = text.trim();
  if (!trimmed) return { items: [], foreignFamilies: [] };
  const hits = collectAmountHits(trimmed);
  const items: ParsedExpense[] = [];
  const seen = new Set<string>();
  const foreign = new Set<ChargeFamilyId>();
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index]!;
    const context = segmentForHit(trimmed, hits, index);
    const foreignInSegment = foreignFamilySignals(context, familyId);
    if (foreignInSegment.length > 0) {
      for (const id of foreignInSegment) foreign.add(id);
      continue;
    }
    const kind = classifyForFamily(familyId, context);
    const snippet = context.replace(/\d[\d .\u00a0,]*(?:€|euros?|eur)?/gi, " ").replace(/\s+/g, " ").trim();
    const description = defaultDescription(kind, snippet);
    const key =
      kind === "divers" || kind === "travaux" || kind === "autre_taxe"
        ? `${kind}:${hit.amount}:${description}`
        : `${kind}:${hit.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      amount: hit.amount,
      description,
      kind,
      ...(coproTypeFor(kind) ? { coproType: coproTypeFor(kind) } : {}),
    });
  }
  for (const id of foreignFamilySignals(trimmed, familyId)) foreign.add(id);
  return { items, foreignFamilies: [...foreign] };
}

const FILET_TRAVAUX = /plomb|repar|artisan|fuite|chauffe|peinture|serrur|travaux/;
const FILET_SYNDIC = /syndic|copro|immeuble|regularis|appel de fonds|decompte/;
const FILET_ASSURANCE = /assurance|habitation|loyers?\s+impay|proprietaire/;
const FILET_GESTION = /agence|gestion|comptable|logiciel|etat des lieux|mise en location/;
const FILET_IMPOTS = /fonciere|taxe/;
const FILET_AUTRES = /bancaire|frais\s+du\s+compte|tenue\s+de\s+compte/;

function hasTravauxFamilySignal(n: string): boolean {
  if (/plomb|repar|artisan|fuite|chauffe|peinture|serrur/.test(n)) return true;
  if (/\btravaux\b/.test(n) && !/fonds\s+travaux|epargne.{0,24}travaux/.test(n)) return true;
  return false;
}

/**
 * Indices de famille (regex filet), pas une extraction de dépenses.
 * `fonds travaux` n'est pas la famille travaux.
 */
export function detectFamilySignals(text: string): ChargeFamilyId[] {
  const n = normalize(text);
  const found: ChargeFamilyId[] = [];
  if (hasTravauxFamilySignal(n)) found.push("travaux");
  if (FILET_SYNDIC.test(n)) found.push("syndic");
  if (FILET_ASSURANCE.test(n)) found.push("assurances");
  if (FILET_GESTION.test(n)) found.push("gestion");
  if (FILET_IMPOTS.test(n)) found.push("impots");
  if (FILET_AUTRES.test(n)) found.push("autres");
  return found;
}

/**
 * Familles *étrangères* au sens du verrou 13A.
 * Les sous-catégories de la famille ouverte ne sont jamais étrangères
 * (PNO+GLI, gestion+comptable, provisions+régul, plusieurs travaux).
 * Autres peut encore router un artisan vers la qualification travaux (12B).
 */
export function foreignFamilySignals(text: string, familyId: ChargeFamilyId): ChargeFamilyId[] {
  return detectFamilySignals(text).filter((id) => {
    if (id === familyId) return false;
    if (familyId === "autres" && id === "travaux") return false;
    return true;
  });
}

export function inferFamilyFromFiletText(text: string): ChargeFamilyId {
  const n = normalize(text);
  if (FILET_TRAVAUX.test(n)) return "travaux";
  if (FILET_SYNDIC.test(n)) return "syndic";
  if (FILET_ASSURANCE.test(n)) return "assurances";
  if (FILET_GESTION.test(n)) return "gestion";
  if (FILET_IMPOTS.test(n)) return "impots";
  return "autres";
}

export function paymentBelongsToExercise(paidAt: string | undefined, exercise: number): boolean {
  if (!paidAt) return true;
  const year = Number(paidAt.slice(0, 4));
  if (!Number.isFinite(year)) return true;
  return year === exercise;
}

export function slugForExpense(description: string): string {
  const slug = normalize(description)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "ligne";
}
