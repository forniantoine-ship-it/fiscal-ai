/**
 * Dispense de production du bilan simplifié 2033-A (CGI, art. 302 septies A
 * bis, VI) — pour un exploitant individuel LMNP au régime réel simplifié.
 *
 * Source : BOI-BIC-DECLA-30-20-10 (dispense = faculté, jamais une obligation
 * d'omettre le document) et BOI-BAREME-000044 (seuils révisés tous les trois
 * ans). Le seuil applicable au LMNP est TOUJOURS celui des « autres
 * entreprises » — la notice BOFiP exclut explicitement les locations
 * meublées de la catégorie « fourniture de logement » (seuil supérieur).
 *
 * Ce module ne modélise QUE la règle du seuil et de la faculté — jamais la
 * suppression du reste de la liasse (2031/2033-B/C/D, inchangés), jamais la
 * règle distincte du 2033-E (SAV-029).
 *
 * Aucune valeur de seuil n'est scattée dans le reste du code : toute
 * consommation de ce seuil doit passer par `resolveSeuilDispense2033A()`.
 */

/** Seuils publiés par triennium — n'ajouter une entrée qu'après vérification BOFiP explicite. */
type TrienniumSeuil = {
  premierExercice: number;
  dernierExercice: number;
  seuilAutresEntreprisesHT: number;
  triennium: string;
  source: string;
};

const SEUILS_DISPENSE_2033A: readonly TrienniumSeuil[] = [
  {
    premierExercice: 2023,
    dernierExercice: 2025,
    seuilAutresEntreprisesHT: 61_000,
    triennium: "2023-2025",
    source: "BOI-BAREME-000044, §IV — seuils applicables pour les années 2023 à 2025",
  },
  {
    premierExercice: 2026,
    dernierExercice: 2028,
    seuilAutresEntreprisesHT: 66_000,
    triennium: "2026-2028",
    source: "BOI-BAREME-000044, §IV — seuils applicables pour les années 2026 à 2028",
  },
];

export type Dispense2033ASeuil = {
  triennium: string;
  seuilAutresEntreprisesHT: number;
  source: string;
};

/**
 * `undefined` si l'exercice tombe hors des triennium connus — jamais une
 * réutilisation silencieuse du dernier seuil connu pour un exercice futur
 * non encore publié par le BOFiP.
 */
export function resolveSeuilDispense2033A(exercice: number): Dispense2033ASeuil | undefined {
  const found = SEUILS_DISPENSE_2033A.find((s) => exercice >= s.premierExercice && exercice <= s.dernierExercice);
  if (!found) return undefined;
  return { triennium: found.triennium, seuilAutresEntreprisesHT: found.seuilAutresEntreprisesHT, source: found.source };
}

// ---------------------------------------------------------------------------
// Chiffre d'affaires de référence (N-1, année civile, méthode article 50-0)
// ---------------------------------------------------------------------------

/**
 * Correction audit contradictoire — AUCUNE dérivation automatique n'est
 * tentée depuis `dateMiseEnService` (F-009/F-010) : cette date est une date
 * de mise en service du BIEN ("date à laquelle le logement était disponible
 * à la location", voir `f009-activite/assistant.ts`), structurellement
 * distincte de la date de début D'ACTIVITÉ de l'exploitant
 * (`activityStartDate`/`dateDebutActivite`, elle-même documentée comme
 * potentiellement différente — F009_QUESTIONS.activity_date). Le seuil de
 * dispense (art. 302 septies A bis VI) porte sur le chiffre d'affaires de
 * L'EXPLOITANT, pas sur l'ancienneté d'UN bien : un exploitant ayant déjà
 * une activité LMNP (autre bien, bien remplacé en cours d'année) aurait
 * `dateMiseEnService` dans l'exercice courant pour CE bien tout en ayant un
 * chiffre d'affaires N-1 réel et potentiellement supérieur au seuil. Règle
 * V1 volontairement simple et sûre : aucun fait authentique de continuité de
 * recettes n'existe aujourd'hui (`FiscalYearClosure` ne porte pas ce fait) —
 * en son absence, le chiffre d'affaires de référence reste TOUJOURS à
 * déclarer explicitement par le client, y compris pour un dossier
 * apparemment de première année. Une question explicite est préférable à
 * une inférence non prouvée.
 *
 * `DECLARE` — fait explicite fourni par le client, valide (fini, ≥ 0)
 * uniquement — voir `resolveCaReferenceN1Fact()`.
 * `INCONNU` — absent, ou valeur invalide (NaN/Infinity/négatif/malformée) ⇔
 * INCONNU, jamais une valeur de repli à 0 ni une valeur invalide acceptée.
 */
export type CaReferenceN1Fact = { status: "DECLARE"; montant: number } | { status: "INCONNU"; raison: string };

