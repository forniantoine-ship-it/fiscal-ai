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

/**
 * Rapprochement explicite d'une CFE déclarée avec une ligne F012 « divers » : jamais déduit d'un libellé.
 * `LINKED` : la ligne F012 désignée EST cette CFE (elle n'est alors plus comptée en F012). `DECLARED_DISTINCT` : le client
 * affirme que la CFE n'est pas déjà saisie en charges diverses. `UNKNOWN` (« je ne sais pas ») : la question n'est plus posée
 * mais le conflit reste ouvert (jamais résolu par défaut). Absent : conflit détecté si un montant identique existe.
 */
export type CfeDiversLinkage =
  /** `propertyId` : seulement pour une CFE de niveau ACTIVITÉ liée à une ligne « divers » d'un bien. */
  | { kind: "LINKED"; lineId: string; propertyId?: string }
  | { kind: "DECLARED_DISTINCT" }
  | { kind: "UNKNOWN" };

/**
 * Source fact (avis de CFE déclaré : montant, exercice, rattachement, documents) + qualification (`cfeBaseKind`), absente
 * tant que le client n'a pas répondu. Aucune lecture automatique de l'avis.
 */
export type CfeQualificationRecord = RecordBase & {
  recordKind: "CFE";
  notice: CfeNotice;
  fact?: CfeQualificationFact;
  diversLinkage?: CfeDiversLinkage;
};

/** Fait de nature rattaché à une ligne de charge F012 (frais bancaires, gestion, assurance, comptabilité). */
export type ChargeNatureQualificationRecord = RecordBase & {
  recordKind: "CHARGE_NATURE";
  fact: ChargeNatureFact;
};

/**
 * INT-4 — charge GLOBALE de l'activité (niveau activité, jamais de `propertyId`, jamais répartie). Représentation persistée
 * minimale sur le modèle d'une ligne F012 (pas de second assistant) : nature décrite en langage courant par le client.
 * Seules les natures « comptabilité » et « logiciel de comptabilité / de déclaration » sont définitivement ACTIVITY
 * (SAV-031) ; toute autre charge globale reste non résolue.
 */
export type ActivityChargeNature = "ACCOUNTING_FEES" | "ACCOUNTING_OR_TAX_SOFTWARE" | "OTHER";

export type ActivityChargeSource = {
  sourceId: string;
  fiscalYear: number;
  nature: ActivityChargeNature;
  amountCents: number;
  description: string;
  documentIds?: readonly string[];
  provenance: FactProvenanceKind;
  /** Le client affirme que cette dépense n'est PAS déjà saisie dans les charges d'un logement (même montant). */
  distinctFromPropertyCharges?: boolean;
};

export type ActivityChargeQualificationRecord = RecordBase & {
  recordKind: "ACTIVITY_CHARGE";
  charge: ActivityChargeSource;
};

export type Article39cQualificationRecord = CfeQualificationRecord | ChargeNatureQualificationRecord | ActivityChargeQualificationRecord;

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

function sameIgnoringAnsweredAt(a: Article39cQualificationRecord, b: Article39cQualificationRecord): boolean {
  const strip = (r: Article39cQualificationRecord): unknown =>
    JSON.parse(JSON.stringify(r, (key, value) => (key === "answeredAt" ? undefined : value)));
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/** Insertion qui ne modifie RIEN (même référence) si le contenu fiscal est identique : pas d'invalidation parasite. */
function upsertIfChanged(store: Article39cQualificationStore, record: Article39cQualificationRecord): Article39cQualificationStore {
  const existing = store.records.find((r) => r.recordId === record.recordId);
  if (existing !== undefined && sameIgnoringAnsweredAt(existing, record)) return store;
  return upsert(store, record);
}

function buildCfeNotice(
  scope: Article39cScope,
  notice: { sourceId: string; fiscalYear: number; amountCents: number; evidenceRefs?: readonly string[] },
): CfeQualificationRecord["notice"] {
  return {
    sourceId: notice.sourceId,
    fiscalYear: notice.fiscalYear,
    amountCents: notice.amountCents,
    ...(scope.level === "PROPERTY" ? { propertyId: scope.propertyId } : {}),
    ...(notice.evidenceRefs !== undefined ? { evidenceRefs: [...notice.evidenceRefs].sort() } : {}),
  };
}

/**
 * Déclare la SOURCE d'une CFE (avis) sans réponse sur sa base : identité unique (scope, sourceId, exercice). La réponse
 * reste absente = `UNKNOWN` (jamais MINIMUM) tant que le client n'a pas répondu. Redéclarer un avis modifié conserve une
 * éventuelle réponse précédente, qui devient `STALE` (jamais réécrite).
 */
export function declareCfeNotice(
  store: Article39cQualificationStore,
  input: {
    scope: Article39cScope;
    notice: { sourceId: string; fiscalYear: number; amountCents: number; evidenceRefs?: readonly string[] };
    answeredAt: string;
    diversLinkage?: CfeDiversLinkage;
  },
): Article39cQualificationStore {
  const notice = buildCfeNotice(input.scope, input.notice);
  const recordId = cfeRecordId(input.scope, notice.sourceId, notice.fiscalYear);
  const previous = store.records.find((r): r is CfeQualificationRecord => r.recordKind === "CFE" && r.recordId === recordId);
  const linkage = input.diversLinkage ?? previous?.diversLinkage;
  return upsertIfChanged(store, {
    recordKind: "CFE",
    recordId,
    scope: input.scope,
    fiscalYear: notice.fiscalYear,
    validation: "VALIDATED",
    answeredAt: input.answeredAt,
    notice,
    ...(previous?.fact !== undefined ? { fact: previous.fact } : {}),
    ...(linkage !== undefined ? { diversLinkage: linkage } : {}),
  });
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
    diversLinkage?: CfeDiversLinkage;
  },
): Article39cQualificationStore {
  const notice = buildCfeNotice(input.scope, input.notice);
  const recordId = cfeRecordId(input.scope, notice.sourceId, notice.fiscalYear);
  const previous = store.records.find((r): r is CfeQualificationRecord => r.recordKind === "CFE" && r.recordId === recordId);
  const linkage = input.diversLinkage ?? previous?.diversLinkage;
  return upsertIfChanged(store, {
    recordKind: "CFE",
    recordId,
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
    ...(linkage !== undefined ? { diversLinkage: linkage } : {}),
  });
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
  return upsertIfChanged(store, {
    recordKind: "CHARGE_NATURE",
    recordId: natureRecordId(input.scope, input.fact, input.fiscalYear),
    scope: input.scope,
    fiscalYear: input.fiscalYear,
    validation: "VALIDATED",
    answeredAt: input.answeredAt,
    fact: input.fact,
  });
}

