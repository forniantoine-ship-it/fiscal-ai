import type { InpiStatus } from "@/lib/lmnp/types/dossier";

/**
 * P1 — état affiché par `ValidationInpiBlock` sur la page Validation.
 * Dérivé de `Dossier.inpiStatus` (source de vérité, cf. types/dossier.ts)
 * ET du couple `paidAt`/`declarationGeneratedAt` (FiscalYear, découplage du
 * chantier précédent) — jamais l'inverse : ce module ne redéfinit ni ne
 * recalcule ni l'un ni l'autre, il se contente de les combiner pour choisir
 * un affichage. Fonction pure, sans effet de bord, testable isolément.
 */
export type InpiValidationState =
  | "REGISTERED"
  | "IN_PROGRESS"
  /** P1 — `regularization_required` : distingué de IN_PROGRESS générique, une action du client est attendue (cf. ValidationInpiBlock). */
  | "REGULARIZATION_REQUIRED"
  /** P1 — `submitted` : distingué de IN_PROGRESS générique, la démarche a déjà été envoyée (rien à déposer). */
  | "SUBMITTED"
  | "NOT_STARTED"
  | "UNKNOWN"
  | "PAID_WAITING_INPI";

export type ResolveInpiValidationStateInput = {
  /** `undefined` = aucun statut historique connu (dossier legacy, ou jamais renseigné) — distinct de "not_started" déclaré explicitement. */
  inpiStatus: InpiStatus | undefined;
  paidAt: string | undefined | null;
  declarationGeneratedAt: string | undefined | null;
};

/** `submitted`/`regularization_required` ont désormais leur propre état (ci-dessus) — ce groupe ne couvre plus que les statuts "en cours" génériques. */
const IN_PROGRESS_STATUSES: ReadonlySet<InpiStatus> = new Set(["in_progress", "modification_in_progress"]);

/**
 * Ordre de résolution volontaire :
 * 1. `registered` prime toujours — un dossier déjà enregistré ne doit
 *    jamais retomber sur l'état "payé, en attente d'INPI", même si un autre
 *    blocage fiscal (sans rapport avec l'INPI) empêchait par ailleurs la
 *    génération.
 * 2. `paid && !generated` ET l'INPI n'est PAS déjà enregistré → l'écran doit
 *    prioritairement dire "vous avez payé, il manque l'INPI" plutôt que
 *    répéter un état "à préparer"/"en cours" générique — y compris devant
 *    `submitted`/`regularization_required` (même priorité qu'avant ce
 *    correctif, non changée).
 * 3. Sinon, dérivation directe depuis `inpiStatus` — `regularization_required`
 *    et `submitted` d'abord (cas spécifiques), puis le groupe générique
 *    "en cours", puis "pas encore commencé".
 * 4. Absence de statut → UNKNOWN (jamais un NOT_STARTED inventé, cf.
 *    types/dossier.ts).
 */
export function resolveInpiValidationState(input: ResolveInpiValidationStateInput): InpiValidationState {
  const { inpiStatus, paidAt, declarationGeneratedAt } = input;

  if (inpiStatus === "registered") return "REGISTERED";

  const paid = Boolean(paidAt);
  const generated = Boolean(declarationGeneratedAt);
  if (paid && !generated) return "PAID_WAITING_INPI";

  if (inpiStatus === "regularization_required") return "REGULARIZATION_REQUIRED";
  if (inpiStatus === "submitted") return "SUBMITTED";
  if (inpiStatus && IN_PROGRESS_STATUSES.has(inpiStatus)) return "IN_PROGRESS";
  if (inpiStatus === "not_started" || inpiStatus === "preparing") return "NOT_STARTED";

  return "UNKNOWN";
}
