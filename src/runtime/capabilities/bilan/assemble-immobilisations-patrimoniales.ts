import type { ImmobilisationsRfs } from "../rfs/types";
import { round2 } from "../f010/types";
import type { ActifImmobilise, RegistrePatrimonialImmobilisations } from "./types";

/**
 * Unifie en UN SEUL registre ce qui existe aujourd'hui séparément :
 * `rfs.immobilisations.lignes` (F-010, brut/cumulé/VNC par actif, déjà
 * fiable) et `rfs.immobilisations.composantsNouveaux` (F-012, travaux
 * réintégrés en immobilisation, brut connu mais SANS détail d'amortissement
 * cumulé individuel exposé à la RFS aujourd'hui — voir raison ci-dessous).
 *
 * Jamais un recalcul de F-010/F-012/F-014 : chaque valeur lue ici est déjà
 * produite ailleurs, cette fonction ne fait que les regrouper et exposer
 * explicitement ce qui est fiable de ce qui ne l'est pas.
 *
 * ATTENTION (piège déjà vérifié dans le code existant, `map-2033c.ts`) :
 * `immo.montantMobilier` n'est JAMAIS additionné séparément ici — le
 * mobilier est déjà comptabilisé à l'intérieur de `immo.lignes`/`totalBrut`
 * (F-010, `compute-amortization-plan.ts` fusionne `composantsBati` et
 * `composantsMobilier` dans le même tableau `composants`) ; `montantMobilier`
 * n'est qu'un pointeur isolé vers ce sous-ensemble, destiné à la case 476 du
 * 2033-C — l'additionner ici doublerait sa valeur. Seul `valeurTerrain` est
 * une valeur réellement EXCLUE de `totalBrut` (le terrain n'entre jamais
 * dans `composePlanAmortissement()`, confirmé par lecture de code) et doit
 * donc être rajouté.
 *
 * Amélioration par rapport à la garde `amortissementDivergent` existante
 * (`map-2033a.ts`/`map-2033c.ts`, dupliquée entre les deux) : cette garde
 * bloquait BRUT et NET ensemble dès qu'un composant nouveau F-012 existait,
 * alors que le BRUT d'un composant nouveau est en réalité toujours connu
 * (`ComposantNouveau.montant`, une valeur déjà là) — seul son amortissement
 * CUMULÉ individuel ne l'est pas (F-014 ne transporte que la dotation
 * annuelle agrégée jusqu'à la RFS aujourd'hui). Ce module sépare donc
 * explicitement la fiabilité du brut de celle du net, sans jamais inventer
 * la part manquante.
 */
export function assembleRegistreImmobilisationsPatrimoniales(input: {
  immobilisations?: ImmobilisationsRfs;
  amortCalcule: number;
}): RegistrePatrimonialImmobilisations {
  const { immobilisations: immo, amortCalcule } = input;

  if (immo === undefined) {
    return {
      actifs: [],
      brutTotal: undefined,
      cumuleTotal: undefined,
      netTotal: undefined,
      brutFiable: false,
      netFiable: false,
      raisons: ["rfs.immobilisations est absent — aucun plan d'amortissement disponible pour ce dossier (F-010 non encore exécuté ou non persisté)."],
    };
  }

  const raisons: string[] = [];
  const actifs: ActifImmobilise[] = immo.lignes.map((ligne) => ({
    id: ligne.label,
    categorie: "composant" as const,
    label: ligne.label,
    coutBrut: ligne.montant,
    dureeAnnees: ligne.dureeAnnees,
    amortissementCumule: ligne.amortissementsCumules,
    vnc: ligne.vnc,
    source: "F-010 (AmortissementPlan.lignes)",
  }));

  const terrainFiable = typeof immo.valeurTerrain === "number";
  if (terrainFiable) {
    actifs.push({
      id: "terrain",
      categorie: "terrain",
      label: "Terrain",
      coutBrut: immo.valeurTerrain as number,
      amortissementCumule: 0,
      vnc: immo.valeurTerrain as number,
      source: "F-010 (valeurTerrain — jamais amorti)",
    });
  } else {
    raisons.push("valeurTerrain absent de rfs.immobilisations (dossier ou fixture antérieur à son exposition) — le brut ne peut pas être reconstitué sans sous-évaluer silencieusement le terrain.");
  }

  const composantsNouveaux = immo.composantsNouveaux ?? [];
  for (const c of composantsNouveaux) {
    actifs.push({
      id: c.label,
      categorie: "travaux",
      label: c.label,
      coutBrut: c.montant,
      dureeAnnees: c.dureeAnnees,
      dateEntree: c.dateDebut,
      amortissementCumule: undefined,
      vnc: undefined,
      source: "F-012 (ComposantNouveau, réintégré via F-014)",
    });
  }
  if (composantsNouveaux.length > 0) {
    raisons.push(
      "Au moins un composant nouveau F-012 (travaux réintégrés en immobilisation) existe : son amortissement cumulé individuel n'est pas exposé à la RFS aujourd'hui (F-014 ne transporte que la dotation annuelle agrégée, jamais le détail par composant vers ce niveau) — le net (030/576) reste non fiable pour ce dossier tant que cette donnée n'est pas ajoutée à la RFS. Le brut reste fiable : c'est la somme de montants déjà connus (ComposantNouveau.montant), aucune invention.",
    );
  }

  // Garde résiduelle : si F-006/F-014 (amortCalcule) et F-010
  // (totalAnnuelExercice) divergent au-delà de ce que les composants
  // nouveaux connus expliquent, une source de divergence NON IDENTIFIÉE
  // subsiste — comportement conservateur inchangé (bloque brut ET net),
  // exactement comme la garde `amortissementDivergent` déjà en place.
  const divergenceInexpliquee = composantsNouveaux.length === 0 && Math.abs(round2(amortCalcule - immo.totalAnnuelExercice)) > 0.01;
  if (divergenceInexpliquee) {
    raisons.push(
      `fiscalResult.amortCalcule (${amortCalcule}) diverge de rfs.immobilisations.totalAnnuelExercice (${immo.totalAnnuelExercice}) sans qu'aucun composant nouveau F-012 connu ne l'explique — source de divergence non identifiée, brut ET net restent non fiables par prudence (même garde que map-2033a.ts/map-2033c.ts).`,
    );
  }

  const brutFiable = terrainFiable && !divergenceInexpliquee;
  const netFiable = brutFiable && composantsNouveaux.length === 0;

  const brutTotal = brutFiable
    ? round2(immo.totalBrut + (immo.valeurTerrain as number) + composantsNouveaux.reduce((acc, c) => acc + c.montant, 0))
    : undefined;
  const cumuleTotal = netFiable ? round2(immo.lignes.reduce((acc, l) => acc + l.amortissementsCumules, 0)) : undefined;
  const netTotal = netFiable && brutTotal !== undefined && cumuleTotal !== undefined ? round2(brutTotal - cumuleTotal) : undefined;

  return { actifs, brutTotal, cumuleTotal, netTotal, brutFiable, netFiable, raisons };
}
