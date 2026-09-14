import type { F011State } from "@/runtime";

/**
 * F011-2 (audit contradictoire) — rouvrir `complete` via « Modifier mes
 * réponses » (GO_BACK) ne touche jamais `financementCharges`/`creditFinancing`
 * (les prêts confirmés restent la donnée de travail, jamais effacés — voir
 * `f011-resume.ts`), mais sans ce garde-fou `creditConfirmedAt` restait
 * inchangé pendant toute l'édition : `isCreditComplete()`
 * (`validation-profile.ts`) et `isDocumentJourneyComplete()`
 * (`document-journey-progress.ts`) l'utilisent directement, sans jamais
 * relire `financementAssistantState.step` — un dossier rouvert pour
 * correction restait donc "F-011 confirmé" pour le dashboard et pour la
 * porte de génération de déclaration (`declaration-generation-gate.ts`),
 * qui aurait pu autoriser un paiement/une génération sur les anciennes
 * valeurs pendant que l'utilisateur corrigeait un prêt à l'écran.
 *
 * Miroir exact de la contrainte #10 déjà validée pour F-010
 * (`F010LogementAssistantPanel.tsx` : `wasComplete && turn.state.step !==
 * "complete"` → `logementConfirmedAt: undefined`) : rouvrir `complete` pour
 * modification invalide le signal de complétude partagé jusqu'à une nouvelle
 * confirmation explicite (`confirm_all` → `persistCompletion`, qui repose
 * `creditConfirmedAt`). Ne touche jamais aux prêts eux-mêmes.
 */
export function shouldInvalidateCreditConfirmation(params: {
  previousStep: F011State["step"];
  nextStep: F011State["step"];
}): boolean {
  return params.previousStep === "complete" && params.nextStep !== "complete";
}