function activityChargeRecordId(sourceId: string, fiscalYear: number): string {
  return `activity-charge|activity|${sourceId}|${fiscalYear}`;
}

export function activityChargeRecordIdFor(sourceId: string, fiscalYear: number): string {
  return activityChargeRecordId(sourceId, fiscalYear);
}

/** Déclare (ou modifie) une charge globale d'activité : identité unique (sourceId, exercice) ; contenu identique = no-op. */
export function recordActivityCharge(
  store: Article39cQualificationStore,
  input: { charge: ActivityChargeSource; answeredAt: string },
): Article39cQualificationStore {
  const c = input.charge;
  return upsertIfChanged(store, {
    recordKind: "ACTIVITY_CHARGE",
    recordId: activityChargeRecordId(c.sourceId, c.fiscalYear),
    scope: { level: "ACTIVITY" },
    fiscalYear: c.fiscalYear,
    validation: "VALIDATED",
    answeredAt: input.answeredAt,
    charge: {
      sourceId: c.sourceId,
      fiscalYear: c.fiscalYear,
      nature: c.nature,
      amountCents: c.amountCents,
      description: c.description,
      ...(c.documentIds !== undefined ? { documentIds: [...c.documentIds].sort() } : {}),
      provenance: c.provenance,
      ...(c.distinctFromPropertyCharges !== undefined ? { distinctFromPropertyCharges: c.distinctFromPropertyCharges } : {}),
    },
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
  if (r.recordKind === "ACTIVITY_CHARGE") {
    const charge = r.charge as Record<string, unknown> | undefined;
    return (
      (r.scope as Article39cScope).level === "ACTIVITY" &&
      typeof charge === "object" &&
      charge !== null &&
      typeof charge.sourceId === "string" &&
      charge.sourceId !== "" &&
      Number.isInteger(charge.fiscalYear) &&
      (charge.nature === "ACCOUNTING_FEES" || charge.nature === "ACCOUNTING_OR_TAX_SOFTWARE" || charge.nature === "OTHER") &&
      Number.isSafeInteger(charge.amountCents) &&
      (charge.amountCents as number) > 0 &&
      typeof charge.description === "string"
    );
  }
  if (r.recordKind === "CFE") {
    const notice = r.notice as Record<string, unknown> | undefined;
    const noticeOk = typeof notice === "object" && notice !== null && typeof notice.sourceId === "string" && Number.isSafeInteger(notice.amountCents);
    // La réponse est facultative (source déclarée, base non répondue) ; si elle est présente, elle doit être complète.
    const factOk =
      fact === undefined ||
      (typeof fact === "object" && fact !== null && typeof fact.sourceFingerprint === "string" && fact.sourceFingerprint !== "" && typeof fact.cfeBaseKind === "string" && CFE_KINDS.has(fact.cfeBaseKind));
    const linkage = r.diversLinkage as Record<string, unknown> | undefined;
    const linkageOk =
      linkage === undefined ||
      (typeof linkage === "object" && linkage !== null && (linkage.kind === "DECLARED_DISTINCT" || linkage.kind === "UNKNOWN" || (linkage.kind === "LINKED" && typeof linkage.lineId === "string" && linkage.lineId !== "" && (linkage.propertyId === undefined || (typeof linkage.propertyId === "string" && linkage.propertyId !== "")))));
    return noticeOk && factOk && linkageOk;
  }
  if (typeof fact !== "object" || fact === null || typeof fact.sourceFingerprint !== "string" || fact.sourceFingerprint === "") return false;
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
  /** Charges globales de l'activité (store d'activité uniquement). */
  readonly activityCharges: readonly ActivityChargeQualificationRecord[];
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
  const activityCharges: ActivityChargeQualificationRecord[] = [];
  const wrongScopeRecordIds: string[] = [];
  for (const record of store?.records ?? []) {
    if (!sameScope(record.scope, scope)) {
      wrongScopeRecordIds.push(record.recordId);
      continue;
    }
    if (record.fiscalYear !== fiscalYear || record.validation !== "VALIDATED") continue;
    if (record.recordKind === "CFE") cfe.push(record);
    else if (record.recordKind === "ACTIVITY_CHARGE") activityCharges.push(record);
    else natureFacts.push(record.fact);
  }
  return { cfe, natureFacts, activityCharges, wrongScopeRecordIds };
}

export { draftCarriesArticle39cQualifications } from "./qualification-draft-carriage";
