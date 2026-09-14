/**
 * F012 V2 document-first — Phase 1 (modèle canonique).
 *
 * `Expense` est la représentation d'une dépense LMNP AVANT sa projection dans
 * le pipeline F-012 existant (`Charge` / `ChargeRegistry` / `computeChargesExercice`
 * / `ComposantNouveau`) — jamais une deuxième vérité fiscale, jamais un
 * résultat calculé. Elle sert de SOURCE à `expenseToCharge()` ci-dessous ;
 * elle ne remplace ni `F012CollectedData` ni `Charge` ni `ComposantNouveau`,
 * qui restent le pipeline réel.
 *
 * ARCHITECTURE CIBLE (Phase 2, non implémentée ici) :
 *
 *   document / saisie → Expense (source canonique persistée)
 *                     → Charge / ChargeRegistry (projection dérivée)
 *                     → ComposantNouveau (projection F-014)
 *
 * `ChargeRegistry` reste ce qu'il est déjà aujourd'hui pour
 * `F012CollectedData` : jamais une source indépendamment mutée, toujours
 * recalculée depuis sa source (`collected` aujourd'hui, `Expense[]` demain).
 * `ChargeProposal` (charge-proposal.ts) est un mécanisme actuel plus étroit
 * (familles documentaires scalaires uniquement, sans travaux/immobilisation) :
 * il est destiné à être absorbé/remplacé par `Expense` en Phase 2
 * document-first — il ne doit JAMAIS devenir une seconde source persistée
 * parallèle à `Expense`. Cette absorption n'est pas faite ici (hors scope
 * Phase 1) ; ce commentaire fixe seulement l'intention.
 *
 * Portée strictement Phase 1 : aucun parcours de collecte, aucune UI, aucune
 * extraction. Seul le modèle + l'adaptateur vers le pipeline existant.
 */

import type { Anomaly } from "../../contracts/Anomaly";
import type { FieldSource } from "../../contracts/FieldSource";
import {
  createRecordedCharge,
  type Charge,
  type ChargeFamilyId,
} from "./charge";
import { createComposantTravaux } from "./create-composant-travaux";
import { qualifyTravail, splitMixteTravaux } from "./qualify-travail";
import type { ChargeCategorie, ComposantNouveau, NatureIntervention } from "./types";

/**
 * Origine de la donnée — distincte de `FieldSource` (provenance KS par
 * champ, réutilisée ci-dessous) : ceci répond à "d'où vient cette dépense
 * dans le dossier", pas "d'où vient chaque valeur". Même distinction déjà
 * établie par `Charge.source` (`ChargeIntakeSource`) vs `Charge.provenance`
 * (`FieldSource`) — étendue ici avec `legacy_migration` pour permettre une
 * future reprise de l'ancien tunnel documentaire (`ChargesExtractionData`)
 * sans lui inventer une provenance qu'il n'a jamais eue.
 */
export type ExpenseOrigin = "document" | "manual" | "dossier" | "legacy_migration";

/**
 * Cycle de vie d'une dépense — mêmes valeurs que `ChargeProposalDecision`
 * (`charge-proposal.ts`, déjà en production pour les propositions
 * documentaires des familles scalaires).
 *
 * P2 — duplication délibérée et provisoire, pas un smell ignoré : déplacer
 * ce vocabulaire vers `src/runtime/contracts/` (où vivent déjà `FieldSource`
 * et `Anomaly`, exactement pour ce genre de type partagé) serait la bonne
 * cible, MAIS cela impliquerait de modifier `charge-proposal.ts`
 * (`assistants/f012-charges/`) pour qu'il importe depuis ce nouvel
 * emplacement — hors périmètre de ce chantier (Phase 1 ne touche que
 * `expense.ts`/`expense.test.ts`, jamais un fichier existant). Restée locale
 * ici intentionnellement ; à factoriser explicitement lors de l'absorption
 * de `ChargeProposal` par `Expense` (Phase 2), pas avant.
 *
 * Sémantique : `pending` = extraite/saisie, jamais revue ; `confirmed` =
 * revue et acceptée telle quelle ; `modified` = corrigée puis acceptée ;
 * `ignored` = écartée (jamais projetée en Charge).
 */
export type ExpenseDecision = "pending" | "confirmed" | "modified" | "ignored";

/** Qualification retenue — mêmes valeurs que `qualifyTravail()` (JUG-008), plus "mixte" (déjà `TravauxQualificationChoix`). Jamais une 4e valeur "à arbitrer" : son absence (`undefined`) EST l'état à arbitrer — cohérent avec le principe du projet "absence ≠ valeur inventée". */
export type ExpenseQualification = "charge" | "immobilisation" | "mixte";

