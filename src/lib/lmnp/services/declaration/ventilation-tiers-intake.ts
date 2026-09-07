import type { NatureEconomique, PosteEconomiqueInput, VentilationTiersInputs } from "@/runtime/capabilities/bilan/types";
import { parseMontantSaisi } from "./parse-montant-saisi";

/**
 * B-FAMILY-2 — état UI pur pour la collecte des 5 natures famille B
 * (068/072/164/166/172), en deux listes ("à recevoir" / "à payer"). Module
 * entièrement testable sans React, même convention que `patrimonial-intake.ts`.
 *
 * Ne construit AUCUN `BilanInputs`/`VentilationTiersInputs` — ce module ne
 * fait que préparer/collecter l'état UI ; la traduction vers
 * `naturesConfirmeesVides`/`postes[]` est le périmètre de B-FAMILY-3.
 *
 * NATURE_INCONNUE, EMPRUNT, DECOUVERT_BANCAIRE et les 4 natures famille C
 * (déjà couvertes par P1-B1 : ACOMPTE_VERSE_A_FOURNISSEUR,
 * CHARGE_CONSTATEE_AVANCE, LOYER_ENCAISSE_D_AVANCE, DEPOT_GARANTIE_LOCATAIRE)
 * n'apparaissent JAMAIS dans les listes ci-dessous — exhaustivement énumérées,
 * jamais dérivées d'une liste plus large filtrée.
 */

export type NatureOption = { readonly nature: NatureEconomique; readonly label: string };

/** Case 068 / 072 — jamais les 4 natures famille C ni NATURE_INCONNUE/EMPRUNT/DECOUVERT. */
export const NATURES_A_RECEVOIR: readonly NatureOption[] = [
  { nature: "LOYER_DU_PAR_LOCATAIRE", label: "Loyer dû par le locataire" },
  { nature: "AUTRE_CREANCE_ACTIVITE", label: "Autre somme à recevoir liée à l'activité" },
];

/** Case 164 / 166 / 172 — jamais les 4 natures famille C ni NATURE_INCONNUE/EMPRUNT/DECOUVERT. */
export const NATURES_A_PAYER: readonly NatureOption[] = [
  { nature: "ACOMPTE_RECU_SUR_COMMANDE", label: "Acompte reçu sur commande" },
  { nature: "FOURNISSEUR_NON_PAYE", label: "Facture fournisseur non payée" },
  { nature: "DETTE_FISCALE_OU_SOCIALE", label: "Impôts ou cotisations sociales liés à l'activité" },
];

export type PosteIntakeRow = {
  readonly id: string;
  nature: NatureEconomique;
  /** Chaîne brute, jamais un nombre déjà converti — même convention que `*Raw` dans `patrimonial-intake.ts`. */
  montantRaw: string;
  libelle: string;
};

export type VentilationTiersIntakeState = {
  postesRecevoir: PosteIntakeRow[];
  /** "Je confirme n'avoir aucune somme à recevoir" — jamais déduit d'une liste simplement vide. */
  confirmationRecevoirVide: boolean;
  postesPayer: PosteIntakeRow[];
  /** "Je confirme n'avoir aucune somme à payer" — jamais déduit d'une liste simplement vide. */
  confirmationPayerVide: boolean;
};

export const EMPTY_VENTILATION_TIERS_INTAKE_STATE: VentilationTiersIntakeState = {
  postesRecevoir: [],
  confirmationRecevoirVide: false,
  postesPayer: [],
  confirmationPayerVide: false,
};

export function creerPoste(nature: NatureEconomique, id: string = crypto.randomUUID()): PosteIntakeRow {
  return { id, nature, montantRaw: "", libelle: "" };
}

/** Ajoute un poste — jamais à 0 € par défaut : `montantRaw` commence vide, l'utilisateur doit le renseigner explicitement. */
export function ajouterPoste(postes: readonly PosteIntakeRow[], nature: NatureEconomique, id?: string): PosteIntakeRow[] {
  return [...postes, creerPoste(nature, id)];
}

export function retirerPoste(postes: readonly PosteIntakeRow[], id: string): PosteIntakeRow[] {
  return postes.filter((poste) => poste.id !== id);
}

export function modifierPoste(
  postes: readonly PosteIntakeRow[],
  id: string,
  patch: Partial<Pick<PosteIntakeRow, "nature" | "montantRaw" | "libelle">>,
): PosteIntakeRow[] {
  return postes.map((poste) => (poste.id === id ? { ...poste, ...patch } : poste));
}

/**
 * Un montant est valide s'il est explicitement renseigné et numérique —
 * réutilise `parseMontantSaisi` (jamais une seconde implémentation qui
 * pourrait diverger sur `Number('') === 0`).
 */
export function posteMontantValide(poste: PosteIntakeRow): boolean {
  return parseMontantSaisi(poste.montantRaw) !== undefined;
}

