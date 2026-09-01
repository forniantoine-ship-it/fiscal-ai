"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { Input, Select } from "@/design-system/components/Input";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { LogementExtractionFallbackCard } from "@/components/lmnp/logement/LogementExtractionFallbackCard";
import { ingestExtractionIntoStore, lockGovernedField } from "@/lib/documents/cross-tunnel-prefill";
import { readGovernedFieldStore } from "@/lib/lmnp/services/governed-field-prefill";
import {
  buildF010ConfirmedFieldLocks,
  buildF010CreditGovernancePayload,
  buildF010SyntheticDocument,
  computeLockAwarePrefillValues,
  resolveF010ResumeDecision,
  runF010UploadFlow,
  type F010ActePrefill,
  type F010ExtractionOutcome,
  type RunF010UploadFlowResult,
} from "@/lib/lmnp/services/f010/f010-document-prefill";
import { shouldFlushF010PersistedStep } from "@/lib/lmnp/services/f010/f010-critical-persist";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import {
  F010LogementAssistant,
  suggestFrais,
  suggestRatioTerrain,
  toF010PersistedState,
  type F010Action,
  type F010ExtractionReview,
  type F010ExtractionReviewField,
  type F010Message,
  type F010Nature,
  type F010ReviewFieldKey,
  type F010Result,
  type F010State,
  type FieldSource,
  type Localisation,
  type TypeBien,
} from "@/runtime";

/** Cycle 4E6A-B — ids stables des champs de formulaire (tests + htmlFor). */
export const F010_FORM_FIELD_IDS = {
  fileActe: "f010-file-acte",
  bienPrix: "f010-bien-prix",
  bienType: "f010-bien-type",
  bienDate: "f010-bien-date",
  bienSurface: "f010-bien-surface",
  fraisMontant: "f010-frais-montant",
  fraisTraitementGroup: "f010-frais-traitement",
  mobilierMontant: "f010-mobilier-montant",
  ventilationLocalisation: "f010-ventilation-localisation",
  ventilationRatio: "f010-ventilation-ratio",
} as const;

export const F010_SUBMIT_HINT_IDS = {
  collectBien: "f010-collect-bien-submit-hint",
  collectFrais: "f010-collect-frais-submit-hint",
  collectMobilier: "f010-collect-mobilier-submit-hint",
  ventilation: "f010-ventilation-submit-hint",
} as const;

export const F010_RESTART_DIALOG_IDS = {
  trigger: "f010-restart-trigger",
  dialog: "f010-restart-dialog",
  cancel: "f010-restart-cancel",
  confirm: "f010-restart-confirm",
} as const;

/** Classe locale — focus clavier visible sans modifier `Button.tsx` global. */
export const F010_FOCUS_BUTTON_CLASS =
  "outline-none focus-visible:ring-[3px] focus-visible:ring-[#F0C4A033]";

export const F010_STEP_TITLES: Record<F010State["step"], string> = {
  orientation: "Type d'acquisition",
  coming_soon: "Acquisition bientôt disponible",
  acquisition_source: "Source de l'acte",
  collect_bien: "Informations sur le bien",
  review_extraction: "Vérification des informations extraites",
  collect_frais: "Frais de notaire",
  collect_mobilier: "Mobilier inclus",
  ventilation: "Ventilation terrain et bâti",
  review_plan: "Validation du plan d'amortissement",
  complete: "Logement configuré",
};

const labelStyle = { ...typography.caption.desktop, color: colors.text.muted } as const;

function F010FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} style={labelStyle}>
      {children}
    </label>
  );
}

/** Cycle 4E6A-B — ids ARIA d'une carte review (tests structurels). */
export function buildF010ReviewFieldA11yIds(field: F010ReviewFieldKey) {
  const fieldId = `f010-review-${field}`;
  return {
    fieldId,
    labelId: `${fieldId}-label`,
    valueId: `${fieldId}-value`,
    statusId: `${fieldId}-status`,
    provenanceId: `${fieldId}-provenance`,
  };
}

export function collectF010LabeledFieldSpecs(): readonly { id: string; labelFor: string }[] {
  return [
    { id: F010_FORM_FIELD_IDS.fileActe, labelFor: F010_FORM_FIELD_IDS.fileActe },
    { id: F010_FORM_FIELD_IDS.bienPrix, labelFor: F010_FORM_FIELD_IDS.bienPrix },
    { id: F010_FORM_FIELD_IDS.bienType, labelFor: F010_FORM_FIELD_IDS.bienType },
    { id: F010_FORM_FIELD_IDS.bienDate, labelFor: F010_FORM_FIELD_IDS.bienDate },
    { id: F010_FORM_FIELD_IDS.bienSurface, labelFor: F010_FORM_FIELD_IDS.bienSurface },
    { id: F010_FORM_FIELD_IDS.fraisMontant, labelFor: F010_FORM_FIELD_IDS.fraisMontant },
    { id: F010_FORM_FIELD_IDS.mobilierMontant, labelFor: F010_FORM_FIELD_IDS.mobilierMontant },
    { id: F010_FORM_FIELD_IDS.ventilationLocalisation, labelFor: F010_FORM_FIELD_IDS.ventilationLocalisation },
    { id: F010_FORM_FIELD_IDS.ventilationRatio, labelFor: F010_FORM_FIELD_IDS.ventilationRatio },
  ];
}

/** Cycle 4E6A-C1 — id de la région d'annonce unique (tests structurels). */
export const F010_ANNOUNCER_ID = "f010-live-announcer";

/**
 * Dernier message assistant d'un delta — jamais les échos user (« Je confirme : … »).
 */
export function pickLastF010AssistantMessageFromDelta(delta: readonly F010Message[]): string | null {
  for (let index = delta.length - 1; index >= 0; index--) {
    const message = delta[index];
    if (message?.role === "assistant") return message.content;
  }
  return null;
}

/** Montage initial : ne pas focuser le titre si une session reprise porte déjà un message assistant. */
export function shouldSkipF010InitialStepFocus(
  decisionKind: string,
  initialMessages: readonly F010Message[],
): boolean {
  if (decisionKind === "start") return false;
  return pickLastF010AssistantMessageFromDelta(initialMessages) !== null;
}

/** Transition d'étape avec nouveau message assistant : annoncer, ne pas focuser le titre. */
export function shouldSkipF010StepFocusForAnnouncement(
  previousStep: F010State["step"],
  nextStep: F010State["step"],
  delta: readonly F010Message[],
): boolean {
  return previousStep !== nextStep && pickLastF010AssistantMessageFromDelta(delta) !== null;
}

/**
 * Déduplication locale — retourne le texte à annoncer ou `null` si déjà annoncé.
 */
export function resolveF010AnnouncementDedup(
  text: string | null,
  lastAnnounced: string | null,
): { text: string | null; nextLastAnnounced: string | null } {
  if (!text || text === lastAnnounced) {
    return { text: null, nextLastAnnounced: lastAnnounced };
  }
  return { text, nextLastAnnounced: text };
}

/**
 * Déduplication locale — retourne le texte à annoncer ou `null` si déjà annoncé.
 */
export function resolveF010AnnouncementText(
  delta: readonly F010Message[],
  lastAnnounced: string | null,
): { text: string | null; nextLastAnnounced: string | null } {
  return resolveF010AnnouncementDedup(pickLastF010AssistantMessageFromDelta(delta), lastAnnounced);
}

/** Analyse en cours : upload actif (`busy`) ou reprise d'analyse interrompue. */
export function shouldShowF010AnalysisStatus(
  analyzingDocumentId: string | undefined,
  busy: boolean,
  resumeAnalysisActive: boolean,
): boolean {
  return Boolean(analyzingDocumentId) && (busy || resumeAnalysisActive);
}

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

const LOCALISATIONS: Record<TypeBien, { id: Localisation; label: string }[]> = {
  appartement: [
    { id: "paris", label: "Paris" },
    { id: "grande_metropole", label: "Grande métropole" },
    { id: "ville_moyenne", label: "Ville moyenne" },
    { id: "zone_rurale", label: "Zone rurale" },
  ],
  maison: [
    { id: "zone_urbaine_dense", label: "Centre urbain dense" },
    { id: "zone_urbaine_standard", label: "Zone urbaine" },
    { id: "zone_periurbaine", label: "Zone périurbaine" },
    { id: "zone_rurale", label: "Zone rurale" },
  ],
  autre: [
    { id: "ville_moyenne", label: "Ville moyenne" },
    { id: "zone_rurale", label: "Zone rurale" },
  ],
};

