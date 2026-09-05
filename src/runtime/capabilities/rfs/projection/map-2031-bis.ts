import type { FiscalRepresentation } from "../types";
import type { CaseTrace, CerfaCase } from "../../f007/types";
import { round2 } from "../../f007/types";

/**
 * Projection Cerfa 2031 Bis-SD (Annexe au 2031-SD — Cadre I, BIC non
 * professionnels) — consomme UNIQUEMENT `rfs.fiscalResult`. Aucun appel à
 * produceFiscalResult()/applyAmortissementStocks(), aucune lecture directe
 * d'assistant F-010/F-011/F-012/F-013/F-014, aucun accès FEC.
 *
 * Cycle 41-44 — hors périmètre ADR-004 au sens strict (ADR-004 ne liste que
 * 2031-SD/2033-A/B/C/D) : ajouté après audit explicite (Cycle 41), le
 * formulaire officiel confirme (Cycle 42, notice DGFiP millésime 2026) que le
 * Cadre I vise exactement le profil LMNP réel simplifié ciblé par le produit.
 *
 * La ligne « Autres locations meublées non professionnelles » ne porte aucun
 * code Cerfa numéroté sur le formulaire officiel (vérifié positionnellement
 * sur le PDF officiel, Cycle 44) — seules les cases 7a/7b (déjà couvertes par
 * `I_7A`/`I_7B` de `map-2031-recapitulation.ts`) portent un identifiant
 * numéroté. L'identifiant `I_AUTRES_LMNP_*` suit la même convention que
 * `I_7A`/`I_7B` (préfixe du cadre officiel), sans inventer de code.
 *
 * CORRECTION JALON 1B (audit indépendant, suite JALON 1A) — l'ancien
 * comportement (Cycles 42-44) n'alimentait cette ligne QUE lorsque
 * `fiscalResult.deficitsImputes === 0`, au motif qu'aucune source officielle
 * ne confirmerait la formule reliant "avant imputation" et "après
 * imputation". C'était une fausse ambiguïté : `I_7A`/`I_7B` (même page,
 * `map-2031-recapitulation.ts`) sont DÉJÀ, depuis le socle fiscal validé
 * (JALON 1A, commit aa765cb), un pass-through direct de
 * `resultatFiscal`/`deficitNouveau` — deux champs qui sont TOUJOURS le
 * résultat/déficit APRÈS imputation (TRF-0031, `applyAmortissementStocks` —
 * INCHANGÉ ici). Il n'existe donc, dans le modèle F-006 actuel, aucune
 * grandeur "avant imputation" distincte à laquelle cette ligne pourrait se
 * référer : la question posée par l'ancienne garde ne se pose simplement
 * pas. La ligne « Autres locations meublées non professionnelles » du Cadre
 * I documente, pour ce même dossier LMNP réel simplifié, exactement le même
 * résultat/déficit que le Cadre 7 (I_7A/I_7B) — jamais une seconde grandeur
 * ni une formule additionnelle (`resultatFiscal + deficitsImputes` n'a
 * JAMAIS été et n'est TOUJOURS PAS calculée ici). `deficitsImputes` n'est
 * plus lu par ce mapper : il n'intervient dans aucune condition ni aucune
 * valeur.
 */

export type CerfaCaseNonAlimenteeCategorie =
  | "donnee_absente"
  | "incoherence_modele"
  | "hors_perimetre"
  | "non_applicable";

export type CerfaCaseNonAlimentee = {
  caseId: string;
  label: string;
  raison: string;
  categorie: CerfaCaseNonAlimenteeCategorie;
};

export type Form2031Bis = {
  formId: "2031-Bis-SD";
  millésime: number;
  cases: CerfaCase[];
  /** Jamais une valeur inventée : chaque case listée ici reste explicitement sans valeur, avec sa raison tracée. */
  casesNonAlimentees: CerfaCaseNonAlimentee[];
};

const LABEL_BENEFICE = "BIC non professionnels — Autres locations meublées non professionnelles (Bénéfice)";
const LABEL_DEFICIT = "BIC non professionnels — Autres locations meublées non professionnelles (Déficit)";

export function map2031BisFromRfs(rfs: FiscalRepresentation): Form2031Bis {
  const fr = rfs.fiscalResult;
  const baseTrace: Omit<CaseTrace, "path"> = { source: "FiscalResult", ksArtifacts: ["TRF-0032"] };

  const cases: CerfaCase[] = [];
  // CORRECTION JALON 1B : plus aucune condition sur `deficitsImputes` — voir
  // le commentaire d'en-tête du fichier. `resultatFiscal`/`deficitNouveau`
  // sont déjà, par construction F-006 (TRF-0031, inchangé), le résultat/
  // déficit APRÈS imputation : exactement ce que cette ligne doit reporter,
  // à l'identique de I_7A/I_7B (`map-2031-recapitulation.ts`), jamais une
  // formule distincte.
  if (fr.resultatFiscal > 0) {
    cases.push({
      caseId: "I_AUTRES_LMNP_BENEFICE",
      label: LABEL_BENEFICE,
      value: round2(fr.resultatFiscal),
      trace: { ...baseTrace, path: "fiscalResult.resultatFiscal (= I_7A du 2031-SD)", ksArtifacts: ["TRF-0032"] },
    });
  }
  if (fr.deficitNouveau > 0) {
    cases.push({
      caseId: "I_AUTRES_LMNP_DEFICIT",
      label: LABEL_DEFICIT,
      value: round2(fr.deficitNouveau),
      trace: { ...baseTrace, path: "fiscalResult.deficitNouveau (= I_7B du 2031-SD)", ksArtifacts: ["TRF-0031", "TRF-0032"] },
    });
  }

  return {
    formId: "2031-Bis-SD",
    millésime: rfs.exercice,
    cases,
    casesNonAlimentees: [],
  };
}