/**
 * Modèle canonique minimal d'une dépense F-012 — chaque champ répond à un
 * besoin lu, projeté, ou exercé par un test contractuel Phase 1 (aucun
 * champ spéculatif "pour plus tard" — audit post-Phase 1, §4).
 *
 * `fournisseur`, `composantId`, `qualificationProposee` et une provenance
 * dédiée pour `qualificationRetenue` ont été retirés du modèle : aucun des
 * quatre n'était lu ni projeté par `expenseToCharge()`/`expenseToComposantNouveau()`,
 * et aucun test contractuel Phase 1 n'en dépendait. `proposeExpenseQualification()`
 * reste disponible telle quelle (elle ne dépendait déjà d'aucun de ces
 * champs) — Phase 2 pourra réintroduire un champ de stockage de la
 * proposition le jour où un appelant réel en aura l'usage.
 */
export interface Expense {
  /** Identité stable — voir `deriveExpenseIdFromDocument()` pour le cas documentaire ; jamais un index, jamais recalculée. */
  id: string;
  exerciceFiscal: number;
  /** Valeur ACTUELLE (post-correction éventuelle) — c'est TOUJOURS celle-ci que projette `expenseToCharge()`. */
  montant: number;
  /**
   * Valeur brute d'extraction, conservée séparément — même contrat que
   * `ChargeProposal.amount`/`.modifiedAmount` (charge-proposal.ts, déjà en
   * production) : `montant` peut diverger de `montantExtrait` une fois
   * corrigé, mais `montantExtrait` n'est jamais effacé — une extraction
   * automatique ne doit jamais devenir indistinguable d'une correction
   * utilisateur. Absent pour une dépense manuelle (jamais rien extrait).
   */
  montantExtrait?: number;
  description: string;
  /** Date de la dépense/facture elle-même, si connue — distincte de `dateDebut` (date propre du composant si immobilisée, TRF-0028). */
  dateDepense?: string;
  origin: ExpenseOrigin;
  /**
   * Référence stable vers le document source — TOUJOURS `LmnpDocument.id`
   * (le seul id canonique documentaire du projet, Supabase `documents.id`
   * ou son repli `crypto.randomUUID()`, jamais un id éphémère type
   * `f012-doc-*`). Jamais le contenu du document lui-même.
   */
  documentId?: string;
  /**
   * Provenance du montant — réutilise `FieldSource` (contrat KS existant,
   * partagé F-009→F-012), jamais un booléen `isValidated`/`isAutomatic`
   * ambigu. Seul `montant` est fiscalement porteur d'une provenance propre
   * ici : la qualification retenue n'a pas besoin de la sienne — son
   * absence/présence encode déjà "à arbitrer" vs "tranchée" (voir
   * `qualificationRetenue`), sans qu'un `FieldSource` supplémentaire ajoute
   * une distinction lue par quoi que ce soit en Phase 1.
   */
  fieldSources: Partial<Record<"montant", FieldSource>>;
  category: ChargeCategorie;
  /** Nature d'intervention (travaux) — mêmes valeurs que `Charge.travaux.natureIntervention`. Absente hors catégorie "travaux". Peut être périmée (proposée puis contredite par `qualificationRetenue`) : voir `resolveNatureIntervention()`, seule autorité de résolution. */
  natureIntervention?: NatureIntervention;
  /** Qualification retenue après arbitrage utilisateur — absente = à arbitrer, jamais une valeur par défaut inventée. AUTORITÉ UNIQUE consommée par `expenseToCharge()` ET `expenseToComposantNouveau()` — les deux ne peuvent donc jamais interpréter différemment la même Expense (correctif post-audit, §1). */
  qualificationRetenue?: ExpenseQualification;
  /** Cas mixte — même contrat que `F012TravauxDraft.montantReparation` (part réparation, le reste = amélioration). */
  montantReparation?: number;
  /** TRF-0028 — date propre du composant si immobilisée, jamais celle du bien. */
  dateDebut?: string;
  /** Ambiguïté nécessitant un arbitrage explicite — même contrat que `Charge.reviewNeeded`. */
  reviewNeeded?: boolean;
  decision: ExpenseDecision;
}

/**
 * Id stable dérivé du document source ET d'un discriminant d'item stable —
 * jamais aléatoire, jamais recalculé à chaque extraction, jamais dérivé
 * d'un index de tableau instable. Un document peut produire plusieurs
 * dépenses (décompte de syndic à plusieurs lignes, facture à plusieurs
 * postes) : `itemKey` doit être un identifiant stable de LA LIGNE/L'ITEM
 * dans ce document (ex. un id de ligne d'extraction, un numéro de poste
 * du document lui-même, ou tout discriminant qui reste identique entre deux
 * extractions du même document) — jamais l'index de sa position dans un
 * tableau reconstruit à chaque parse. Même `documentId` + même `itemKey` →
 * même id de dépense candidate (préparation, sans l'implémenter, de la
 * reconnaissance future "même document → même dépense", hors scope Phase 1).
 */