function MessageBubble({ message }: { message: F010Message }) {
  const isAssistant = message.role === "assistant";
  return (
    <div className={isAssistant ? "mr-8" : "ml-8 text-right"} style={{ marginBottom: spacing.scale[3] }}>
      <div
        style={{
          display: "inline-block",
          textAlign: "left",
          maxWidth: "100%",
          padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
          borderRadius: radius.lg,
          backgroundColor: isAssistant ? colors.surface.inset : colors.orange[50],
          color: colors.text.primary,
          ...typography.body.desktop,
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

function PlanSummary({ result }: { result: F010Result }) {
  return (
    <div className="flex flex-col gap-3">
      <div
        style={{
          padding: spacing.scale[4],
          borderRadius: radius.lg,
          backgroundColor: colors.surface.inset,
        }}
      >
        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          Déduction annuelle estimée
        </p>
        <p style={{ ...typography.sectionTitle.desktop, color: colors.text.primary }}>
          {fmtEur(result.dotationAnnuelle)} / an
        </p>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          sur environ {result.dureeMoyenneAnnees} ans en moyenne
        </p>
      </div>

      <div className="flex flex-col gap-1" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        <div className="flex justify-between">
          <span>Valeur du terrain (non déductible)</span>
          <span>{fmtEur(result.valeurTerrain)}</span>
        </div>
        <div className="flex justify-between">
          <span>Valeur du logement (déductible)</span>
          <span>{fmtEur(result.valeurBati)}</span>
        </div>
        {result.montantMobilierIsole > 0 ? (
          <div className="flex justify-between">
            <span>Mobilier (déductible)</span>
            <span>{fmtEur(result.montantMobilierIsole)}</span>
          </div>
        ) : null}
      </div>

      {result.prorataRatio < 1 ? (
        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          La première année est ajustée selon votre date de mise en location
          (environ {Math.round(result.prorataRatio * 100)} % d&apos;une année complète).
        </p>
      ) : null}
    </div>
  );
}

export type F010ReviewPlanSummaryItem = { label: string; value: string };

/**
 * Cycle 4D — récapitulatif des entrées ayant servi au calcul, affiché juste
 * avant PlanSummary sur review_plan. Pure mise en forme de valeurs déjà
 * présentes dans F010State : aucune nouvelle donnée, aucun nouveau calcul —
 * `state.result` (produit par computePlan côté runtime) reste l'unique source
 * du résultat affiché juste après. `natureBien` n'apparaît que si elle a
 * réellement servi à l'estimation des frais affichés (fraisNotaire "estimated") ;
 * `adresse` et les champs sans impact sur le calcul n'apparaissent jamais ici.
 */
export function buildF010ReviewPlanSummaryItems(state: F010State): F010ReviewPlanSummaryItem[] {
  const items: F010ReviewPlanSummaryItem[] = [];

  if (state.prixAcquisition !== undefined) {
    items.push({ label: "Prix d'achat", value: fmtEur(state.prixAcquisition) });
  }
  if (state.dateAcquisition !== undefined) {
    items.push({ label: "Date d'acquisition", value: state.dateAcquisition });
  }
  if (state.typeBien !== undefined) {
    items.push({ label: "Type de bien", value: F010_TYPE_BIEN_LABELS[state.typeBien] });
  }
  if (state.fraisNotaire !== undefined) {
    const traitement =
      state.choixTraitementFrais === "deduction" ? "déduits immédiatement" : "intégrés à la valeur du bien";
    items.push({ label: "Frais de notaire", value: `${fmtEur(state.fraisNotaire)} (${traitement})` });
  }
  if (state.natureBien !== undefined && state.fieldSources.fraisNotaire === "estimated") {
    items.push({ label: "Bien", value: state.natureBien === "ancien" ? "Ancien" : "Neuf" });
  }
  items.push({
    label: "Mobilier inclus",
    value: state.montantMobilier ? fmtEur(state.montantMobilier) : "Aucun",
  });
  if (state.ratioTerrain !== undefined) {
    items.push({ label: "Part du terrain", value: `${Math.round(state.ratioTerrain * 100)} %` });
  }

  return items;
}

function ReviewPlanInputsSummary({ state }: { state: F010State }) {
  const items = buildF010ReviewPlanSummaryItems(state);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        padding: spacing.scale[4],
        borderRadius: radius.lg,
        backgroundColor: colors.surface.inset,
      }}
    >
      <p style={{ ...typography.caption.desktop, color: colors.text.muted, marginBottom: spacing.scale[2] }}>
        Ce qui a servi au calcul
      </p>
      <div className="flex flex-col gap-1" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        {items.map((item) => (
          <div key={item.label} className="flex justify-between">
            <span>{item.label}</span>
            <span style={{ color: colors.text.primary }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Cycle 4E4 — confirmation avant "Recommencer depuis le début" (action
 * irréversible : efface tout le parcours en cours). Suit le même patron que
 * les autres boîtes de dialogue de l'app (`RejectFieldDialog`,
 * `CorrectionModal` : overlay + Card + `role="dialog"`), sans nouveau
 * composant partagé — le design system n'a pas de Dialog générique. Ajoute
 * ce que ces exemples n'ont pas mais que ce cycle exige explicitement :
 * fermeture au clavier (Échap) et focus initial dans la boîte.
 */
function F010RestartConfirmDialog({
  open,
  onCancel,
  onConfirm,
  returnFocusId,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusId: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const focusCancel = () => {
      document.getElementById(F010_RESTART_DIALOG_IDS.cancel)?.focus();
    };
    focusCancel();

    const getFocusables = (): HTMLElement[] => {
      const root = dialogRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = getFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.getElementById(returnFocusId)?.focus();
    };
  }, [open, onCancel, returnFocusId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{ backgroundColor: `${colors.overlay.scrim}66` }}
    >
      <div
        ref={dialogRef}
        id={F010_RESTART_DIALOG_IDS.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="f010-restart-title"
        aria-describedby="f010-restart-description"
        className="w-full max-w-md"
      >
        <Card className="!p-6" style={{ boxShadow: shadows.modal.elevated, borderRadius: radius.xl }}>
          <h2 id="f010-restart-title" style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>
            Recommencer depuis le début ?
          </h2>
          <p
            id="f010-restart-description"
            className="mt-2"
            style={{ ...typography.body.desktop, color: colors.text.secondary }}
          >
            Votre saisie actuelle sera effacée et vous devrez reprendre le parcours depuis le début.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              id={F010_RESTART_DIALOG_IDS.cancel}
              variant="secondary"
              onClick={onCancel}
              className={`flex-1 ${F010_FOCUS_BUTTON_CLASS}`}
            >
              Annuler
            </Button>
            <Button
              id={F010_RESTART_DIALOG_IDS.confirm}
              variant="ghost"
              onClick={onConfirm}
              className={`flex-1 ${F010_FOCUS_BUTTON_CLASS}`}
              style={{ color: colors.error.DEFAULT }}
            >
              Oui, recommencer
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** True once `declarationDraft` already carries the logement confirmation signal (Tunnel A or a prior F010 completion). */
function isLegacyLogementComplete(draft: ReturnType<typeof useLmnp>["workspace"]["declarationDraft"]): boolean {
  return Boolean(draft?.logementConfirmedAt);
}

/** Ordre d'affichage de l'écran de review (Cycle 4C2) — imposé par la demande produit. */
const F010_REVIEW_FIELD_ORDER: readonly F010ReviewFieldKey[] = [
  "prixAcquisition",
  "dateAcquisition",
  "typeBien",
  "surface",
  "adresse",
  "fraisNotaire",
];

const F010_REVIEW_FIELD_LABELS: Record<F010ReviewFieldKey, string> = {
  prixAcquisition: "Prix d'achat",
  dateAcquisition: "Date d'acquisition",
  typeBien: "Type de bien",
  surface: "Surface",
  adresse: "Adresse",
  fraisNotaire: "Frais de notaire",
};

const F010_TYPE_BIEN_LABELS: Record<TypeBien, string> = {
  appartement: "Appartement",
  maison: "Maison",
  autre: "Autre",
};

const F010_REVIEW_STATUS_LABELS: Record<"pending" | "confirmed" | "corrected", string> = {
  pending: "À vérifier",
  confirmed: "Confirmé",
  corrected: "Corrigé",
};

export function f010ReviewStatusAccessibleLabel(
  entry: F010ExtractionReviewField,
): string | null {
  if (entry.status === "pending") return F010_REVIEW_STATUS_LABELS.pending;
  if (entry.status === "confirmed" || entry.status === "corrected") {
    return F010_REVIEW_STATUS_LABELS[entry.status];
  }
  return null;
}

/**
 * Helpers purs de l'écran de review (Cycle 4C2) — exportés pour être testés
 * directement (convention du projet : pas de RTL, la logique de décision est
 * extraite en fonctions pures plutôt que testée via le rendu React).
 */
export function formatF010ReviewValue(field: F010ReviewFieldKey, raw: string): string {
  switch (field) {
    case "prixAcquisition":
    case "fraisNotaire": {
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? fmtEur(numeric) : raw;
    }
    case "surface": {
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? `${numeric} m²` : raw;
    }
    case "typeBien":
      return F010_TYPE_BIEN_LABELS[raw as TypeBien] ?? raw;
    default:
      return raw;
  }
}

export function f010ReviewFieldCurrentValue(state: F010State, field: F010ReviewFieldKey): string | undefined {
  const value = state[field];
  return value === undefined ? undefined : String(value);
}

/** IMPORTANT : aucun score de confiance — seule la provenance réelle (extracted/estimated) porte un badge, "manual"/"user_correction" n'en affichent aucun. */
export function f010ReviewProvenanceLabel(source: FieldSource | undefined): string | null {
  if (source === "extracted") return "Extrait de votre acte";
  if (source === "estimated") return "Estimé";
  return null;
}

/** Champs "unavailable" jamais affichés (pas de fausse carte vide) — resolveNextMissingF010Field s'en charge plus tard. */
export function computeF010ReviewVisibleEntries(
  review: F010ExtractionReview | undefined,
): (readonly [F010ReviewFieldKey, F010ExtractionReviewField])[] {
  if (!review) return [];
  return F010_REVIEW_FIELD_ORDER.map((field) => [field, review.fields[field]] as const).filter(
    ([, entry]) => entry.status !== "unavailable",
  );
}

export function computeF010ReviewHasMissingFields(review: F010ExtractionReview | undefined): boolean {
  if (!review) return false;
  return F010_REVIEW_FIELD_ORDER.some((field) => review.fields[field].status === "unavailable");
}

/**
 * Un champ "pending" est en conflit quand une valeur était déjà confirmée
 * (session précédente ou saisie manuelle) et que la nouvelle proposition du
 * document diffère — jamais un écrasement silencieux (règle Cycle 3, réutilisée
 * telle quelle, jamais réinterprétée).
 */
export function isF010ReviewFieldConflict(
  state: F010State,
  field: F010ReviewFieldKey,
  entry: F010ExtractionReviewField,
): boolean {
  if (entry.status !== "pending") return false;
  if (state.confirmed?.[field] !== true) return false;
  const currentValue = f010ReviewFieldCurrentValue(state, field);
  return currentValue !== undefined && currentValue !== entry.proposedValue;
}

/** Champs en conflit sur l'écran de review (Cycle 4E6A-C2). */
export function collectF010ReviewConflictFields(
  state: F010State,
  visibleEntries: (readonly [F010ReviewFieldKey, F010ExtractionReviewField])[] = computeF010ReviewVisibleEntries(
    state.review,
  ),
): F010ReviewFieldKey[] {
  return visibleEntries
    .filter(([field, entry]) => isF010ReviewFieldConflict(state, field, entry))
    .map(([field]) => field);
}

/** Nouveaux conflits depuis la dernière annonce (transition false → true). */
export function detectF010NewConflictFields(
  alreadyAnnounced: ReadonlySet<F010ReviewFieldKey>,
  currentConflictFields: readonly F010ReviewFieldKey[],
): F010ReviewFieldKey[] {
  return currentConflictFields.filter((field) => !alreadyAnnounced.has(field));
}

/** Annonce d'un ou plusieurs conflits nouvellement détectés. */
export function buildF010ConflictAnnouncement(newConflictFields: readonly F010ReviewFieldKey[]): string | null {
  if (newConflictFields.length === 0) return null;
  if (newConflictFields.length === 1) {
    const label = F010_REVIEW_FIELD_LABELS[newConflictFields[0]];
    return `${label} : cette information diffère de votre réponse précédente. Choisissez quelle valeur conserver.`;
  }
  return "Plusieurs informations diffèrent de vos réponses précédentes. Vérifiez les valeurs proposées.";
}

/**
 * Résout l'annonce de conflit après une mise à jour d'état — ne réannonce jamais
 * un conflit déjà signalé ni au refresh (jeu initial = conflits déjà présents).
 */
export function resolveF010ConflictAnnouncement(
  alreadyAnnounced: ReadonlySet<F010ReviewFieldKey>,
  state: F010State,
): {
  text: string | null;
  nextAnnouncedConflicts: Set<F010ReviewFieldKey>;
  newConflictFields: F010ReviewFieldKey[];
} {
  const currentConflictFields = collectF010ReviewConflictFields(state);
  const nextAnnouncedConflicts = new Set(alreadyAnnounced);
  for (const field of alreadyAnnounced) {
    if (!currentConflictFields.includes(field)) {
      nextAnnouncedConflicts.delete(field);
    }
  }
  const newConflictFields = detectF010NewConflictFields(nextAnnouncedConflicts, currentConflictFields);
  const text = buildF010ConflictAnnouncement(newConflictFields);
  if (text) {
    for (const field of newConflictFields) {
      nextAnnouncedConflicts.add(field);
    }
  }
  return { text, nextAnnouncedConflicts, newConflictFields };
}

/** Annonce unique après « Tout confirmer » — jamais les échos user. */
export function buildF010BulkConfirmAnnouncement(params: {
  confirmedCount: number;
  hasRemainingConflicts: boolean;
  transitionAssistantMessage: string | null;
}): string | null {
  if (params.confirmedCount <= 0) return null;

  const countPhrase =
    params.confirmedCount === 1
      ? "1 information confirmée."
      : `${params.confirmedCount} informations confirmées.`;

  if (params.hasRemainingConflicts) {
    return `${countPhrase} Certaines informations nécessitent encore votre vérification.`;
  }

  if (params.transitionAssistantMessage) {
    return `${countPhrase} ${params.transitionAssistantMessage}`;
  }

  return countPhrase;
}

/**
 * Cycle 4E3 — champs éligibles à "Tout confirmer" : uniquement les
 * propositions encore "pending" et hors conflit. Ne recalcule jamais quoi que
 * ce soit sur `corrected`/`confirmed`/`unavailable` — jamais de remplacement
 * d'une correction ou d'une confirmation déjà faite, jamais de fausse valeur
 * pour un champ absent. Source unique, réutilisée à la fois pour l'état
 * disabled du bouton et pour la boucle de confirmation elle-même — aucune
 * seconde liste de champs.
 */
export function computeF010ReviewConfirmableFields(
  state: F010State,
  visibleEntries: (readonly [F010ReviewFieldKey, F010ExtractionReviewField])[],
): F010ReviewFieldKey[] {
  return visibleEntries
    .filter(([field, entry]) => entry.status === "pending" && !isF010ReviewFieldConflict(state, field, entry))
    .map(([field]) => field);
}

/**
 * Le runtime (leaveReviewIfComplete, Cycle 4C1) fait déjà avancer l'étape
 * automatiquement dès que le dernier champ visible est traité — cette
 * fonction reste exportée pour les tests (plus de bouton « Continuer »
 * sur review_extraction depuis le Cycle 4E6A-A).
 */
export function computeF010ReviewComplete(
  visibleEntries: (readonly [F010ReviewFieldKey, F010ExtractionReviewField])[],
): boolean {
  return visibleEntries.length > 0 && visibleEntries.every(([, entry]) => entry.status !== "pending");
}

/**
 * Cycle 4E1 — atterrissages nécessitant une resynchronisation des
 * formulaires locaux depuis F010State : les 4 écrans dont les champs sont
 * pilotés par des hooks React locaux (`collect_bien`, `collect_frais`,
 * `collect_mobilier`, `ventilation`). `review_extraction`/`review_plan`/etc.
 * lisent directement `state`, aucune resynchronisation n'y est nécessaire.
 */
const F010_LOCAL_FORM_SYNC_STEPS: ReadonlySet<F010State["step"]> = new Set([
  "collect_bien",
  "collect_frais",
  "collect_mobilier",
  "ventilation",
]);

/**
 * Point de décision unique — remplace la resynchronisation qui n'était
 * déclenchée que sur GO_BACK (Cycle 3). Couvre désormais aussi bien GO_BACK
 * que les sauts automatiques du runtime (`leaveReviewIfComplete`, Cycle
 * 4C1/4C2) : sans ça, un champ déjà confirmé peut s'afficher vide après un
 * saut automatique vers l'un de ces 4 écrans, désactivant silencieusement le
 * bouton "Continuer" (bug Cycle 4E, revue §15).
 */
export function shouldSyncF010LocalForms(previousStep: F010State["step"], nextStep: F010State["step"]): boolean {
  return previousStep !== nextStep && F010_LOCAL_FORM_SYNC_STEPS.has(nextStep);
}

export type F010LocalFormSyncValues = {
  prix?: string;
  typeBien?: TypeBien;
  natureBien?: "ancien" | "neuf";
  dateAcq?: string;
  surface?: string;
  prixSource: FieldSource;
  typeBienSource: FieldSource;
  dateAcqSource: FieldSource;
  surfaceSource: FieldSource;
  frais?: string;
  choixFrais?: "integration" | "deduction";
  fraisSource: FieldSource;
  mobilier?: string;
  ratio?: string;
  localisation?: Localisation;
  ratioSource: FieldSource;
};

/**
 * Mise en forme pure des valeurs à réappliquer aux formulaires locaux —
 * extraite pour être testable directement (convention du projet, pas de
 * RTL). Mêmes règles exactes que l'ancien `syncLocalFormsFromState` inline :
 * un champ absent de F010State n'écrase jamais la valeur locale existante,
 * les provenances (`xSource`) sont, elles, toujours réappliquées.
 */
export function computeF010LocalFormSync(next: F010State): F010LocalFormSyncValues {
  return {
    prix: next.prixAcquisition !== undefined ? String(next.prixAcquisition) : undefined,
    typeBien: next.typeBien,
    natureBien: next.natureBien,
    dateAcq: next.dateAcquisition,
    surface: next.surface !== undefined ? String(next.surface) : undefined,
    prixSource: (next.fieldSources.prixAcquisition as FieldSource) ?? "manual",
    typeBienSource: (next.fieldSources.typeBien as FieldSource) ?? "manual",
    dateAcqSource: (next.fieldSources.dateAcquisition as FieldSource) ?? "manual",
    surfaceSource: (next.fieldSources.surface as FieldSource) ?? "manual",
    frais: next.fraisNotaire !== undefined ? String(next.fraisNotaire) : undefined,
    choixFrais: next.choixTraitementFrais,
    fraisSource: (next.fieldSources.fraisNotaire as FieldSource) ?? "manual",
    mobilier: next.montantMobilier !== undefined ? String(next.montantMobilier) : undefined,
    ratio: next.ratioTerrain !== undefined ? String(Math.round(next.ratioTerrain * 100)) : undefined,
    localisation: next.localisation,
    ratioSource: (next.fieldSources.ratioTerrain as FieldSource) ?? "manual",
  };
}

export function F010LogementAssistantPanel() {
  const { workspace, dispatch, getFile, flushWorkspace } = useLmnp();
  const fiscalYear = workspace.fiscalYear.year;
  const draft = workspace.declarationDraft;

  const assistant = useMemo(
    () =>
      new F010LogementAssistant(
        { dossierId: workspace.fiscalYear.id, fiscalYear, route: "/assistants/logement" },
        { dateMiseEnService: draft?.dateMiseEnService },
      ),
    [fiscalYear, workspace.fiscalYear.id, draft?.dateMiseEnService],
  );

  // Cycle 2 — reprise. Ordre imposé (contrainte #5) : shouldResumeF010 AVANT le
  // repli "déjà complet" — encodé dans resolveF010ResumeDecision, pas ici, pour
  // que l'ordre ne dépende pas d'une relecture attentive de ce composant.
  // Calculé une seule fois au montage : ne doit pas se redéclencher parce que
  // l'identité de `workspace`/`draft` change à chaque tick d'autosave.
  // `isReady` (LmnpProvider) garantit que `draft` est hydraté avant ce premier render.
  const initialResume = useMemo(() => {
    const persisted = draft?.logementAssistantState;
    const decision = resolveF010ResumeDecision({
      persisted,
      isLegacyComplete: isLegacyLogementComplete(draft),
    });
    if (decision.kind === "legacy_complete") {
      const state: F010State = { step: "complete", fieldSources: {} };
      return {
        decision,
        turn: {
          state,
          messages: [
            { role: "assistant" as const, content: "Votre logement est déjà configuré pour cet exercice." },
          ],
          completed: false,
        },
      };
    }
    if (decision.kind === "start") {
      return { decision, turn: assistant.start() };
    }
    return { decision, turn: assistant.resume(persisted!) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialLockAwareValues = useMemo(() => {
    if (initialResume.decision.kind !== "resume_pending_extraction") return {};
    return computeLockAwarePrefillValues(initialResume.decision.pendingExtraction, readGovernedFieldStore(draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<F010State>(() => initialResume.turn.state);
  const [messages, setMessages] = useState<F010Message[]>(() => initialResume.turn.messages);
  const [busy, setBusy] = useState(false);
  const [analyzingDocumentId, setAnalyzingDocumentId] = useState<string | undefined>(() =>
    initialResume.decision.kind === "resume_analysis" ? initialResume.decision.analyzingDocumentId : undefined,
  );
  const [pendingExtraction, setPendingExtraction] = useState<F010ActePrefill | undefined>(() =>
    initialResume.decision.kind === "resume_pending_extraction" ? initialResume.decision.pendingExtraction : undefined,
  );
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const analyzingRef = useRef(false);
  const [resumeAnalysisActive, setResumeAnalysisActive] = useState(
    () => initialResume.decision.kind === "resume_analysis",
  );

  const initialAssistantAnnouncement = pickLastF010AssistantMessageFromDelta(initialResume.turn.messages);
  const [announcement, setAnnouncement] = useState(() => initialAssistantAnnouncement ?? "");
  const lastAnnouncedRef = useRef<string | null>(initialAssistantAnnouncement);
  const announcedConflictsRef = useRef(
    new Set(collectF010ReviewConflictFields(initialResume.turn.state)),
  );
  const skipStepFocusRef = useRef(false);

  const announceText = useCallback(
    (
      text: string,
      options?: {
        previousStep?: F010State["step"];
        nextStep?: F010State["step"];
        delta?: F010Message[];
        skipStepFocus?: boolean;
      },
    ) => {
      const { text: toAnnounce, nextLastAnnounced } = resolveF010AnnouncementDedup(text, lastAnnouncedRef.current);
      if (!toAnnounce) return;
      lastAnnouncedRef.current = nextLastAnnounced;
      setAnnouncement(toAnnounce);
      if (
        options?.previousStep !== undefined &&
        options?.nextStep !== undefined &&
        (options.skipStepFocus === true ||
          (options.delta !== undefined &&
            shouldSkipF010StepFocusForAnnouncement(options.previousStep, options.nextStep, options.delta)))
      ) {
        skipStepFocusRef.current = true;
      }
    },
    [],
  );

  const announceFromDelta = useCallback(
    (
      delta: F010Message[],
      options?: { previousStep?: F010State["step"]; nextStep?: F010State["step"] },
    ) => {
      const { text, nextLastAnnounced } = resolveF010AnnouncementText(delta, lastAnnouncedRef.current);
      if (!text) return;
      lastAnnouncedRef.current = nextLastAnnounced;
      setAnnouncement(text);
      if (
        options?.previousStep !== undefined &&
        options?.nextStep !== undefined &&
        shouldSkipF010StepFocusForAnnouncement(options.previousStep, options.nextStep, delta)
      ) {
        skipStepFocusRef.current = true;
      }
    },
    [],
  );

  const announceConflictsForState = useCallback(
    (nextState: F010State, options?: { previousStep?: F010State["step"]; nextStep?: F010State["step"] }) => {
      const conflictResolution = resolveF010ConflictAnnouncement(announcedConflictsRef.current, nextState);
      if (!conflictResolution.text) return false;
      announcedConflictsRef.current = conflictResolution.nextAnnouncedConflicts;
      announceText(conflictResolution.text, {
        previousStep: options?.previousStep,
        nextStep: options?.nextStep,
        skipStepFocus:
          options?.previousStep !== undefined &&
          options?.nextStep !== undefined &&
          options.previousStep !== options.nextStep,
      });
      return true;
    },
    [announceText],
  );

  // collect_bien — les champs déjà confirmés (reprise après GO_BACK ou refresh)
  // priment sur une éventuelle extraction en attente, jamais l'inverse.
  const initialBienState = initialResume.turn.state;
  const [prix, setPrix] = useState(() =>
    initialBienState.prixAcquisition !== undefined ? String(initialBienState.prixAcquisition) : initialLockAwareValues.prix ?? "",
  );
  const [prixSource, setPrixSource] = useState<FieldSource>("manual");
  const [typeBien, setTypeBien] = useState<TypeBien>(
    () => initialBienState.typeBien ?? initialLockAwareValues.typeBien ?? "appartement",
  );
  const [typeBienSource, setTypeBienSource] = useState<FieldSource>("manual");
  // Cycle 4B : plus de valeur par défaut arbitraire — `undefined` signifie
  // réellement "pas encore répondu", nécessaire pour savoir s'il faut la
  // demander au moment d'une estimation des frais.
  const [natureBien, setNatureBien] = useState<"ancien" | "neuf" | undefined>(
    () => initialBienState.natureBien,
  );
  const [showNatureBienPrompt, setShowNatureBienPrompt] = useState(false);
  const [dateAcq, setDateAcq] = useState(
    () => initialBienState.dateAcquisition ?? initialLockAwareValues.dateAcq ?? "",
  );
  const [dateAcqSource, setDateAcqSource] = useState<FieldSource>("manual");
  const [surface, setSurface] = useState(() =>
    initialBienState.surface !== undefined ? String(initialBienState.surface) : initialLockAwareValues.surface ?? "",
  );
  const [surfaceSource, setSurfaceSource] = useState<FieldSource>("manual");
  const [extractionOutcome, setExtractionOutcome] = useState<F010ExtractionOutcome | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // collect_frais
  const [frais, setFrais] = useState(() =>
    initialBienState.fraisNotaire !== undefined ? String(initialBienState.fraisNotaire) : initialLockAwareValues.frais ?? "",
  );
  const [fraisSource, setFraisSource] = useState<FieldSource>("manual");
  const [choixFrais, setChoixFrais] = useState<"integration" | "deduction">(
    () => initialBienState.choixTraitementFrais ?? "integration",
  );

  // collect_mobilier
  const [mobilier, setMobilier] = useState(() =>
    initialBienState.montantMobilier !== undefined ? String(initialBienState.montantMobilier) : "",
  );

  // ventilation
  const [ratio, setRatio] = useState(() =>
    initialBienState.ratioTerrain !== undefined ? String(Math.round(initialBienState.ratioTerrain * 100)) : "",
  );
  const [ratioSource, setRatioSource] = useState<FieldSource>("manual");
  const [localisation, setLocalisation] = useState<Localisation | "">(() => initialBienState.localisation ?? "");

  // review_extraction (Cycle 4C2) — un seul champ éditable à la fois. Nettoyé
  // dans runAction (pas un effet) dès qu'on quitte review_extraction, sinon un
  // second document (nouvelle review) pourrait hériter d'un champ "en édition"
  // provenant de la review précédente.
  const [editingReviewField, setEditingReviewField] = useState<F010ReviewFieldKey | null>(null);
  const [reviewFieldDraft, setReviewFieldDraft] = useState("");

  // review_plan (Cycle 4E4) — "Recommencer depuis le début" ouvre une
  // confirmation avant d'agir. Les handlers sont définis après `runAction`
  // (voir plus bas) puisqu'ils en dépendent.
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  /**
   * Persiste l'état conversationnel F010 (Cycle 2/3) — jamais
   * governedFields/propertyBackgroundExtraction/documents/result.
   */
  const persistSession = useCallback(
    (
      nextState: F010State,
      nextAnalyzingDocumentId: string | undefined,
      nextPendingExtraction: F010ActePrefill | undefined,
    ) => {
      const logementAssistantState = toF010PersistedState(
        nextState,
        new Date().toISOString(),
        nextPendingExtraction,
        nextAnalyzingDocumentId,
      );
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: { logementAssistantState },
      });
      if (shouldFlushF010PersistedStep(nextState.step)) {
        void flushWorkspace({
          declarationDraft: {
            ...(draft ?? { completedSteps: [] }),
            logementAssistantState,
          },
        });
      }
    },
    [dispatch, draft, flushWorkspace],
  );

  /**
   * Réaffiche dans les formulaires locaux les champs déjà confirmés.
   * Cycle 4E1 : déclenché à chaque atterrissage sur un écran à formulaire
   * local (`shouldSyncF010LocalForms`), plus seulement sur GO_BACK — sinon un
   * saut automatique du runtime pouvait laisser un champ local vide alors que
   * F010State le connaît déjà.
   */
  const syncLocalFormsFromState = useCallback((next: F010State) => {
    const values = computeF010LocalFormSync(next);
    if (values.prix !== undefined) setPrix(values.prix);
    if (values.typeBien !== undefined) setTypeBien(values.typeBien);
    if (values.natureBien !== undefined) setNatureBien(values.natureBien);
    if (values.dateAcq !== undefined) setDateAcq(values.dateAcq);
    if (values.surface !== undefined) setSurface(values.surface);
    setPrixSource(values.prixSource);
    setTypeBienSource(values.typeBienSource);
    setDateAcqSource(values.dateAcqSource);
    setSurfaceSource(values.surfaceSource);

    if (values.frais !== undefined) setFrais(values.frais);
    if (values.choixFrais !== undefined) setChoixFrais(values.choixFrais);
    setFraisSource(values.fraisSource);

    if (values.mobilier !== undefined) setMobilier(values.mobilier);

    if (values.ratio !== undefined) setRatio(values.ratio);
    if (values.localisation !== undefined) setLocalisation(values.localisation);
    setRatioSource(values.ratioSource);
  }, []);

  const runAction = useCallback(
    async (action: F010Action) => {
      setBusy(true);
      try {
        const wasComplete = state.step === "complete";
        const previousStep = state.step;
        const turn = await assistant.handle(state, action);
        const announcedConflict = announceConflictsForState(turn.state, {
          previousStep,
          nextStep: turn.state.step,
        });
        if (!announcedConflict) {
          announceFromDelta(turn.messages, { previousStep, nextStep: turn.state.step });
        }
        setState(turn.state);
        setMessages((prev) => [...prev, ...turn.messages]);

        if (shouldSyncF010LocalForms(state.step, turn.state.step)) {
          syncLocalFormsFromState(turn.state);
        }
        if (state.step === "review_extraction" && turn.state.step !== "review_extraction") {
          setEditingReviewField(null);
          setReviewFieldDraft("");
        }

        // submit_bien intègre le prefill en cours dans F010State — l'extraction
        // en attente cesse d'être "en attente" (contrainte Cycle 2 #2).
        // analysis_success (Cycle 4C2) fait de même : son résultat vit désormais
        // dans state.review, plus besoin de le garder "en attente" en parallèle.
        const consumesPending = action.type === "submit_bien" || action.type === "analysis_success";
        const nextAnalyzingDocumentId = consumesPending ? undefined : analyzingDocumentId;
        const nextPendingExtraction = consumesPending ? undefined : pendingExtraction;
        if (consumesPending) {
          setAnalyzingDocumentId(undefined);
          setPendingExtraction(undefined);
        }
        persistSession(turn.state, nextAnalyzingDocumentId, nextPendingExtraction);

        // Rouvrir COMPLETE pour modification invalide le signal de complétude
        // partagé (Cycle 0) jusqu'à une nouvelle confirmation explicite — le
        // dossier redevient incomplet pendant la correction (contrainte #10).
        if (wasComplete && turn.state.step !== "complete") {
          dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { logementConfirmedAt: undefined } });
        }

        if (turn.completed && turn.state.result) {
          persistCompletion(turn.state);
        }
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assistant, state, analyzingDocumentId, pendingExtraction, persistSession, syncLocalFormsFromState, dispatch, announceFromDelta, announceConflictsForState],
  );

  /**
   * Confirmation avant "Recommencer depuis le début" (Cycle 4E4) — Annuler ne
   * change rien ; confirmer dispatche exactement l'action `restart`
   * existante via `runAction`, jamais une seconde logique de reset. Fermer la
   * boîte de façon synchrone avant le dispatch, combiné au garde `busy` déjà
   * utilisé par tous les boutons de ce panel, évite un double restart en cas
   * de double clic.
   */
  const handleRestartClick = useCallback(() => setShowRestartConfirm(true), []);
  const handleRestartCancel = useCallback(() => setShowRestartConfirm(false), []);
  const handleRestartConfirm = useCallback(() => {
    setShowRestartConfirm(false);
    void runAction({ type: "restart" });
  }, [runAction]);

  /**
   * "Tout confirmer" (Cycle 4E3) — réutilise `confirm_extracted_field` pour
   * chaque champ confirmable (mêmes règles de provenance/gouvernance qu'une
   * confirmation individuelle, aucune mécanique métier parallèle), enchaînés
   * séquentiellement via `assistant.handle`. Utilise une variable locale
   * (jamais le `state` React entre deux appels) : `runAction` capture `state`
   * par closure et un `setState` ne re-render pas assez tôt pour que des
   * appels répétés à la même fonction voient l'état à jour — un simple
   * `for (...) await runAction(...)` perdrait silencieusement toutes les
   * confirmations sauf la dernière.
   */
  const runBulkConfirmReview = useCallback(async () => {
    const initialState = stateRef.current;
    const visible = computeF010ReviewVisibleEntries(initialState.review);
    const confirmableFields = computeF010ReviewConfirmableFields(initialState, visible);
    if (confirmableFields.length === 0) return;

    setBusy(true);
    try {
      let currentState = initialState;
      const accumulatedMessages: F010Message[] = [];
      for (const field of confirmableFields) {
        const turn = await assistant.handle(currentState, { type: "confirm_extracted_field", field });
        currentState = turn.state;
        accumulatedMessages.push(...turn.messages);
      }

      setState(currentState);
      setMessages((prev) => [...prev, ...accumulatedMessages]);

      const leftReview =
        initialState.step === "review_extraction" && currentState.step !== "review_extraction";
      const bulkAnnouncement = buildF010BulkConfirmAnnouncement({
        confirmedCount: confirmableFields.length,
        hasRemainingConflicts: collectF010ReviewConflictFields(currentState).length > 0,
        transitionAssistantMessage: leftReview
          ? pickLastF010AssistantMessageFromDelta(accumulatedMessages)
          : null,
      });
      if (bulkAnnouncement) {
        announceText(bulkAnnouncement, {
          previousStep: initialState.step,
          nextStep: currentState.step,
          skipStepFocus: leftReview,
        });
      }

      if (leftReview) {
        setEditingReviewField(null);
        setReviewFieldDraft("");
      }
      if (shouldSyncF010LocalForms(initialState.step, currentState.step)) {
        syncLocalFormsFromState(currentState);
      }

      persistSession(currentState, analyzingDocumentId, pendingExtraction);
    } finally {
      setBusy(false);
    }
  }, [assistant, analyzingDocumentId, pendingExtraction, persistSession, syncLocalFormsFromState, announceText]);

  const persistCompletion = useCallback(
    (finalState: F010State) => {
      const r = finalState.result;
      if (!r) return;
      const confirmedAt = new Date().toISOString();
      dispatch({
        type: "CONFIRM_LOGEMENT_PROFILE",
        profile: {
          propertyType: finalState.typeBien === "maison" ? "maison" : "appartement",
          surface: finalState.surface,
          acquisitionDate: finalState.dateAcquisition,
          address: finalState.adresse,
        },
        backgroundExtraction: {
          acquisitionPrice: finalState.prixAcquisition,
          notaryFees: finalState.fraisNotaire,
          furnitureAmount: finalState.montantMobilier,
        },
      });
      const logementAmortissement = {
        prixRevient: r.prixRevient,
        valeurTerrain: r.valeurTerrain,
        valeurBati: r.valeurBati,
        baseAmortissableBati: r.baseAmortissableBati,
        montantMobilier: r.montantMobilierIsole,
        dotationAnnuelle: r.dotationAnnuelle,
        dureeMoyenneAnnees: r.dureeMoyenneAnnees,
        prorataRatio: r.prorataRatio,
        plan: r.plan,
        fieldSources: finalState.fieldSources,
        computedAt: confirmedAt,
      };
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: { logementAmortissement },
      });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "logement-assistant" });
      void flushWorkspace({
        declarationDraft: {
          logementAssistantState: toF010PersistedState(finalState, confirmedAt),
          logementAmortissement,
          logementConfirmedAt: confirmedAt,
        },
      });
    },
    [dispatch, flushWorkspace],
  );

  /**
   * Applique le résultat d'une analyse (fraîche ou reprise) — chemin partagé
   * entre `handleUpload` et la reprise d'analyse interrompue, pour ne jamais
   * dupliquer cette logique.
   *
   * Cycle 4C2 : un succès (complet ou partiel) ne fusionne plus rien
   * localement — il dispatche `analysis_success`, et c'est le runtime
   * (`review_extraction`) qui devient la seule source de vérité pour la revue
   * et la détection de conflit. Seul un échec continue d'utiliser le chemin
   * `extractionOutcome` de collect_bien (contrainte : un échec d'extraction
   * n'entre jamais en review_extraction).
   */
  const applyAnalysisResult = useCallback(
    (documentId: string, result: RunF010UploadFlowResult) => {
      const governedStore = readGovernedFieldStore(draft);
      // Champs Crédit (F-011) — gouvernance cross-tunnel uniquement, jamais F010State.
      const creditPayload = buildF010CreditGovernancePayload(result.pipelineResult.extraction.extraction);
      if (Object.keys(creditPayload).length > 0) {
        const { store: nextGovernedStore } = ingestExtractionIntoStore({
          store: governedStore,
          sourceTunnel: "logement",
          sourceDocument: "acte_notarie",
          extractedBy: "gpt",
          payload: creditPayload,
        });
        dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { governedFields: nextGovernedStore } });
      }

      if (result.outcome.state === "failed") {
        setExtractionOutcome(result.outcome);
        // Échec définitif : ne jamais laisser un analyzingDocumentId fantôme
        // relancer silencieusement la même analyse à la prochaine reprise — seul
        // un upload interrompu EN VOL doit auto-reprendre (règle Cycle 2 #4).
        setAnalyzingDocumentId(undefined);
        setPendingExtraction(undefined);
        persistSession(stateRef.current, undefined, undefined);
        return;
      }

      setExtractionOutcome(null);
      void runAction({ type: "analysis_success", documentId, proposal: result.prefill });
    },
    [dispatch, draft, persistSession, runAction],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setExtractionOutcome(null);
      setBusy(true);
      analyzingRef.current = true;
      try {
        const documentId = crypto.randomUUID();
        const document = buildF010SyntheticDocument({
          id: documentId,
          fiscalYearId: workspace.fiscalYear.id,
          file,
        });

        // Persistance du document pour l'historique/reprise future (Cycle 2) —
        // n'engage pas l'analyse elle-même, qui utilise le fichier en mémoire
        // directement (ci-dessous) pour éviter toute course avec ce dispatch.
        dispatch({
          type: "UPLOAD_DOCUMENTS",
          files: [{ file, category: document.category, documentId }],
        });

        const result = await runF010UploadFlow({
          file,
          documentId,
          fiscalYearId: workspace.fiscalYear.id,
          fiscalYear,
          onAnalysisStarting: (id) => {
            // Règle Cycle 2 #1 : persister analyzingDocumentId AVANT tout appel
            // OCR/GPT — appelé de façon SYNCHRONE par runF010UploadFlow, avant
            // l'attente de la promesse d'analyse.
            setAnalyzingDocumentId(id);
            persistSession(stateRef.current, id, undefined);
          },
        });

        applyAnalysisResult(documentId, result);
      } catch {
        setExtractionOutcome({
          state: "failed",
          hasAnyPrefillField: false,
          missingCoreFields: ["prixAcquisition", "dateAcquisition"],
        });
        setAnalyzingDocumentId(undefined);
        setPendingExtraction(undefined);
        persistSession(stateRef.current, undefined, undefined);
      } finally {
        setBusy(false);
        analyzingRef.current = false;
      }
    },
    [dispatch, fiscalYear, workspace.fiscalYear.id, persistSession, applyAnalysisResult],
  );

  // Cycle 2 — reprend une analyse interrompue en vol (fermeture d'onglet pendant
  // l'appel OCR/GPT) : `analyzingDocumentId` persisté mais aucun `pendingExtraction`
  // encore produit. Utilise le VRAI `getFile()` du store (repli IndexedDB/Supabase),
  // pas la closure locale de handleUpload — le fichier survit au refresh grâce à
  // `syncDocumentBlobs` (déclenché par le dispatch UPLOAD_DOCUMENTS ci-dessus).
  useEffect(() => {
    if (state.step !== "collect_bien") return;
    if (!analyzingDocumentId || pendingExtraction) return;
    if (analyzingRef.current) return;
    const file = getFile(analyzingDocumentId);
    if (!file) return; // getFile déclenche son propre chargement asynchrone ; l'effet se redéclenche à sa résolution.

    const documentId = analyzingDocumentId;
    analyzingRef.current = true;
    void runF010UploadFlow({
      file,
      documentId,
      fiscalYearId: workspace.fiscalYear.id,
      fiscalYear,
      // Déjà persisté avant l'interruption — pas de nouveau dispatch nécessaire.
      onAnalysisStarting: () => {},
    })
      .then((result) => applyAnalysisResult(documentId, result))
      .catch(() => {
        setExtractionOutcome({
          state: "failed",
          hasAnyPrefillField: false,
          missingCoreFields: ["prixAcquisition", "dateAcquisition"],
        });
        setAnalyzingDocumentId(undefined);
        setPendingExtraction(undefined);
        persistSession(stateRef.current, undefined, undefined);
      })
      .finally(() => {
        analyzingRef.current = false;
        setResumeAnalysisActive(false);
      });
  }, [
    state.step,
    analyzingDocumentId,
    pendingExtraction,
    getFile,
    workspace.fiscalYear.id,
    fiscalYear,
    applyAnalysisResult,
    persistSession,
  ]);

  const handleRetryUpload = useCallback(() => {
    setExtractionOutcome(null);
    fileRef.current?.click();
  }, []);

  const dismissExtractionOutcome = useCallback(() => {
    setExtractionOutcome(null);
  }, []);

  const estimateFrais = useCallback(() => {
    const prixValue = Number(prix);
    if (!Number.isFinite(prixValue) || prixValue <= 0) return;
    // natureBien est garanti connu ici (Cycle 4B) : ce callback n'est jamais
    // déclenché tant que la question ancien/neuf n'a pas été répondue — voir
    // handleEstimateFraisClick / answerNatureBienForEstimate ci-dessous. Calcul
    // et appel à suggestFrais inchangés.
    const suggestion = suggestFrais({ prixAcquisition: prixValue, natureBien: natureBien! });
    setFrais(String(Math.round(suggestion.montantSuggere)));
    setFraisSource("estimated");
  }, [prix, natureBien]);

  /** Cycle 4B : "Estimer pour moi" demande ancien/neuf uniquement si pas déjà connu. */
  const handleEstimateFraisClick = useCallback(() => {
    if (natureBien === undefined) {
      setShowNatureBienPrompt(true);
      return;
    }
    estimateFrais();
  }, [natureBien, estimateFrais]);

  /** Répond à la question contextuelle puis applique immédiatement l'estimation — même calcul que estimateFrais, jamais dupliqué en dehors de ce déclenchement immédiat. */
  const answerNatureBienForEstimate = useCallback(
    (value: "ancien" | "neuf") => {
      setNatureBien(value);
      setShowNatureBienPrompt(false);
      const prixValue = Number(prix);
      if (!Number.isFinite(prixValue) || prixValue <= 0) return;
      const suggestion = suggestFrais({ prixAcquisition: prixValue, natureBien: value });
      setFrais(String(Math.round(suggestion.montantSuggere)));
      setFraisSource("estimated");
    },
    [prix],
  );

  const estimateRatio = useCallback(() => {
    if (!localisation) return;
    const suggestion = suggestRatioTerrain({ typeBien, localisation });
    setRatio(String(Math.round(suggestion.ratioSuggere * 100)));
    setRatioSource("estimated");
  }, [localisation, typeBien]);

  const reviewVisibleEntries = useMemo(() => computeF010ReviewVisibleEntries(state.review), [state.review]);
  const reviewHasMissingFields = useMemo(() => computeF010ReviewHasMissingFields(state.review), [state.review]);
  const reviewResolvedCount = reviewVisibleEntries.filter(([, entry]) => entry.status !== "pending").length;
  const reviewHasPending = reviewVisibleEntries.some(([, entry]) => entry.status === "pending");
  const reviewConfirmableFields = useMemo(
    () => computeF010ReviewConfirmableFields(state, reviewVisibleEntries),
    [state, reviewVisibleEntries],
  );

  const step = state.step;
  const stepFocusRef = useRef<HTMLHeadingElement>(null);
  const prevStepRef = useRef<F010State["step"] | null>(null);
  const showAnalysisStatus = shouldShowF010AnalysisStatus(analyzingDocumentId, busy, resumeAnalysisActive);

  useEffect(() => {
    if (prevStepRef.current === step) return;
    const isFirstTransition = prevStepRef.current === null;
    prevStepRef.current = step;

    if (isFirstTransition) {
      if (shouldSkipF010InitialStepFocus(initialResume.decision.kind, initialResume.turn.messages)) {
        return;
      }
      stepFocusRef.current?.focus();
      return;
    }

    if (skipStepFocusRef.current) {
      skipStepFocusRef.current = false;
      return;
    }
    stepFocusRef.current?.focus();
  }, [step, initialResume.decision.kind, initialResume.turn.messages]);

  const collectBienSubmitBlocked = !busy && (!prix || !dateAcq);
  const collectFraisSubmitBlocked = !busy && !frais;
  const collectMobilierSubmitBlocked = !busy && !mobilier;
  const ventilationSubmitBlocked = !busy && !ratio;

  return (
    <div className="mx-auto max-w-2xl">
      <div id={F010_ANNOUNCER_ID} aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <header style={{ marginBottom: spacing.scale[6] }}>
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            letterSpacing: typography.letterSpacing.label,
            textTransform: "uppercase",
          }}
        >
          Assistant Logement
        </p>
        <h1 style={{ ...typography.sectionTitle.desktop, color: colors.text.primary, marginTop: spacing.scale[2] }}>
          Calculons l&apos;amortissement de votre bien
        </h1>
        <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Exercice {fiscalYear} — nous estimons ce que votre logement vous fait économiser chaque année.
        </p>
      </header>

      <Card className="!p-0 overflow-hidden">
        <div
          style={{
            padding: spacing.scale[5],
            minHeight: "280px",
            maxHeight: "420px",
            overflowY: "auto",
            backgroundColor: colors.surface.primary,
          }}
        >
          {messages.map((message, index) => (
            <MessageBubble key={`${message.role}-${index}`} message={message} />
          ))}
        </div>

        <div
          style={{
            borderTop: `1px solid ${colors.border.subtle}`,
            padding: spacing.scale[5],
            backgroundColor: colors.surface.secondary,
          }}
        >
          <h2 ref={stepFocusRef} tabIndex={-1} id="f010-step-heading" className="sr-only">
            {F010_STEP_TITLES[step]}
          </h2>
          {step === "orientation" ? (
            <div className="flex flex-col gap-2">
              {[
                { id: "achat", label: "Un achat (ancien ou neuf)" },
                { id: "vefa", label: "Un achat sur plan (VEFA)" },
                { id: "heritage_donation", label: "Un héritage ou une donation" },
                { id: "conversion", label: "Ma résidence transformée en location" },
                { id: "indivision", label: "Un bien détenu à plusieurs" },
                { id: "autre", label: "Autre / je ne sais pas" },
              ].map((option) => (
                <Button
                  key={option.id}
                  variant="secondary"
                  disabled={busy}
                  className={F010_FOCUS_BUTTON_CLASS}
                  onClick={() => void runAction({ type: "select_nature", nature: option.id as F010Nature })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}

          {step === "coming_soon" ? (
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={() => void runAction({ type: "go_back" })}
              >
                Choisir un autre type d&apos;acquisition
              </Button>
              <Button href={LMNP_ROUTES.dashboard} className={`w-full ${F010_FOCUS_BUTTON_CLASS}`} variant="ghost">
                Retour au tableau de bord
              </Button>
            </div>
          ) : null}

          {step === "acquisition_source" ? (
            <div className="flex flex-col gap-2">
              {[
                { id: "acte", label: "Oui, j'ai mon acte notarié" },
                { id: "partiel", label: "Je l'ai, mais incomplet" },
                { id: "manuel", label: "Non, je saisirai les montants" },
              ].map((option) => (
                <Button
                  key={option.id}
                  variant="secondary"
                  disabled={busy}
                  className={F010_FOCUS_BUTTON_CLASS}
                  onClick={() =>
                    void runAction({
                      type: "select_source",
                      source: option.id as "acte" | "partiel" | "manuel",
                    })
                  }
                >
                  {option.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={() => void runAction({ type: "go_back" })}
              >
                Précédent
              </Button>
            </div>
          ) : null}

          {step === "collect_bien" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const parsedPrix = Number(prix);
                const parsedSurface = surface ? Number(surface) : undefined;
                void runAction({
                  type: "submit_bien",
                  prixAcquisition: parsedPrix,
                  typeBien,
                  natureBien,
                  dateAcquisition: dateAcq,
                  surface: parsedSurface,
                  fieldSources: {
                    prixAcquisition: prixSource,
                    typeBien: typeBienSource,
                    dateAcquisition: dateAcqSource,
                    surface: surfaceSource,
                  },
                });
                // Verrouille les champs confirmés (contrainte Cycle 1 #7) : un futur
                // document (Tunnel A ou un second acte F010) ne pourra plus les
                // écraser silencieusement — cf. f010-document-prefill.ts.
                const locks = buildF010ConfirmedFieldLocks({
                  prixAcquisition: parsedPrix,
                  dateAcquisition: dateAcq,
                  surface: parsedSurface,
                  typeBien,
                });
                if (locks.length > 0) {
                  let nextStore = readGovernedFieldStore(draft);
                  for (const lock of locks) {
                    nextStore = lockGovernedField(nextStore, lock.field, lock.value);
                  }
                  dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { governedFields: nextStore } });
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <F010FieldLabel htmlFor={F010_FORM_FIELD_IDS.fileActe}>
                  Importer mon acte notarié (PDF ou image)
                </F010FieldLabel>
                <input
                  ref={fileRef}
                  id={F010_FORM_FIELD_IDS.fileActe}
                  type="file"
                  accept="application/pdf,image/*"
                  className="sr-only"
                  aria-label="Importer mon acte notarié (PDF ou image)"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleUpload(file);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  className={F010_FOCUS_BUTTON_CLASS}
                  onClick={() => fileRef.current?.click()}
                >
                  Importer mon acte notarié
                </Button>
                {showAnalysisStatus ? (
                  <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-1">
                    <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
                      Analyse de votre document en cours…
                    </p>
                    <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                      Nous récupérons automatiquement les informations utiles.
                    </p>
                  </div>
                ) : null}
                {extractionOutcome?.state === "failed" ? (
                  <LogementExtractionFallbackCard
                    onManualFallback={dismissExtractionOutcome}
                    onRetry={handleRetryUpload}
                  />
                ) : null}
              </div>

              <F010FieldLabel htmlFor={F010_FORM_FIELD_IDS.bienPrix}>Prix d&apos;achat du bien (€)</F010FieldLabel>
              <Input
                id={F010_FORM_FIELD_IDS.bienPrix}
                value={prix}
                onChange={(e) => {
                  setPrix(e.target.value);
                  setPrixSource("manual");
                }}
                inputMode="numeric"
              />

              <F010FieldLabel htmlFor={F010_FORM_FIELD_IDS.bienType}>Type de bien</F010FieldLabel>
              <Select
                id={F010_FORM_FIELD_IDS.bienType}
                value={typeBien}
                onChange={(e) => {
                  setTypeBien(e.target.value as TypeBien);
                  setTypeBienSource("manual");
                }}
              >
                <option value="appartement">Appartement</option>
                <option value="maison">Maison</option>
                <option value="autre">Autre</option>
              </Select>

              <F010FieldLabel htmlFor={F010_FORM_FIELD_IDS.bienDate}>Date d&apos;acquisition</F010FieldLabel>
              <Input
                id={F010_FORM_FIELD_IDS.bienDate}
                type="date"
                value={dateAcq}
                onChange={(e) => {
                  setDateAcq(e.target.value);
                  setDateAcqSource("manual");
                }}
              />

              <F010FieldLabel htmlFor={F010_FORM_FIELD_IDS.bienSurface}>Surface (m²) — optionnel</F010FieldLabel>
              <Input
                id={F010_FORM_FIELD_IDS.bienSurface}
                value={surface}
                onChange={(e) => {
                  setSurface(e.target.value);
                  setSurfaceSource("manual");
                }}
                inputMode="numeric"
              />

              <span id={F010_SUBMIT_HINT_IDS.collectBien} className="sr-only">
                Renseignez le prix d&apos;achat et la date d&apos;acquisition pour continuer.
              </span>
              <Button
                type="submit"
                disabled={busy || !prix || !dateAcq}
                className={F010_FOCUS_BUTTON_CLASS}
                aria-describedby={collectBienSubmitBlocked ? F010_SUBMIT_HINT_IDS.collectBien : undefined}
              >
                Continuer
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={() => void runAction({ type: "go_back" })}
              >
                Précédent
              </Button>
            </form>
          ) : null}

          {step === "review_extraction" && state.review ? (
            <div className="flex flex-col gap-3">
              <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                {reviewResolvedCount} sur {reviewVisibleEntries.length} information
                {reviewVisibleEntries.length > 1 ? "s" : ""} traitée{reviewResolvedCount > 1 ? "s" : ""}.
              </p>

              {reviewHasMissingFields ? (
                <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                  Il me manque encore quelques informations.
                </p>
              ) : null}

              {reviewHasPending ? (
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || reviewConfirmableFields.length === 0}
                    className={F010_FOCUS_BUTTON_CLASS}
                    onClick={() => void runBulkConfirmReview()}
                  >
                    Tout confirmer
                  </Button>
                  <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                    Ces informations correspondent à votre acte.
                  </p>
                </div>
              ) : null}

              {reviewVisibleEntries.map(([field, entry]) => {
                const { fieldId, labelId, valueId, statusId, provenanceId } = buildF010ReviewFieldA11yIds(field);
                const currentValue = f010ReviewFieldCurrentValue(state, field);
                const isConflict = isF010ReviewFieldConflict(state, field, entry);
                const displayRaw = entry.status === "pending" ? entry.proposedValue : currentValue;
                const provenance =
                  entry.status === "pending"
                    ? f010ReviewProvenanceLabel(entry.source)
                    : f010ReviewProvenanceLabel(state.fieldSources[field]);
                const statusLabel = f010ReviewStatusAccessibleLabel(entry);
                const isEditing = editingReviewField === field;
                const valueDescribedBy = [statusLabel ? statusId : null, provenance ? provenanceId : null]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div
                    key={field}
                    style={{
                      borderRadius: radius.md,
                      border: `1px solid ${colors.border.subtle}`,
                      backgroundColor: colors.surface.inset,
                      padding: spacing.scale[4],
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span id={labelId} style={labelStyle}>
                        {F010_REVIEW_FIELD_LABELS[field]}
                      </span>
                      {statusLabel ? (
                        <span id={statusId} style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                          {statusLabel}
                        </span>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <div className="mt-2 flex flex-col gap-2">
                        {field === "typeBien" ? (
                          <Select
                            id={fieldId}
                            aria-labelledby={labelId}
                            value={reviewFieldDraft}
                            onChange={(event) => setReviewFieldDraft(event.target.value)}
                          >
                            <option value="appartement">Appartement</option>
                            <option value="maison">Maison</option>
                            <option value="autre">Autre</option>
                          </Select>
                        ) : (
                          <Input
                            id={fieldId}
                            aria-labelledby={labelId}
                            value={reviewFieldDraft}
                            onChange={(event) => setReviewFieldDraft(event.target.value)}
                            type={field === "dateAcquisition" ? "date" : "text"}
                            inputMode={
                              field === "prixAcquisition" || field === "surface" || field === "fraisNotaire"
                                ? "numeric"
                                : undefined
                            }
                          />
                        )}
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            disabled={busy || !reviewFieldDraft}
                            className={F010_FOCUS_BUTTON_CLASS}
                            onClick={() => {
                              void runAction({ type: "correct_extracted_field", field, value: reviewFieldDraft });
                              setEditingReviewField(null);
                            }}
                          >
                            Valider la correction
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            className={F010_FOCUS_BUTTON_CLASS}
                            onClick={() => setEditingReviewField(null)}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p
                          id={valueId}
                          aria-labelledby={labelId}
                          aria-describedby={valueDescribedBy || undefined}
                          style={{ ...typography.body.desktop, color: colors.text.primary, marginTop: spacing.scale[1] }}
                        >
                          {displayRaw !== undefined ? formatF010ReviewValue(field, displayRaw) : "—"}
                        </p>
                        {provenance ? (
                          <p id={provenanceId} style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                            {provenance}
                          </p>
                        ) : null}

                        {isConflict ? (
                          <div className="mt-2 flex flex-col gap-2">
                            <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
                              Cette information diffère de votre réponse précédente.
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                className={F010_FOCUS_BUTTON_CLASS}
                                onClick={() =>
                                  void runAction({ type: "correct_extracted_field", field, value: currentValue! })
                                }
                              >
                                Conserver ma réponse ({formatF010ReviewValue(field, currentValue!)})
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                className={F010_FOCUS_BUTTON_CLASS}
                                onClick={() => void runAction({ type: "confirm_extracted_field", field })}
                              >
                                Utiliser la donnée de l&apos;acte ({formatF010ReviewValue(field, entry.proposedValue!)})
                              </Button>
                            </div>
                          </div>
                        ) : entry.status === "pending" ? (
                          <div className="mt-2 flex gap-2">
                            <Button
                              type="button"
                              disabled={busy}
                              className={F010_FOCUS_BUTTON_CLASS}
                              onClick={() => void runAction({ type: "confirm_extracted_field", field })}
                            >
                              Confirmer
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={busy}
                              className={F010_FOCUS_BUTTON_CLASS}
                              onClick={() => {
                                setEditingReviewField(field);
                                setReviewFieldDraft(entry.proposedValue ?? "");
                              }}
                            >
                              Corriger
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}

              <Button
                variant="ghost"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={() => void runAction({ type: "go_back" })}
              >
                ← Modifier le document
              </Button>
            </div>
          ) : null}

          {step === "collect_frais" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction({
                  type: "submit_frais",
                  fraisNotaire: Number(frais),
                  choixTraitementFrais: choixFrais,
                  natureBien,
                  source: fraisSource,
                });
              }}
            >
              <F010FieldLabel htmlFor={F010_FORM_FIELD_IDS.fraisMontant}>Frais de notaire (€)</F010FieldLabel>
              <Input
                id={F010_FORM_FIELD_IDS.fraisMontant}
                value={frais}
                onChange={(e) => {
                  setFrais(e.target.value);
                  setFraisSource("manual");
                }}
                inputMode="numeric"
              />
              {showNatureBienPrompt ? (
                <div
                  style={{
                    borderRadius: radius.md,
                    border: `1px solid ${colors.border.subtle}`,
                    backgroundColor: colors.surface.inset,
                    padding: spacing.scale[4],
                  }}
                >
                  <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
                    Votre logement est-il ancien ou neuf ?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className={F010_FOCUS_BUTTON_CLASS}
                      onClick={() => answerNatureBienForEstimate("ancien")}
                    >
                      Ancien
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className={F010_FOCUS_BUTTON_CLASS}
                      onClick={() => answerNatureBienForEstimate("neuf")}
                    >
                      Neuf
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || !prix}
                  className={F010_FOCUS_BUTTON_CLASS}
                  onClick={handleEstimateFraisClick}
                >
                  Je ne sais pas — estimer pour moi
                </Button>
              )}

              <span id={F010_FORM_FIELD_IDS.fraisTraitementGroup} style={labelStyle}>
                Comment traiter ces frais ?
              </span>
              <div
                className="flex flex-col gap-2"
                role="group"
                aria-labelledby={F010_FORM_FIELD_IDS.fraisTraitementGroup}
              >
                <Button
                  type="button"
                  variant={choixFrais === "integration" ? "primary" : "secondary"}
                  disabled={busy}
                  aria-pressed={choixFrais === "integration"}
                  className={F010_FOCUS_BUTTON_CLASS}
                  onClick={() => setChoixFrais("integration")}
                >
                  Les ajouter à la valeur du bien (recommandé)
                </Button>
                <Button
                  type="button"
                  variant={choixFrais === "deduction" ? "primary" : "secondary"}
                  disabled={busy}
                  aria-pressed={choixFrais === "deduction"}
                  className={F010_FOCUS_BUTTON_CLASS}
                  onClick={() => setChoixFrais("deduction")}
                >
                  Les déduire immédiatement
                </Button>
              </div>

              <span id={F010_SUBMIT_HINT_IDS.collectFrais} className="sr-only">
                Renseignez le montant des frais de notaire pour continuer.
              </span>
              <Button
                type="submit"
                disabled={busy || !frais}
                className={F010_FOCUS_BUTTON_CLASS}
                aria-describedby={collectFraisSubmitBlocked ? F010_SUBMIT_HINT_IDS.collectFrais : undefined}
              >
                Continuer
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={() => void runAction({ type: "go_back" })}
              >
                Précédent
              </Button>
            </form>
          ) : null}

          {step === "collect_mobilier" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction({
                  type: "submit_mobilier",
                  montantMobilier: Number(mobilier),
                  mode: "lot",
                });
              }}
            >
              <F010FieldLabel htmlFor={F010_FORM_FIELD_IDS.mobilierMontant}>Montant du mobilier inclus (€)</F010FieldLabel>
              <Input
                id={F010_FORM_FIELD_IDS.mobilierMontant}
                value={mobilier}
                onChange={(e) => setMobilier(e.target.value)}
                inputMode="numeric"
              />
              <span id={F010_SUBMIT_HINT_IDS.collectMobilier} className="sr-only">
                Renseignez le montant du mobilier ou choisissez « Pas de mobilier ».
              </span>
              <Button
                type="submit"
                disabled={busy || !mobilier}
                className={F010_FOCUS_BUTTON_CLASS}
                aria-describedby={collectMobilierSubmitBlocked ? F010_SUBMIT_HINT_IDS.collectMobilier : undefined}
              >
                Continuer
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={() => void runAction({ type: "skip_mobilier" })}
              >
                Pas de mobilier
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={() => void runAction({ type: "go_back" })}
              >
                Précédent
              </Button>
            </form>
          ) : null}

          {step === "ventilation" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction({
                  type: "submit_ventilation",
                  ratioTerrain: Number(ratio) / 100,
                  localisation: localisation || undefined,
                  source: ratioSource,
                });
              }}
            >
              <F010FieldLabel htmlFor={F010_FORM_FIELD_IDS.ventilationLocalisation}>Où se situe le bien ?</F010FieldLabel>
              <Select
                id={F010_FORM_FIELD_IDS.ventilationLocalisation}
                value={localisation}
                onChange={(e) => setLocalisation(e.target.value as Localisation)}
              >
                <option value="">Sélectionner…</option>
                {(LOCALISATIONS[typeBien] ?? LOCALISATIONS.autre).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="ghost"
                disabled={busy || !localisation}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={estimateRatio}
              >
                Proposer une estimation
              </Button>

              <F010FieldLabel htmlFor={F010_FORM_FIELD_IDS.ventilationRatio}>Part du terrain (%)</F010FieldLabel>
              <Input
                id={F010_FORM_FIELD_IDS.ventilationRatio}
                value={ratio}
                onChange={(e) => {
                  setRatio(e.target.value);
                  setRatioSource("manual");
                }}
                inputMode="numeric"
              />

              <span id={F010_SUBMIT_HINT_IDS.ventilation} className="sr-only">
                Renseignez la part du terrain pour calculer l&apos;amortissement.
              </span>
              <Button
                type="submit"
                disabled={busy || !ratio}
                className={F010_FOCUS_BUTTON_CLASS}
                aria-describedby={ventilationSubmitBlocked ? F010_SUBMIT_HINT_IDS.ventilation : undefined}
              >
                Calculer mon amortissement
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={() => void runAction({ type: "go_back" })}
              >
                Précédent
              </Button>
            </form>
          ) : null}

          {step === "review_plan" && state.result ? (
            <div className="flex flex-col gap-3">
              <ReviewPlanInputsSummary state={state} />
              <PlanSummary result={state.result} />
              <Button disabled={busy} className={F010_FOCUS_BUTTON_CLASS} onClick={() => void runAction({ type: "confirm" })}>
                Oui, je valide
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={() => void runAction({ type: "go_back" })}
              >
                Modifier mes réponses
              </Button>
              <Button
                id={F010_RESTART_DIALOG_IDS.trigger}
                variant="ghost"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={handleRestartClick}
              >
                Recommencer depuis le début
              </Button>
            </div>
          ) : null}

          {step === "complete" ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button href={LMNP_ROUTES.financement} className={`w-full flex-1 ${F010_FOCUS_BUTTON_CLASS}`}>
                  Continuer vers Financement
                </Button>
                <Button href={LMNP_ROUTES.dashboard} variant="ghost" className={F010_FOCUS_BUTTON_CLASS}>
                  Retour au tableau de bord
                </Button>
              </div>
              <Button
                variant="ghost"
                disabled={busy}
                className={F010_FOCUS_BUTTON_CLASS}
                onClick={() => void runAction({ type: "go_back" })}
              >
                Modifier mes réponses
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      <F010RestartConfirmDialog
        open={showRestartConfirm}
        onCancel={handleRestartCancel}
        onConfirm={handleRestartConfirm}
        returnFocusId={F010_RESTART_DIALOG_IDS.trigger}
      />
    </div>
  );
}
