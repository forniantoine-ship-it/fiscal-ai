/**
 * F013 v2 — inventaire locatif commun F013 / bilan (source unique).
 *
 * Les quatre soldes (créances et avances, ouverture et clôture) sont ÉDITÉS à un seul endroit : les faits de
 * `rentReconciliationV2` (par bien et exercice). Ce module est un MODÈLE DE LECTURE pur : il ne persiste rien, ne copie
 * rien dans un second stockage et ne calcule aucun loyer acquis (le moteur V2.1 reste l'autorité). Il projette les
 * soldes de CLÔTURE vers les natures du bilan existant :
 *
 *   créance de clôture → LOYER_DU_PAR_LOCATAIRE  (case 068, actif)
 *   avance de clôture  → LOYER_ENCAISSE_D_AVANCE (case 174, passif)
 *
 * Les soldes d'OUVERTURE n'alimentent jamais un poste de clôture. UNKNOWN et PROPOSED ne deviennent jamais un poste
 * définitif ni un zéro confirmé. Aucune écriture comptable, aucun compte, aucun FEC.
 */
import type { BilanInputs, NatureEconomique, PosteEconomiqueInput } from "@/runtime/capabilities/bilan/types";
import type { FactProvenance, MoneyFact } from "./f013-v2-contract";
import { factsDigest, type RentReconciliationV2State } from "./f013-v2-state";

export type RentalInventoryKey = "openingReceivables" | "closingReceivables" | "openingAdvances" | "closingAdvances";

export interface RentalInventoryFact {
  propertyId: string;
  fiscalYear: number;
  key: RentalInventoryKey;
  side: "opening" | "closing";
  kind: "receivable" | "advance";
  status: MoneyFact["status"];
  /** Absent si UNKNOWN : jamais un zéro. */
  amountCents?: number;
  provenance?: FactProvenance;
  /** Observations documentaires liées (V2.3) — preuves, jamais une seconde valeur. */
  observationIds: readonly string[];
  /** Révision et empreinte des faits d'où provient cette lecture (fraîcheur, continuité future identifiable). */
  revision: number;
  factsDigest: string;
}

export interface RentalInventoryView {
  propertyId: string;
  fiscalYear: number;
  revision: number;
  facts: Record<RentalInventoryKey, RentalInventoryFact>;
}

const KEYS: ReadonlyArray<{ key: RentalInventoryKey; side: "opening" | "closing"; kind: "receivable" | "advance" }> = [
  { key: "openingReceivables", side: "opening", kind: "receivable" },
  { key: "closingReceivables", side: "closing", kind: "receivable" },
  { key: "openingAdvances", side: "opening", kind: "advance" },
  { key: "closingAdvances", side: "closing", kind: "advance" },
];

/** Lecture de l'inventaire d'un bien : les MÊMES faits que le moteur F013 v2 (aucune copie éditable). */
export function readRentalInventory(state: RentReconciliationV2State): RentalInventoryView {
  const f = state.facts;
  const digest = factsDigest(f);
  const facts = {} as Record<RentalInventoryKey, RentalInventoryFact>;
  for (const { key, side, kind } of KEYS) {
    const fact = f[key];
    facts[key] = {
      propertyId: f.propertyId,
      fiscalYear: f.fiscalYear,
      key,
      side,
      kind,
      status: fact.status,
      ...(fact.status !== "UNKNOWN" ? { amountCents: fact.amountCents } : {}),
      ...(fact.status !== "UNKNOWN" && fact.provenance ? { provenance: fact.provenance } : {}),
      observationIds: [...(f.links?.observationIds ?? [])],
      revision: f.revision,
      factsDigest: digest,
    };
  }
  return { propertyId: f.propertyId, fiscalYear: f.fiscalYear, revision: f.revision, facts };
}

export const RENT_INVENTORY_SOURCE = "f013_v2_rental_inventory" as const;

type ProjectedNature = Extract<NatureEconomique, "LOYER_DU_PAR_LOCATAIRE" | "LOYER_ENCAISSE_D_AVANCE">;
const NATURE_KEY: Record<ProjectedNature, RentalInventoryKey> = {
  LOYER_DU_PAR_LOCATAIRE: "closingReceivables",
  LOYER_ENCAISSE_D_AVANCE: "closingAdvances",
};

export interface BilanRentProjection {
  fiscalYear: number;
  /** Natures dont l'inventaire est DÉFINITIF pour TOUS les biens de l'exercice (donc seules à pouvoir remplacer le bilan). */
  providedNatures: readonly ProjectedNature[];
  postes: readonly PosteEconomiqueInput[];
  naturesConfirmeesVides: readonly ProjectedNature[];
  /** Soldes seulement PROPOSÉS : affichables, jamais ventilés ni confirmés. */
  proposed: ReadonlyArray<{ propertyId: string; nature: ProjectedNature; amountCents: number }>;
  /** Soldes inconnus ou absents : le bilan reste INCONNU (jamais zéro). */
  unknown: ReadonlyArray<{ propertyId: string; nature: ProjectedNature }>;
  byProperty: Readonly<Record<string, { receivableCents: number | null; advanceCents: number | null; revision: number | null }>>;
}

const toEuros = (cents: number) => Number((cents / 100).toFixed(2));

