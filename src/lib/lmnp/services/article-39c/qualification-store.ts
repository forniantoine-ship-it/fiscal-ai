/**
 * INT-2 — store DURABLE des qualifications article 39 C (faits de nature + réponses CFE).
 *
 * Principe : on ne persiste JAMAIS un résultat (`B = 1 000`, une classe, un total). On persiste la réponse du client
 * (`source fact + qualification fact + fingerprint`) ; les contributions restent RECALCULABLES par les adapters INT-1 au
 * reload. Une réponse ne survit jamais silencieusement à la modification du fait qu'elle qualifie : l'empreinte de la
 * source est rejugée à chaque lecture (`natureFactFreshness`, `qualifyCfe`).
 *
 * Frontière : le store d'un BIEN (`BienDraft.article39cQualifications`, ou à plat en mono) ne porte que des enregistrements
 * de CE bien ; le store de l'ACTIVITÉ (`article39cActivityQualifications`) ne porte que des enregistrements niveau activité,
 * sans `propertyId`. L'étendue de chaque enregistrement est revérifiée à la lecture : un enregistrement copié dans le
 * store d'un autre bien n'est jamais servi (`WRONG_SCOPE`).
 *
 * Module PUR et feuille (types + fonctions) : il n'importe aucun adapter et n'est lu par aucun calcul productif. Aucune
 * extraction automatique n'existe : la provenance est `declaration` (réponse du client) ou `document` (référence fournie).
 */
import type { Article39cScope } from "./contribution";
import {
  fingerprintCfeNotice,
  type CfeBaseKind,
  type CfeNotice,
  type CfeQualificationFact,
  type ChargeNatureFact,
  type FactProvenanceKind,
} from "./qualification-facts";

export const ARTICLE_39C_QUALIFICATION_STORE_VERSION = 1 as const;

/**
 * `VALIDATED` : réponse explicite du client. `PROPOSED` : réservé à une future suggestion (extraction) — jamais consommé
 * (`PROPOSED ≠ VALIDATED`, même chaîne que F013 v2).
 */
export type QualificationValidation = "VALIDATED" | "PROPOSED";

type RecordBase = {
  recordId: string;
  scope: Article39cScope;
  fiscalYear: number;
  validation: QualificationValidation;
  /** Date de la réponse : donnée fournie par l'appelant, jamais lue depuis l'horloge système ; hors empreinte fiscale. */
  answeredAt: string;
};

/** Source fact (avis de CFE déclaré) + qualification (`cfeBaseKind`). Aucune lecture automatique de l'avis. */
export type CfeQualificationRecord = RecordBase & {
  recordKind: "CFE";
  notice: CfeNotice;
  fact: CfeQualificationFact;
};

/** Fait de nature rattaché à une ligne de charge F012 (frais bancaires, gestion, assurance, comptabilité). */
export type ChargeNatureQualificationRecord = RecordBase & {
  recordKind: "CHARGE_NATURE";
  fact: ChargeNatureFact;
};

export type Article39cQualificationRecord = CfeQualificationRecord | ChargeNatureQualificationRecord;

export type Article39cQualificationStore = {
  storeVersion: typeof ARTICLE_39C_QUALIFICATION_STORE_VERSION;
  records: readonly Article39cQualificationRecord[];
};

export function emptyQualificationStore(): Article39cQualificationStore {
  return { storeVersion: ARTICLE_39C_QUALIFICATION_STORE_VERSION, records: [] };
}

export function scopeKey(scope: Article39cScope): string {
  return scope.level === "PROPERTY" ? `property:${scope.propertyId}` : "activity";
}

function sameScope(a: Article39cScope, b: Article39cScope): boolean {
  return scopeKey(a) === scopeKey(b);
}

function cfeRecordId(scope: Article39cScope, sourceId: string, fiscalYear: number): string {
  return `cfe|${scopeKey(scope)}|${sourceId}|${fiscalYear}`;
}

function natureRecordId(scope: Article39cScope, fact: ChargeNatureFact, fiscalYear: number): string {
  return `nature|${fact.kind}|${scopeKey(scope)}|${fact.lineId}|${fiscalYear}`;
}

