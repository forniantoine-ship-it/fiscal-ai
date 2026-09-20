import type { PretFinancementExercice } from "@/runtime";
import type { DeclarationDraft } from "../../types";
import { resolveCreditState } from "./credit-state";

/**
 * A5(1) + latence « prêt saisi puis aucun crédit » — source des emprunts transportés vers la RFS
 * (`rfs.emprunts`), lue par le bilan 2033-A (`resolveEmprunts` : `undefined` ⇒ `INCONNU`, case 156
 * non publiée ; `[]` ⇒ `DISPONIBLE` à 0 €) et par le mapper 2033-B (294).
 *
 * S'appuie sur l'état crédit unique (`resolveCreditState`) :
 *  1. `AUCUN_CREDIT_ETABLI` → `[]` — même si d'anciennes `financementCharges` subsistent : elles sont
 *     antérieures à la déclaration explicite et périmées ;
 *  2. `CREDIT_PRESENT` / `AMBIGU` avec `financementCharges` → ses `prets`, transportés tels quels
 *     (comportement historique : le doute ne détruit jamais une donnée de prêt) ;
 *  3. `INCONNU`, ou ambigu sans `financementCharges` → `undefined`.
 *
 * Une absence de réponse n'est JAMAIS une absence de crédit : seul l'état 1 produit `[]`.
 */
export function resolveEmpruntsForRfs(draft: DeclarationDraft | undefined): PretFinancementExercice[] | undefined {
  if (resolveCreditState(draft).etat === "AUCUN_CREDIT_ETABLI") return [];
  return draft?.financementCharges?.prets;
}