export function listeEstValide(postes: readonly PosteIntakeRow[]): boolean {
  return postes.every(posteMontantValide);
}

function versPosteEconomiqueInput(poste: PosteIntakeRow): PosteEconomiqueInput {
  return {
    id: poste.id,
    nature: poste.nature,
    montant: parseMontantSaisi(poste.montantRaw)!,
    libelle: poste.libelle.trim() === "" ? undefined : poste.libelle,
  };
}

/**
 * B-FAMILY-3 — traduit l'état UI en `VentilationTiersInputs` (contrat
 * B-FAMILY-1). Fonction pure, testable sans React.
 *
 * Règles :
 * - une ligne au montant vide/invalide (`posteMontantValide` faux) ne
 *   devient JAMAIS un poste — silencieusement exclue, jamais un montant
 *   inventé (0 ou NaN) ;
 * - une nature avec au moins un poste RÉEL (valide) est toujours DECLARE en
 *   aval — jamais ajoutée à `naturesConfirmeesVides`, même si la
 *   confirmation de la liste est cochée (la confirmation ne masque jamais
 *   un poste réel) ;
 * - une nature sans poste réel, dans une liste dont la confirmation est
 *   cochée, est ajoutée à `naturesConfirmeesVides` (→ NUL_CONFIRME en aval) ;
 * - sans confirmation et sans poste, une nature n'apparaît nulle part ici —
 *   elle reste INCONNU en aval, comportement historique inchangé ;
 * - retourne `undefined` si rien n'a été renseigné (aucun poste valide,
 *   aucune confirmation) — jamais un objet vide `{}` qui laisserait croire
 *   à une saisie.
 */
export function buildVentilationTiersInputs(state: VentilationTiersIntakeState): VentilationTiersInputs | undefined {
  const postes: PosteEconomiqueInput[] = [
    ...state.postesRecevoir.filter(posteMontantValide).map(versPosteEconomiqueInput),
    ...state.postesPayer.filter(posteMontantValide).map(versPosteEconomiqueInput),
  ];
  const naturesAvecPoste = new Set(postes.map((p) => p.nature));

  const naturesConfirmeesVides: NatureEconomique[] = [];
  if (state.confirmationRecevoirVide) {
    for (const option of NATURES_A_RECEVOIR) {
      if (!naturesAvecPoste.has(option.nature)) naturesConfirmeesVides.push(option.nature);
    }
  }
  if (state.confirmationPayerVide) {
    for (const option of NATURES_A_PAYER) {
      if (!naturesAvecPoste.has(option.nature)) naturesConfirmeesVides.push(option.nature);
    }
  }

  if (postes.length === 0 && naturesConfirmeesVides.length === 0) return undefined;
  return {
    ...(postes.length > 0 ? { postes } : {}),
    ...(naturesConfirmeesVides.length > 0 ? { naturesConfirmeesVides } : {}),
  };
}

/**
 * Fonction inverse — reconstruit l'état UI depuis un `VentilationTiersInputs`
 * déjà persisté. Best-effort et volontairement partiel, même doctrine que
 * `deriveIntakeStateFromBilanPatrimonial` : si une liste a une nature avec
 * poste ET une nature sans poste ni confirmation, la confirmation de la
 * liste est reconstruite à `false` (ambiguïté assumée — round-trip garanti
 * uniquement au niveau de `buildVentilationTiersInputs`, jamais au niveau de
 * l'état UI lui-même).
 */
export function deriveVentilationTiersIntakeState(value: VentilationTiersInputs | undefined): VentilationTiersIntakeState {
  if (value === undefined) return EMPTY_VENTILATION_TIERS_INTAKE_STATE;

  const confirmees = new Set(value.naturesConfirmeesVides ?? []);
  const versRow = (poste: PosteEconomiqueInput): PosteIntakeRow => ({
    id: poste.id ?? crypto.randomUUID(),
    nature: poste.nature,
    montantRaw: String(poste.montant),
    libelle: poste.libelle ?? "",
  });

  const postesRecevoir = (value.postes ?? [])
    .filter((p) => NATURES_A_RECEVOIR.some((option) => option.nature === p.nature))
    .map(versRow);
  const postesPayer = (value.postes ?? [])
    .filter((p) => NATURES_A_PAYER.some((option) => option.nature === p.nature))
    .map(versRow);

  const natureCouverte = (nature: NatureEconomique, postes: readonly PosteIntakeRow[]) =>
    postes.some((p) => p.nature === nature) || confirmees.has(nature);

  const confirmationRecevoirVide = NATURES_A_RECEVOIR.every((option) => natureCouverte(option.nature, postesRecevoir));
  const confirmationPayerVide = NATURES_A_PAYER.every((option) => natureCouverte(option.nature, postesPayer));

  return { postesRecevoir, confirmationRecevoirVide, postesPayer, confirmationPayerVide };
}
