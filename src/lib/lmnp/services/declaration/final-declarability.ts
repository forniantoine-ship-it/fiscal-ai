import type { LiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import type { CerfaCaseNonAlimentee, Form2033A } from "@/runtime/capabilities/rfs/projection/map-2033a";

/**
 * NEXT-5 — la déclarabilité CLIENT est une couche distincte de :
 * - F-006 (`validateFiscalInputs`) : ignore entièrement la projection Cerfa,
 *   ne connaît que la présence/validité des sorties assistants ;
 * - la génération technique du PDF (`runStructuralAndMappingGate`,
 *   `liasse-pdf/gate/generation-gate.ts`) : purement structurelle/visuelle
 *   (registre, position, chevauchement), aucune connaissance de la valeur
 *   fiscale d'une case.
 *
 * Un dossier peut passer les deux gates ci-dessus alors qu'une case Cerfa
 * REQUISE reste vide parce qu'un mapper RFS→Cerfa a délibérément refusé de
 * la publier (`categorie: "incoherence_modele"`, jamais une valeur inventée
 * — voir `map-2033a.ts`/`map-2033c.ts`).
 *
 * `casesNonAlimentees` (par formulaire) mélange PLUSIEURS situations très
 * différentes sous ce même mécanisme :
 * - des cases légitimement vides pour CE dossier (`non_applicable`,
 *   `hors_perimetre`, ou `donnee_absente` quand la donnée n'a simplement pas
 *   encore été saisie) — ne doivent JAMAIS bloquer la livraison ;
 * - des limites de périmètre PERMANENTES qui touchent la majorité des
 *   dossiers aujourd'hui (ex. 2033-A cases 044/096/110/112/142/176/180 —
 *   bilan patrimonial, catégories jamais modélisées ou saisie patrimoniale
 *   non complétée ; 2033-B cases 352/354 — ordre de calcul F-006 ≠ formulaire
 *   officiel) — bloquer dessus rendrait la majorité des dossiers actuels
 *   non livrables, un résultat clairement faux ;
 * - un sous-ensemble ÉTROIT et PROUVÉ par le code lui-même : une divergence
 *   entre deux valeurs fiscales déjà calculées (F-010 vs F-014 pour
 *   l'amortissement, F-011 vs le registre patrimonial pour les emprunts),
 *   qui démontre qu'une valeur RÉELLE existe en amont mais ne peut être
 *   publiée sans se tromper. C'est CE dernier sous-ensemble, et lui seul,
 *   que ce module traite comme non-déclarable.
 *
 * Liste volontairement étroite et explicite (pas un filtre générique sur
 * `categorie === "incoherence_modele"`, qui capturerait aussi les gaps
 * permanents ci-dessus) : chaque entrée correspond à une garde de
 * divergence identifiée par lecture directe de `map-2033a.ts`/`map-2033c.ts`
 * (Cycle 37 pour 028/030/490/492/496/570/576, correction P0-3 pour 156).
 *
 * NEXT-5B — cas 142/180 (Total I Capitaux propres / Total général passif) :
 * exclus de cette même liste par caseId+categorie, parce que
 * `categorie: "incoherence_modele"` y recouvre DEUX situations que ce champ
 * seul ne distingue pas — une case 142 non alimentée peut venir d'une simple
 * donnée patrimoniale pas encore saisie (`DONNEE_MANQUANTE`/
 * `STOCK_OUVERTURE_ABSENT`, jamais bloquant, même philosophie que le reste
 * du bilan patrimonial optionnel) OU d'une divergence/déséquilibre RÉELLEMENT
 * prouvé entre données déjà saisies (`DIVERGENCE_SOURCE`/`DESEQUILIBRE_REEL`,
 * la même classe de preuve que 028/030/156/490-576). La seule source de
 * vérité pour cette distinction est `checkBilanEquilibre()`
 * (`bilan/check-bilan-equilibre.ts`) — jamais reproduite ici (voir
 * `resolveEquilibreIssue` plus bas, qui consomme `Form2033A.equilibreStatus`,
 * un champ additif exposant tel quel le statut déjà calculé par le mapper,
 * jamais une seconde implémentation de la notion d'équilibre).
 *
 * `map-2033a.ts` est gelé depuis le Cycle 53 "sans nouveau besoin produit" —
 * la fermeture de ce gap en est un (audit indépendant NEXT-5) : la seule
 * modification apportée au mapper est l'exposition additive, non
 * comportementale, de `equilibreStatus` (aucune case existante n'est
 * recalculée ni republiée différemment).
 */
const INTERNAL_PROJECTION_LOSS_CASES: Readonly<Record<string, readonly string[]>> = {
  "2033-A-SD": ["028", "030", "156"],
  "2033-C-SD": ["490", "492", "496", "570", "576"],
};

export type InternalProjectionIssue = {
  formId: string;
  caseId: string;
  label: string;
  raison: string;
};

export type FinalDeclarabilityState = {
  deliverable: boolean;
  internalProjectionIssues: InternalProjectionIssue[];
};

function issuesForForm(
  formId: string,
  casesNonAlimentees: readonly CerfaCaseNonAlimentee[],
): InternalProjectionIssue[] {
  const watched = INTERNAL_PROJECTION_LOSS_CASES[formId];
  if (!watched) return [];
  return casesNonAlimentees
    .filter((c) => watched.includes(c.caseId) && c.categorie === "incoherence_modele")
    .map((c) => ({ formId, caseId: c.caseId, label: c.label, raison: c.raison }));
}

const EQUILIBRE_STATUS_BLOQUANT: ReadonlySet<string> = new Set(["DIVERGENCE_SOURCE", "DESEQUILIBRE_REEL"]);

/**
 * NEXT-5B — une seule issue représentative (caseId "142"), jamais une par
 * caseId affecté : 180 n'est qu'une conséquence en aval du même état
 * d'équilibre (`map-2033a.ts`, gate 180 dépend de la publication réelle de
 * 142) — on documente la déclarabilité du dossier, pas un comptage de
 * cases. `EQUILIBRE`/`DONNEE_MANQUANTE`/`STOCK_OUVERTURE_ABSENT` ne
 * produisent jamais d'issue ici.
 */
function resolveEquilibreIssue(form2033A: Pick<Form2033A, "formId" | "equilibreStatus" | "casesNonAlimentees">): InternalProjectionIssue | undefined {
  const status = form2033A.equilibreStatus;
  if (!status || !EQUILIBRE_STATUS_BLOQUANT.has(status)) return undefined;
  const case142 = form2033A.casesNonAlimentees.find((c) => c.caseId === "142");
  return {
    formId: form2033A.formId,
    caseId: "142",
    label: case142?.label ?? "Total I — Capitaux propres",
    raison: case142?.raison ?? `Bilan non équilibré (statut : ${status}).`,
  };
}

/**
 * `liasseRfs` absent (dossier généré avant l'introduction de ce champ, ou
 * archive antérieure) n'est jamais traité comme une preuve de
 * non-déclarabilité : fail-open, aucune migration/invalidation rétroactive
 * d'un document déjà livré (NEXT-5, périmètre — pas de migration d'archive).
 */
export function resolveFinalDeclarabilityState(
  liasseRfs: LiasseFromRfs | undefined,
): FinalDeclarabilityState {
  if (!liasseRfs) return { deliverable: true, internalProjectionIssues: [] };

  const equilibreIssue = resolveEquilibreIssue(liasseRfs.form2033A);
  const internalProjectionIssues = [
    ...issuesForForm(liasseRfs.form2033A.formId, liasseRfs.form2033A.casesNonAlimentees),
    ...(equilibreIssue ? [equilibreIssue] : []),
    ...issuesForForm(liasseRfs.form2033C.formId, liasseRfs.form2033C.casesNonAlimentees),
  ];

  return { deliverable: internalProjectionIssues.length === 0, internalProjectionIssues };
}

/**
 * Message client — jamais le jargon technique (`categorie`, `caseId`,
 * "mapper"), jamais une invitation à ressaisir une donnée : cette
 * indisponibilité vient d'une divergence interne entre deux calculs déjà
 * effectués, pas d'une donnée que le client peut corriger lui-même.
 */
export const FINAL_DECLARABILITY_BLOCKED_MESSAGE =
  "Votre dossier nécessite une vérification supplémentaire par notre équipe avant de pouvoir être téléchargé. Nous revenons vers vous rapidement.";