export function deriveExpenseIdFromDocument(documentId: string, itemKey: string): string {
  return `expense-doc-${documentId}-${itemKey}`;
}

/** Une décision "ignored" ou "pending" ne peut jamais devenir une Charge — même garde que `isProposalRecordable()` (charge-proposal.ts), appliquée ici au niveau de la dépense entière plutôt qu'à un seul champ montant. */
export function isExpenseRecordable(expense: Expense): boolean {
  return expense.decision === "confirmed" || expense.decision === "modified";
}

/**
 * Résout la nature d'intervention effective à partir de `qualificationRetenue`
 * — SEULE autorité, jamais une `natureIntervention` périmée (correctif
 * post-audit P0, §1). `qualificationRetenue` est la décision de
 * l'utilisateur ; elle prime toujours sur toute valeur antérieure de
 * `natureIntervention` (ex. une proposition initiale jamais mise à jour) :
 *
 * - "charge"          → "entretien", quelle que soit `natureIntervention`.
 * - "mixte"           → "entretien" (part réparation ; même convention que
 *                        `F012TravauxDraft` pour une facture mixte).
 * - "immobilisation"  → `natureIntervention` si elle est déjà une nature
 *                        immobilisante (amélioration/construction/
 *                        renouvellement), sinon "amélioration" par défaut —
 *                        jamais "entretien" pour une immobilisation retenue.
 * - absente (à arbitrer) → `natureIntervention` telle quelle (aucune
 *                        autorité encore exprimée ; `qualifyTravail()`
 *                        tranchera via SAV-015 comme pour le cas "incertain"
 *                        existant, sans nouvelle règle).
 *
 * Réutilisée par `expenseToCharge()` ET `expenseToComposantNouveau()` :
 * elles ne peuvent donc jamais résoudre différemment la même Expense.
 */
export function resolveNatureIntervention(
  expense: Pick<Expense, "qualificationRetenue" | "natureIntervention">,
): NatureIntervention | undefined {
  switch (expense.qualificationRetenue) {
    case "charge":
      return "entretien";
    case "mixte":
      return "entretien";
    case "immobilisation":
      return expense.natureIntervention && expense.natureIntervention !== "entretien"
        ? expense.natureIntervention
        : "amélioration";
    default:
      return expense.natureIntervention;
  }
}

/**
 * Nature du composant (immobilisation) — dérivée de `resolveNatureIntervention()`
 * pour le cas "immobilisation" (jamais "entretien" à ce stade, garanti par
 * la fonction ci-dessus), ou fixée à "amélioration" pour la part
 * immobilisation d'un cas "mixte" (même convention déjà appliquée par
 * `compute-charges-exercice.ts` pour une facture mixte). Seule fonction
 * consommée par `expenseToComposantNouveau()` pour la nature du composant —
 * jamais une seconde dérivation indépendante de `natureIntervention` brute.
 */
function resolveComposantNature(
  expense: Pick<Expense, "qualificationRetenue" | "natureIntervention">,
): "amélioration" | "construction" | "renouvellement" {
  if (expense.qualificationRetenue === "mixte") return "amélioration";
  const resolved = resolveNatureIntervention(expense);
  return resolved === "construction" ? "construction" : resolved === "renouvellement" ? "renouvellement" : "amélioration";
}

export type ExpenseToChargeOutput = {
  charge: Charge;
  anomalies: Anomaly[];
};

/**
 * Adaptateur — Expense (source) → Charge (projection consommée par le
 * pipeline F-012 existant : `ChargeRegistry` → `chargeRegistryToComputeInput`
 * → `computeChargesExercice`). Jamais une deuxième vérité : ce Charge est
 * la SEULE représentation fiscale produite ici, immédiatement compatible
 * avec `collectedToChargeRegistry`'s sortie (même type `Charge`).
 *
 * Une dépense non recordable (`ignored`/`pending`) ou dont la qualification
 * reste à arbitrer (`qualificationRetenue` absente) ne devient JAMAIS
 * silencieusement une Charge qualifiée : elle réutilise exactement le même
 * repli que le cas "incertain" de F-012 (nature absente → SAV-015 tranche
 * par le montant, JUG-008 immobilise par prudence au-dessus du seuil, et
 * `compute-charges-exercice.ts` bloque déjà si la date propre manque) —
 * aucune nouvelle règle fiscale, aucun état "ambigu validé" créé ici.
 */
