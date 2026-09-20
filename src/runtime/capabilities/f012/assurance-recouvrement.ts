import { round2 } from "./types";

/**
 * Recouvrement F-011 / F-012 — principe (décision PO) :
 * F-012 ne neutralise QUE le montant dont F-011 établit effectivement qu'il est déjà comptabilisé.
 * Un libellé identifie une correspondance POTENTIELLE ; il ne suffit jamais à supprimer
 * économiquement une charge sans contrepartie F-011 réelle.
 *
 * Enveloppes SÉPARÉES par nature (jamais croisées) :
 *  - assurance emprunteur → `allocateAssuranceRecouvrement` / `assuranceEmprunteurF011` ;
 *  - frais de dossier bancaire → `allocateFraisDossierRecouvrement` / `fraisDossierF011`.
 *
 * Attribution : les lignes candidates d'UNE enveloppe sont servies dans l'ordre de saisie
 * tant qu'il reste du montant F-011 de CETTE enveloppe.
 */
export type EnvelopeF011Reference = {
  /** Exercice de la sortie F-011 ; absent = non vérifiable (appelants historiques). */
  exerciceFiscal?: number;
  /** Montant de la nature établi par F-011 pour l'enveloppe. */
  montantAnnuel: number;
};

/** Alias historique. */
export type AssuranceF011Reference = EnvelopeF011Reference;

export type LigneRecouvrement = { id: string; montant: number };

export type AllocationRecouvrement = {
  id: string;
  montant: number;
  /** Part déjà comptabilisée par F-011 : neutralisée dans F-012 (aucune contribution supplémentaire). */
  recouvert: number;
  /** Part que F-011 n'établit pas : suit le traitement normal F-012. `recouvert + reliquat = montant`. */
  reliquat: number;
};

export type RecouvrementEnvelope = {
  parLigne: AllocationRecouvrement[];
  /** Montant F-011 disponible pour cette enveloppe (0 si période incompatible ou F-011 absent). */
  reference: number;
  periodeCompatible: boolean;
  totalRecouvert: number;
  totalReliquat: number;
};

/** Alias historique. */
export type RecouvrementAssurance = RecouvrementEnvelope;

export function allocateEnvelopeRecouvrement(input: {
  exerciceFiscal: number;
  lignes: readonly LigneRecouvrement[];
  f011?: EnvelopeF011Reference;
}): RecouvrementEnvelope {
  const { f011 } = input;
  const periodeCompatible = f011 === undefined || f011.exerciceFiscal === undefined || f011.exerciceFiscal === input.exerciceFiscal;
  const reference = f011 !== undefined && periodeCompatible && Number.isFinite(f011.montantAnnuel) ? Math.max(0, round2(f011.montantAnnuel)) : 0;

  let restant = reference;
  const parLigne = input.lignes.map((ligne) => {
    const montant = round2(ligne.montant);
    const recouvert = round2(Math.max(0, Math.min(montant, restant)));
    restant = round2(restant - recouvert);
    return { id: ligne.id, montant, recouvert, reliquat: round2(montant - recouvert) };
  });

  return {
    parLigne,
    reference,
    periodeCompatible,
    totalRecouvert: round2(parLigne.reduce((acc, l) => acc + l.recouvert, 0)),
    totalReliquat: round2(parLigne.reduce((acc, l) => acc + l.reliquat, 0)),
  };
}

export function allocateAssuranceRecouvrement(input: {
  exerciceFiscal: number;
  lignes: readonly LigneRecouvrement[];
  f011?: EnvelopeF011Reference;
}): RecouvrementEnvelope {
  return allocateEnvelopeRecouvrement(input);
}

export function allocateFraisDossierRecouvrement(input: {
  exerciceFiscal: number;
  lignes: readonly LigneRecouvrement[];
  f011?: EnvelopeF011Reference;
}): RecouvrementEnvelope {
  return allocateEnvelopeRecouvrement(input);
}