function upsert(store: Article39cQualificationStore, record: Article39cQualificationRecord): Article39cQualificationStore {
  const others = store.records.filter((r) => r.recordId !== record.recordId);
  const records = [...others, record].sort((a, b) => (a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0));
  return { storeVersion: ARTICLE_39C_QUALIFICATION_STORE_VERSION, records };
}

/**
 * Enregistre la réponse CFE du client (« base minimum » / « valeur locative » / « je ne sais pas »). L'empreinte est
 * calculée sur l'avis tel que déclaré : montant, document, exercice, rattachement. Une réponse « je ne sais pas » est
 * enregistrée comme `UNKNOWN` (jamais effacée, jamais convertie en MINIMUM, jamais en zéro).
 */
export function recordCfeAnswer(
  store: Article39cQualificationStore,
  input: {
    scope: Article39cScope;
    notice: { sourceId: string; fiscalYear: number; amountCents: number; evidenceRefs?: readonly string[] };
    cfeBaseKind: CfeBaseKind;
    provenance: FactProvenanceKind;
    answeredAt: string;
  },
): Article39cQualificationStore {
  const notice: CfeQualificationRecord["notice"] = {
    sourceId: input.notice.sourceId,
    fiscalYear: input.notice.fiscalYear,
    amountCents: input.notice.amountCents,
    ...(input.scope.level === "PROPERTY" ? { propertyId: input.scope.propertyId } : {}),
    ...(input.notice.evidenceRefs !== undefined ? { evidenceRefs: [...input.notice.evidenceRefs].sort() } : {}),
  };
  const record: CfeQualificationRecord = {
    recordKind: "CFE",
    recordId: cfeRecordId(input.scope, notice.sourceId, notice.fiscalYear),
    scope: input.scope,
    fiscalYear: notice.fiscalYear,
    validation: "VALIDATED",
    answeredAt: input.answeredAt,
    notice,
    fact: {
      sourceId: notice.sourceId,
      fiscalYear: notice.fiscalYear,
      cfeBaseKind: input.cfeBaseKind,
      provenance: input.provenance,
      sourceFingerprint: fingerprintCfeNotice(notice),
      answeredAt: input.answeredAt,
    },
  };
  return upsert(store, record);
}

/**
 * Modifie l'AVIS déclaré (montant, document de preuve) SANS redemander la réponse : la réponse précédente est conservée
 * telle quelle et devient `STALE` à la lecture (l'empreinte ne correspond plus). Jamais de réécriture silencieuse de la
 * qualification.
 */
export function editCfeNotice(
  store: Article39cQualificationStore,
  recordId: string,
  patch: { amountCents?: number; evidenceRefs?: readonly string[] },
): Article39cQualificationStore {
  const record = store.records.find((r): r is CfeQualificationRecord => r.recordKind === "CFE" && r.recordId === recordId);
  if (record === undefined) return store;
  return upsert(store, {
    ...record,
    notice: {
      ...record.notice,
      ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents } : {}),
      ...(patch.evidenceRefs !== undefined ? { evidenceRefs: [...patch.evidenceRefs].sort() } : {}),
    },
  });
}

/** Enregistre un fait de nature (déjà rattaché à l'empreinte COURANTE de la ligne par l'appelant). */
export function recordChargeNatureAnswer(
  store: Article39cQualificationStore,
  input: { scope: Article39cScope; fiscalYear: number; fact: ChargeNatureFact; answeredAt: string },
): Article39cQualificationStore {
  return upsert(store, {
    recordKind: "CHARGE_NATURE",
    recordId: natureRecordId(input.scope, input.fact, input.fiscalYear),
    scope: input.scope,
    fiscalYear: input.fiscalYear,
    validation: "VALIDATED",
    answeredAt: input.answeredAt,
    fact: input.fact,
  });
}

export function cfeRecordIdFor(scope: Article39cScope, sourceId: string, fiscalYear: number): string {
  return cfeRecordId(scope, sourceId, fiscalYear);
}

