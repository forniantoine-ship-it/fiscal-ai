/**
 * Compagnon INPI — contrat de progression minimal (Phase 4.1).
 *
 * `InpiCompanionPersistedState` représente UNIQUEMENT la progression du
 * client dans l'accompagnement CFA (où il en est dans le Compagnon), jamais
 * une donnée métier. Toute valeur métier reste lue à sa source existante :
 *   - `DeclarationDraft` pour les valeurs elles-mêmes (siret, activityStartDate,
 *     personalAddress, establishmentAddress, ...) ;
 *   - `Dossier.inpiStatus` pour la situation INPI déclarée par le client.
 *
 * Distinct de `Dossier.inpiStatus` : `inpiStatus` est la situation INPI
 * déclarée par le client (source de vérité administrative, persistante,
 * indépendante de l'exercice fiscal — voir ADR-010). `inpiCompanionState`
 * est la progression du client DANS le Compagnon (état d'interface),
 * naturellement propre à l'exercice courant — jamais reporté d'un exercice
 * à l'autre (`createNextDeclarationDraft` ne le recopie jamais, exactement
 * comme `activiteAssistantState`). Ce n'est pas un oubli : un `Dossier` déjà
 * `registered` redevient `verification` au prochain exercice via
 * `resolveInpiValidationState()`, sans dépendre d'un `inpiCompanionState`
 * hérité.
 *
 * La confirmation d'un champ par le client DANS le Compagnon ne peut pas se
 * déduire de la simple présence d'une valeur dans `DeclarationDraft` — un
 * SIRET ou une date de début peuvent y figurer sans avoir jamais été
 * explicitement confirmés par l'utilisateur, que ce soit via F009 (le
 * chemin "review" n'exige pas `confirmed.siret` avant de continuer) ou via
 * le Tunnel A legacy (`ActiviteDocumentStep.tsx`, qui écrit `siret` dès
 * l'extraction GPT, avant toute confirmation). `confirmedFields` mémorise
 * donc la confirmation propre au Compagnon lui-même, jamais une lecture
 * indirecte d'un état de confirmation externe.
 */

export type InpiCompanionMode =
  | "diagnostic"
  | "creation"
  | "verification"
  | "poursuite"
  | "attente"
  | "regularisation";

export type InpiCompanionStep =
  | "identite"
  | "activite"
  | "date_debut"
  | "etablissement"
  | "siren_siret"
  | "regime"
  | "domiciliation"
  | "documents"
  | "synthese";

/** Un champ confirmable correspond à une étape, hors synthèse (récapitulatif, pas une décision à confirmer). */
export type InpiCompanionFieldKey = Exclude<InpiCompanionStep, "synthese">;

/**
 * Progression du parcours Compagnon — distincte de `Dossier.inpiStatus`.
 * Vocabulaire volontairement différent des valeurs de `InpiStatus`
 * ("not_started" / "in_progress" / ...) pour ne jamais laisser croire que ce
 * champ reflète la situation INPI réelle plutôt que l'avancement local dans
 * l'accompagnement.
 */
export type InpiCompanionProgressStatus = "idle" | "active" | "prepared";

/**
 * Conflit entre une valeur déjà confirmée dans le Compagnon et une nouvelle
 * valeur (typiquement issue d'une extraction documentaire RNE/Kbis). Ne
 * stocke que les deux valeurs nécessaires à l'arbitrage affiché au client —
 * jamais une copie complète des données du champ. Résolu par un choix
 * explicite du client, jamais par une fusion silencieuse (principe repris de
 * `F009FieldConflict`, non réutilisé directement — voir Phase 4.0, Blocker 2).
 */
export type InpiCompanionConflict = {
  field: InpiCompanionFieldKey;
  previousValue: string;
  newValue: string;
};

export type InpiCompanionPersistedState = {
  mode: InpiCompanionMode;
  step: InpiCompanionStep;
  progressStatus: InpiCompanionProgressStatus;
  /** Étapes déjà traversées, dans l'ordre — permet le retour arrière. Jamais de données métier. */
  history: InpiCompanionStep[];
  /** Horodatage ISO de confirmation par champ, DANS le Compagnon — jamais la valeur métier elle-même. */
  confirmedFields: Partial<Record<InpiCompanionFieldKey, string>>;
  /** Conflits non résolus. Un champ résolu est retiré de cette map, jamais gardé marqué "résolu". */
  conflicts: Partial<Record<InpiCompanionFieldKey, InpiCompanionConflict>>;
  /**
   * Horodatage ISO du dernier clic sur "Ouvrir le Guichet unique INPI".
   * Signifie uniquement que le client a ouvert le site officiel depuis le
   * Compagnon — jamais que la formalité a été commencée, soumise ou acceptée.
   */
  lastOfficialSiteOpenedAt?: string;
  updatedAt: string;
};

/**
 * Reprise : un parcours n'est repris que s'il a été explicitement démarré
 * ("active") — un état "idle" ou "prepared" n'a rien à reprendre (pas encore
 * commencé, ou déjà terminé). Miroir volontaire de `shouldResumeF009()`
 * (`f009-activite/types.ts`), sans en importer les types.
 */
export function shouldResumeInpiCompanion(
  persisted: InpiCompanionPersistedState | undefined,
): boolean {
  return Boolean(persisted && persisted.progressStatus === "active");
}