/**
 * Projection bilan des soldes de clôture. `propertyIds` = tous les biens de l'exercice : un solde n'est « fourni » que si
 * CHAQUE bien a un état v2 de CET exercice avec le fait VALIDÉ (jamais une somme partielle présentée comme complète).
 */
export function projectRentalInventoryToBilan(input: {
  fiscalYear: number;
  propertyIds: readonly string[];
  states: readonly RentReconciliationV2State[];
}): BilanRentProjection {
  const stateOf = new Map<string, RentReconciliationV2State>();
  for (const s of input.states) {
    if (s.facts.fiscalYear === input.fiscalYear && input.propertyIds.includes(s.facts.propertyId)) stateOf.set(s.facts.propertyId, s);
  }
  const postes: PosteEconomiqueInput[] = [];
  const confirmedEmpty: ProjectedNature[] = [];
  const provided: ProjectedNature[] = [];
  const proposed: Array<{ propertyId: string; nature: ProjectedNature; amountCents: number }> = [];
  const unknown: Array<{ propertyId: string; nature: ProjectedNature }> = [];
  const byProperty: Record<string, { receivableCents: number | null; advanceCents: number | null; revision: number | null }> = {};

  for (const propertyId of input.propertyIds) {
    const s = stateOf.get(propertyId);
    byProperty[propertyId] = {
      receivableCents: s && s.facts.closingReceivables.status === "VALIDATED" ? s.facts.closingReceivables.amountCents : null,
      advanceCents: s && s.facts.closingAdvances.status === "VALIDATED" ? s.facts.closingAdvances.amountCents : null,
      revision: s ? s.facts.revision : null,
    };
  }

  for (const nature of Object.keys(NATURE_KEY) as ProjectedNature[]) {
    const key = NATURE_KEY[nature];
    const natureLines: PosteEconomiqueInput[] = [];
    let definitive = input.propertyIds.length > 0;
    for (const propertyId of input.propertyIds) {
      const fact = stateOf.get(propertyId)?.facts[key] ?? ({ status: "UNKNOWN" } as MoneyFact);
      if (fact.status === "VALIDATED") {
        if (fact.amountCents > 0) {
          natureLines.push({
            id: `rent-inventory:${propertyId}:${input.fiscalYear}:${key}`,
            montant: toEuros(fact.amountCents),
            nature,
            source: RENT_INVENTORY_SOURCE,
          });
        }
      } else {
        definitive = false;
        if (fact.status === "PROPOSED") proposed.push({ propertyId, nature, amountCents: fact.amountCents });
        else unknown.push({ propertyId, nature });
      }
    }
    if (!definitive) continue;
    provided.push(nature);
    if (natureLines.length === 0) confirmedEmpty.push(nature);
    else postes.push(...natureLines);
  }

  return { fiscalYear: input.fiscalYear, providedNatures: provided, postes, naturesConfirmeesVides: confirmedEmpty, proposed, unknown, byProperty };
}

export interface MergeRentInventoryResult {
  bilan: BilanInputs;
  /** Postes ou confirmations saisis séparément dans le bilan et REMPLACÉS par l'inventaire (une seule valeur courante). */
  superseded: ReadonlyArray<{ nature: ProjectedNature; kind: "poste" | "confirmation_vide"; id?: string; montant?: number }>;
}

/**
 * Entrées bilan effectives : pour chaque nature fournie DE FAÇON DÉFINITIVE par l'inventaire, la valeur de l'inventaire
 * remplace toute saisie bilan indépendante de la même nature (jamais d'addition, jamais deux valeurs). Les saisies
 * remplacées sont listées (audit) et jamais détruites dans le stockage : c'est une vue effective, non une écriture.
 * Sans inventaire définitif : le bilan est rendu STRICTEMENT inchangé (même objet).
 */
export function mergeRentInventoryIntoBilan(bilan: BilanInputs, projection: BilanRentProjection): MergeRentInventoryResult {
  if (projection.providedNatures.length === 0) return { bilan, superseded: [] };
  const owned = new Set<NatureEconomique>(projection.providedNatures);
  const existing = bilan.ventilationTiers;
  const superseded: Array<{ nature: ProjectedNature; kind: "poste" | "confirmation_vide"; id?: string; montant?: number }> = [];

  const keptPostes: PosteEconomiqueInput[] = [];
  for (const poste of existing?.postes ?? []) {
    if (owned.has(poste.nature)) superseded.push({ nature: poste.nature as ProjectedNature, kind: "poste", id: poste.id, montant: poste.montant });
    else keptPostes.push(poste);
  }
  const keptConfirmations: NatureEconomique[] = [];
  for (const nature of existing?.naturesConfirmeesVides ?? []) {
    if (owned.has(nature)) superseded.push({ nature: nature as ProjectedNature, kind: "confirmation_vide" });
    else keptConfirmations.push(nature);
  }

  const postes = [...keptPostes, ...projection.postes];
  const confirmations = [...keptConfirmations, ...projection.naturesConfirmeesVides];
  return {
    bilan: {
      ...bilan,
      ventilationTiers: {
        ...(postes.length > 0 ? { postes } : {}),
        ...(confirmations.length > 0 ? { naturesConfirmeesVides: confirmations } : {}),
      },
    },
    superseded,
  };
}