export function expenseToCharge(expense: Expense): ExpenseToChargeOutput {
  const anomalies: Anomaly[] = [];

  if (!isExpenseRecordable(expense)) {
    anomalies.push({
      severity: "error",
      message: `La dépense « ${expense.description} » n'est pas encore validée — elle ne peut pas être comptée.`,
      field: expense.id,
    });
  }

  const familyId: ChargeFamilyId = familyIdFromCategory(expense.category);
  const natureIntervention = resolveNatureIntervention(expense);

  const charge = createRecordedCharge({
    id: expense.id,
    familyId,
    category: expense.category,
    description: expense.description,
    amount: expense.montant,
    exercise: expense.exerciceFiscal,
    paidAt: expense.dateDepense,
    source: expense.documentId ? "document" : expense.origin === "dossier" ? "dossier" : "manual",
    provenance: expense.fieldSources.montant ?? "manual",
    documentIds: expense.documentId ? [expense.documentId] : undefined,
    qualification: expense.qualificationRetenue === "mixte" ? "mixte" : natureIntervention,
    travaux:
      familyId === "travaux"
        ? {
            natureIntervention,
            montantReparation: expense.montantReparation,
            dateDebut: expense.dateDebut,
          }
        : undefined,
    reviewNeeded: expense.qualificationRetenue === undefined ? true : expense.reviewNeeded,
  });

  return { charge, anomalies };
}

function familyIdFromCategory(category: ChargeCategorie): ChargeFamilyId {
  switch (category) {
    case "taxe_fonciere":
      return "impots";
    case "copropriete":
      return "syndic";
    case "assurance_pno":
    case "assurance_gli":
      return "assurances";
    case "honoraires_gestion":
    case "honoraires_comptable":
      return "gestion";
    case "frais_bancaires":
    case "divers":
      return "autres";
    case "travaux":
      return "travaux";
  }
}

/**
 * Cas mixte — même règle que `computeChargesExercice()` (facture mixte
 * travaux) : réutilise `splitMixteTravaux()` (TRF-0026), jamais une seconde
 * formule de répartition. Ne crée pas encore deux `Charge` séparées (hors
 * scope Phase 1, l'adaptateur reste un point de démonstration) — seulement
 * la répartition elle-même, pour prouver que montant charge + montant
 * immobilisation = montant total de la dépense.
 */
export function splitExpenseMontant(expense: Expense): { charge: number; immobilisation: number } {
  return splitMixteTravaux(expense.montant, expense.montantReparation ?? 0);
}

/**
 * Adaptateur — Expense (source) → `ComposantNouveau` (même fonction déjà
 * utilisée par F-012 lui-même, `createComposantTravaux`, TRF-0028/JUG-013) :
 * jamais un second calcul de dotation/durée. `undefined` si la dépense
 * n'est pas encore validée, si elle n'est pas (au moins en partie)
 * immobilisée, ou si sa date propre manque — jamais une date héritée du
 * bien, jamais un composant fabriqué pour combler l'absence (même garde
 * que `compute-charges-exercice.ts`).
 *
 * Utilise `resolveNatureIntervention()`/`resolveComposantNature()` — les
 * mêmes fonctions que `expenseToCharge()` : pour une même Expense, les deux
 * adaptateurs ne peuvent jamais diverger sur la nature retenue (correctif
 * post-audit P0, §1). L'identité du composant est TOUJOURS celle de la
 * dépense d'origine (`expense.id`) — traçabilité directe, jamais un second
 * montant indépendant susceptible de diverger.
 */
export function expenseToComposantNouveau(expense: Expense): ComposantNouveau | undefined {
  if (!isExpenseRecordable(expense)) return undefined;
  if (expense.qualificationRetenue !== "immobilisation" && expense.qualificationRetenue !== "mixte") return undefined;
  if (!expense.dateDebut) return undefined;

  const montant =
    expense.qualificationRetenue === "mixte" ? splitExpenseMontant(expense).immobilisation : expense.montant;
  if (montant <= 0) return undefined;

  return createComposantTravaux({
    id: expense.id,
    label: expense.description,
    montant,
    nature: resolveComposantNature(expense),
    dateDebut: expense.dateDebut,
    origin: "f012_travaux",
  }).composant;
}

/**
 * Qualification proposée déterministe (JUG-008/SAV-015) — jamais promue
 * automatiquement en qualification retenue. Réutilise `qualifyTravail()`
 * telle quelle : aucune nouvelle règle fiscale. Pure fonction de calcul :
 * ne lit ni n'écrit `Expense.qualificationRetenue` — l'appelant (Phase 2)
 * décide seul quoi faire de la proposition renvoyée.
 */
export function proposeExpenseQualification(expense: Pick<Expense, "description" | "montant" | "natureIntervention">): ExpenseQualification {
  const result = qualifyTravail({
    description: expense.description,
    montant: expense.montant,
    natureIntervention: expense.natureIntervention,
  });
  return result.qualification;
}