export function removeQualificationRecord(store: Article39cQualificationStore, recordId: string): Article39cQualificationStore {
  return { storeVersion: ARTICLE_39C_QUALIFICATION_STORE_VERSION, records: store.records.filter((r) => r.recordId !== recordId) };
}

// ---------------------------------------------------------------------------
// Lecture défensive (reload)
// ---------------------------------------------------------------------------

const CFE_KINDS: ReadonlySet<string> = new Set(["MINIMUM", "RENTAL_VALUE", "UNKNOWN"]);
const NATURE_KINDS: ReadonlySet<string> = new Set(["BANK_FEE", "MANAGEMENT_NATURE", "ACCOUNTING_NATURE", "INSURANCE_NATURE"]);

function isScope(value: unknown): value is Article39cScope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.level === "ACTIVITY") return !("propertyId" in v);
  return v.level === "PROPERTY" && typeof v.propertyId === "string" && v.propertyId !== "";
}

function isRecord(value: unknown): value is Article39cQualificationRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  if (typeof r.recordId !== "string" || !isScope(r.scope) || !Number.isInteger(r.fiscalYear)) return false;
  if (r.validation !== "VALIDATED" && r.validation !== "PROPOSED") return false;
  if (typeof r.answeredAt !== "string" || r.answeredAt === "") return false;
  const fact = r.fact as Record<string, unknown> | undefined;
  if (typeof fact !== "object" || fact === null || typeof fact.sourceFingerprint !== "string" || fact.sourceFingerprint === "") return false;
  if (r.recordKind === "CFE") {
    const notice = r.notice as Record<string, unknown> | undefined;
    return (
      typeof notice === "object" &&
      notice !== null &&
      typeof notice.sourceId === "string" &&
      Number.isSafeInteger(notice.amountCents) &&
      typeof fact.cfeBaseKind === "string" &&
      CFE_KINDS.has(fact.cfeBaseKind)
    );
  }
  if (r.recordKind === "CHARGE_NATURE") {
    return typeof fact.kind === "string" && NATURE_KINDS.has(fact.kind) && typeof fact.lineId === "string" && typeof fact.nature === "string";
  }
  return false;
}

/**
 * Restauration défensive : tout enregistrement mal formé est ÉCARTÉ (jamais réparé, jamais promu). Un store absent ou
 * d'une autre version → `undefined` : l'absence reste une absence (UNKNOWN), jamais une valeur par défaut favorable.
 */
export function parseQualificationStore(raw: unknown): Article39cQualificationStore | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const store = raw as Record<string, unknown>;
  if (store.storeVersion !== ARTICLE_39C_QUALIFICATION_STORE_VERSION || !Array.isArray(store.records)) return undefined;
  return { storeVersion: ARTICLE_39C_QUALIFICATION_STORE_VERSION, records: store.records.filter(isRecord) };
}

export type SelectedQualifications = {
  readonly cfe: readonly CfeQualificationRecord[];
  readonly natureFacts: readonly ChargeNatureFact[];
  /** Enregistrements d'un autre bien / niveau présents dans CE store : jamais servis. */
  readonly wrongScopeRecordIds: readonly string[];
};

/**
 * Sélection pour un scope et un exercice. Seuls les enregistrements `VALIDATED` du MÊME scope et du MÊME exercice sont
 * servis ; un enregistrement d'un autre bien (copie erronée) est signalé et ignoré.
 */
export function selectQualifications(
  store: Article39cQualificationStore | undefined,
  scope: Article39cScope,
  fiscalYear: number,
): SelectedQualifications {
  const cfe: CfeQualificationRecord[] = [];
  const natureFacts: ChargeNatureFact[] = [];
  const wrongScopeRecordIds: string[] = [];
  for (const record of store?.records ?? []) {
    if (!sameScope(record.scope, scope)) {
      wrongScopeRecordIds.push(record.recordId);
      continue;
    }
    if (record.fiscalYear !== fiscalYear || record.validation !== "VALIDATED") continue;
    if (record.recordKind === "CFE") cfe.push(record);
    else natureFacts.push(record.fact);
  }
  return { cfe, natureFacts, wrongScopeRecordIds };
}

export { draftCarriesArticle39cQualifications } from "./qualification-draft-carriage";
