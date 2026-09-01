import { assembleForm2031SD } from "../../f007/assemble-form-2031";
import type { Form2031SD } from "../../f007/types";
import type { FiscalRepresentation } from "../types";

/**
 * Adaptateur pur : appelle le mapper 2031-SD déjà existant et testé
 * (`assembleForm2031SD`) avec les champs de la RFS. Aucune nouvelle logique,
 * aucun recalcul — uniquement un point d'entrée RFS pour un mapper qui
 * prenait jusqu'ici `fiscalResult`/`identite` séparément.
 */
export function map2031FromRfs(rfs: FiscalRepresentation): Form2031SD {
  const { form } = assembleForm2031SD(rfs.fiscalResult, rfs.identite);
  return form;
}