const RAISON_CA_N1_ABSENTE =
  "Aucune continuité de recettes N-1 n'est aujourd'hui persistée d'un exercice à l'autre (FiscalYearClosure ne porte pas ce fait) et aucune autre source authentique n'existe — le chiffre d'affaires de référence reste à déclarer explicitement, y compris pour un dossier de première année.";

const RAISON_CA_N1_INVALIDE =
  "Chiffre d'affaires N-1 saisi invalide (doit être un nombre fini, supérieur ou égal à 0) — jamais interprété comme une valeur exploitable, jamais arrondi ni corrigé silencieusement.";

/** Fini et ≥ 0 — rejette NaN, +/-Infinity et tout nombre négatif. */
function isValidCaReferenceN1(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function resolveCaReferenceN1Fact(input: { caReferenceN1Declaree?: number }): CaReferenceN1Fact {
  if (input.caReferenceN1Declaree === undefined) {
    return { status: "INCONNU", raison: RAISON_CA_N1_ABSENTE };
  }
  if (!isValidCaReferenceN1(input.caReferenceN1Declaree)) {
    return { status: "INCONNU", raison: RAISON_CA_N1_INVALIDE };
  }
  return { status: "DECLARE", montant: input.caReferenceN1Declaree };
}

// ---------------------------------------------------------------------------
// Éligibilité à la dispense
// ---------------------------------------------------------------------------

export type Dispense2033AEligibiliteEtat = "ELIGIBLE" | "NOT_ELIGIBLE" | "UNKNOWN";

export type Dispense2033AEligibilite =
  | { etat: "ELIGIBLE"; seuil: Dispense2033ASeuil; caReferenceN1: number; raison: string }
  | { etat: "NOT_ELIGIBLE"; seuil: Dispense2033ASeuil; caReferenceN1: number; raison: string }
  | { etat: "UNKNOWN"; raison: string };

/**
 * Ne compare JAMAIS un chiffre d'affaires de l'exercice courant à ce seuil —
 * uniquement `CaReferenceN1Fact`, dont la doctrine ci-dessus interdit déjà
 * toute confusion avec les recettes de l'exercice en cours.
 */
export function resolveDispense2033AEligibilite(input: {
  exercice: number;
  caReferenceN1: CaReferenceN1Fact;
}): Dispense2033AEligibilite {
  const seuil = resolveSeuilDispense2033A(input.exercice);
  if (!seuil) {
    return {
      etat: "UNKNOWN",
      raison: `Aucun seuil de dispense de bilan publié pour l'exercice ${input.exercice} dans ce module — ne jamais réutiliser silencieusement le seuil d'un autre triennium.`,
    };
  }

  if (input.caReferenceN1.status === "INCONNU") {
    return { etat: "UNKNOWN", raison: input.caReferenceN1.raison };
  }

  const caReferenceN1 = input.caReferenceN1.montant;

  if (caReferenceN1 <= seuil.seuilAutresEntreprisesHT) {
    return {
      etat: "ELIGIBLE",
      seuil,
      caReferenceN1,
      raison: `Chiffre d'affaires N-1 (${caReferenceN1} € HT) ≤ seuil "autres entreprises" (${seuil.seuilAutresEntreprisesHT} € HT, ${seuil.triennium}) — la location meublée est exclue par la notice BOFiP de la catégorie "fourniture de logement" (seuil supérieur), quel que soit le montant.`,
    };
  }
  return {
    etat: "NOT_ELIGIBLE",
    seuil,
    caReferenceN1,
    raison: `Chiffre d'affaires N-1 (${caReferenceN1} € HT) > seuil "autres entreprises" (${seuil.seuilAutresEntreprisesHT} € HT, ${seuil.triennium}).`,
  };
}

// ---------------------------------------------------------------------------
// Décision client — la dispense reste une faculté, jamais une obligation
// ---------------------------------------------------------------------------

export type Dispense2033ADecision = "FILE_2033A" | "USE_DISPENSE";

/** État complet transporté par la RFS — champ additif, jamais une donnée fiscale recalculée. */
export type Dispense2033AState = {
  eligibilite: Dispense2033AEligibilite;
  /** Non pertinent si `eligibilite.etat !== "ELIGIBLE"` — jamais consulté dans ce cas par `isDispense2033AEnEffet`. */
  decision?: Dispense2033ADecision;
};

/**
 * Source unique de la question « le 2033-A doit-il être absent de la liasse
 * livrée ? » — consommée à l'identique par le payload client
 * (`download-cerfa-pdf.ts`), la frontière serveur (`cerfa-pdf/route.ts`) et
 * la déclarabilité finale (`final-declarability.ts`) : jamais une seconde
 * implémentation de cette condition.
 */
export function isDispense2033AEnEffet(dispense2033A: Dispense2033AState | undefined): boolean {
  return dispense2033A?.eligibilite.etat === "ELIGIBLE" && dispense2033A.decision === "USE_DISPENSE";
}
