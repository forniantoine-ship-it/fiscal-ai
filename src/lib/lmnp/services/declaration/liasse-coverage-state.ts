import type { LiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";

/**
 * P0-2a (2026-09-03) — état honnête de couverture de la liasse, pour l'UI
 * uniquement. Ne prouve QUE ce que la RFS expose déjà :
 * - `formulairesGeneres`/`formulairesAttendus` (assemble-liasse-from-rfs.ts) —
 *   liste des IDs de formulaire assemblés SANS ERREUR, jamais une preuve que
 *   leurs cases sont réellement alimentées (cf. audit P0-2a).
 * - `cases`/`casesNonAlimentees` — seuls 2031-bis/2033-A/2033-B/2033-C/2033-D
 *   portent `casesNonAlimentees` ; 2031-SD (F-007/RFS) n'a pas cette notion et
 *   est compté comme entièrement alimenté.
 * N'affirme jamais une "liasse complète" au sens officiel — cette notion
 * (Cerfa, EDI) n'est pas un livrable de ce palier.
 */
export type LiasseCoverageState = {
  formulairesGeneresCount: number;
  formulairesAttendusCount: number;
  casesAlimentees: number;
  casesNonAlimentees: number;
};

export function resolveLiasseCoverageState(
  liasseRfs: LiasseFromRfs | undefined,
): LiasseCoverageState | undefined {
  if (!liasseRfs) return undefined;

  const formsAvecSuivi = [
    liasseRfs.form2031Bis,
    liasseRfs.form2033A,
    liasseRfs.form2033B,
    liasseRfs.form2033C,
    liasseRfs.form2033D,
  ];

  return {
    formulairesGeneresCount: liasseRfs.formulairesGeneres.length,
    formulairesAttendusCount: liasseRfs.formulairesAttendus.length,
    casesAlimentees:
      liasseRfs.form2031.cases.length + formsAvecSuivi.reduce((sum, form) => sum + form.cases.length, 0),
    casesNonAlimentees: formsAvecSuivi.reduce((sum, form) => sum + form.casesNonAlimentees.length, 0),
  };
}

export type LiasseCoverageMessage = {
  coverageLine: string;
  disclaimer: string;
};

/**
 * P0-2a — texte affiché au client, source unique pour l'écran de confirmation
 * (ValidationDocumentStep) et l'espace déclaration (DeclarationReadyView) :
 * jamais "liasse complète"/"documents officiels", jamais la liste détaillée
 * des `casesNonAlimentees` — un décompte factuel, plus un rappel de nature du
 * document.
 */
export function formatLiasseCoverageMessage(coverage: LiasseCoverageState | undefined): LiasseCoverageMessage {
  const disclaimer =
    "Ce document constitue vos éléments fiscaux détaillés. Il ne s'agit pas d'un formulaire Cerfa officiel ni d'un accusé de télétransmission EDI.";

  if (!coverage) {
    return { coverageLine: "Votre résultat fiscal est accessible dans votre espace déclaration.", disclaimer };
  }

  const { formulairesGeneresCount, formulairesAttendusCount, casesAlimentees, casesNonAlimentees } = coverage;
  const enAttente = casesNonAlimentees > 0 ? ` (${casesNonAlimentees} en attente de complément)` : "";

  return {
    coverageLine:
      `${formulairesGeneresCount} formulaire(s) généré(s) sur ${formulairesAttendusCount} attendu(s), ` +
      `${casesAlimentees} case(s) alimentée(s)${enAttente}.`,
    disclaimer,
  };
}
