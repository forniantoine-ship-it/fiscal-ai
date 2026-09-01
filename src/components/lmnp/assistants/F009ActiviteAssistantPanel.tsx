"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import { ActiviteHero } from "@/components/lmnp/activite/ActiviteHero";
import { ActiviteInterrupted } from "@/components/lmnp/activite/ActiviteInterrupted";
import { ActiviteProfileFields, type ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { groundActiviteFactExtraction } from "@/lib/documents/facts/grounding-engine";
import {
  extractAddressLine,
  formatAddressLine,
  projectDocumentFactsToF009,
} from "@/lib/documents/facts/f009-fact-projection";
import { ACTIVITE_ACTIVITY_TYPE } from "@/lib/lmnp/constants/activite-product";
import {
  runActiviteDocumentPipeline,
  type ActiviteGptPipelineResult,
} from "@/lib/lmnp/services/activite-document-pipeline";
import { DocumentOcrFailedError } from "@/lib/lmnp/services/activite-gpt-pipeline";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { supabase } from "@/lib/supabase";
import { useLmnp } from "@/lib/lmnp/store";
import type { LmnpDocument } from "@/lib/lmnp/types";
import { uploadFilesForUser } from "@/lib/uploadDocument";
import {
  F009ActiviteAssistant,
  shouldResumeF009,
  toF009PersistedState,
  ALL_F009_DOCUMENT_FIELD_KEYS,
  type F009Action,
  type F009AnalysisFailureCause,
  type F009DocumentFieldKey,
  type F009Message,
  type F009Orientation,
  type F009State,
} from "@/runtime";

function MessageBubble({ message }: { message: F009Message }) {
  const isAssistant = message.role === "assistant";
  return (
    <div
      className={isAssistant ? "mr-8" : "ml-8 text-right"}
      style={{ marginBottom: spacing.scale[3] }}
    >
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

/**
 * A plain text/date input with a visible keyboard-focus ring (design-system `Input`
 * pattern replicated locally) — closes the focus-outline gap flagged for this panel
 * in the F009 spec (§14, garde-fou 6).
 */
function FocusableInput({
  focusLabel,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { focusLabel?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      aria-label={focusLabel ?? props["aria-label"]}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      className={`w-full outline-none ${props.className ?? ""}`}
      style={{
        ...typography.body.desktop,
        padding: spacing.scale[3],
        borderRadius: radius.md,
        border: `1px solid ${focused ? colors.border.focus : colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
        boxShadow: focused ? `0 0 0 3px ${colors.focus.ring}33` : "none",
        ...props.style,
      }}
    />
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label style={{ ...typography.caption.desktop, color: colors.text.muted }}>{children}</label>
  );
}

function isLikelyNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof TypeError;
}

/** Steps from which the manual path can still reach for a document (spec §04). */
const DOCUMENT_FOUND_LATER_STEPS = new Set<F009State["step"]>([
  "no_document",
  "manual_profile",
  "ask_missing_data",
]);

/** True once `declarationDraft` already carries the three fields the legacy shortcut checks. */
function isLegacyComplete(draft: ReturnType<typeof useLmnp>["workspace"]["declarationDraft"]): boolean {
  return Boolean(draft?.siret && draft.activityStartDate && draft.dateMiseEnService);
}

/**
 * Rebuilds the editable manual-profile form values from F009State — used both at
 * mount (resume) and whenever the profile sub-screen is reopened via GO_BACK. The
 * two addresses are split back out of their combined `state.personalAddress`/
 * `establishmentAddress` line via `extractAddressLine` (deterministic — reverses
 * the exact format `formatAddressLine` produces), so re-editing never loses data.
 */
function buildManualProfileFormValues(state: F009State): ActiviteFormValues {
  return {
    lastName: state.lastName ?? "",
    firstName: state.firstName ?? "",
    siren: state.siren ?? "",
    email: state.email ?? "",
    telephone: state.telephone ?? "",
    personalAddress: extractAddressLine(
      state.personalAddress,
      state.personalAddressPostalCode,
      state.personalAddressCity,
    ),
    personalCity: state.personalAddressCity ?? "",
    personalPostalCode: state.personalAddressPostalCode ?? "",
    establishmentAddress: extractAddressLine(
      state.establishmentAddress,
      state.establishmentAddressPostalCode,
      state.establishmentAddressCity,
    ),
    establishmentCity: state.establishmentAddressCity ?? "",
    establishmentPostalCode: state.establishmentAddressPostalCode ?? "",
  };
}

/** Maps the form's shape to the plain string record `submit_manual_profile_fields` expects. */
function manualProfileValuesToRecord(values: ActiviteFormValues): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.trim()) record[key] = value.trim();
  }
  return record;
}

export function F009ActiviteAssistantPanel() {
  const { workspace, dispatch, getFile } = useLmnp();
  const fiscalYear = workspace.fiscalYear.year;

  const assistant = useMemo(
    () =>
      new F009ActiviteAssistant({
        dossierId: workspace.fiscalYear.id,
        fiscalYear,
        route: "/assistants/activite",
      }),
    [fiscalYear, workspace.fiscalYear.id],
  );

  // Resume order: (1) a session actively in progress in
  // declarationDraft.activiteAssistantState (Étape 4 — never restarts at INTRO)
  // → (2) the legacy "already registered" shortcut → (3) genuinely nothing yet
  // → start(). The active-session check MUST come first: after COMPLETE →
  // GO_BACK → edit → abandon, declarationDraft.siret/activityStartDate/
  // dateMiseEnService are still populated from the earlier completion (the
  // legacy shortcut alone can't tell a finished session from one reopened for
  // editing) — only activiteAssistantState.step, updated on every transition,
  // knows the user is mid-edit. shouldResumeF009 already excludes step
  // "complete", so a genuinely finished, never-reopened session still falls
  // through to the legacy shortcut exactly as before.
  const initialTurn = useMemo(() => {
    const draft = workspace.declarationDraft;
    if (shouldResumeF009(draft?.activiteAssistantState)) {
      return assistant.resume(draft!.activiteAssistantState!);
    }
    if (isLegacyComplete(draft)) {
      return {
        state: {
          step: "complete" as const,
          siret: draft!.siret,
          dateDebutActivite: draft!.activityStartDate,
          dateMiseEnService: draft!.dateMiseEnService,
          regimeFiscal: "reel_simplifie" as const,
          fieldSources: {},
        },
        messages: [
          { role: "assistant" as const, content: "Votre activité est déjà enregistrée pour cet exercice." },
        ],
        completed: false,
      };
    }
    return assistant.start();
    // Deliberately computed once at mount — resuming mid-session must not re-trigger
    // just because the workspace object identity changes on every autosave tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<F009State>(initialTurn.state);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [messages, setMessages] = useState<F009Message[]>(initialTurn.messages);

  const [siretInput, setSiretInput] = useState("");
  const [dateDebutInput, setDateDebutInput] = useState("");
  const [dateMiseEnServiceInput, setDateMiseEnServiceInput] = useState("");
  const [manualDateInput, setManualDateInput] = useState("");
  const [noDocSiretMode, setNoDocSiretMode] = useState<"choice" | "entering">("choice");
  const [noDocSiretInput, setNoDocSiretInput] = useState("");
  const [reviewSiretDraft, setReviewSiretDraft] = useState("");
  const [reviewDateDraft, setReviewDateDraft] = useState("");
  const [reviewLastNameDraft, setReviewLastNameDraft] = useState("");
  const [reviewFirstNameDraft, setReviewFirstNameDraft] = useState("");
  const [reviewEmailDraft, setReviewEmailDraft] = useState("");
  const [reviewTelephoneDraft, setReviewTelephoneDraft] = useState("");
  const [reviewPersonalAddressDraft, setReviewPersonalAddressDraft] = useState("");
  const [reviewEstablishmentAddressDraft, setReviewEstablishmentAddressDraft] = useState("");
  // Manual path, écran "profil" (correctif Option B) — initialisé une fois depuis
  // l'état repris/en cours ; persiste ensuite localement pendant les allers-retours
  // profil ↔ date au sein de la même session (pas de remount entre les deux).
  const [manualProfileValues, setManualProfileValues] = useState<ActiviteFormValues>(() =>
    buildManualProfileFormValues(initialTurn.state),
  );
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzingRef = useRef(false);

  /**
   * Fires once F009 reaches COMPLETE. Order matters (Étape 6) :
   *   1. vérifier que les données requises sont valides ;
   *   2. persister les données métier ;
   *   3. seulement ensuite écrire `inpiConfirmedAt` ;
   *   4. la persistance de l'état assistant continue via `persistSession`
   *      (appelée pour CHAQUE tour, y compris celui-ci, dans `applyTurn`).
   */
  const persistCompletion = useCallback(
    (finalState: F009State) => {
      // 1) Les deux seules données réellement obligatoires pour tout le parcours F009
      // (document ou manuel) : la machine les a déjà validées avant d'atteindre
      // CONFIRMING/COMPLETE (validateActiviteDates) — ce contrôle est une défense en
      // profondeur, pas une revalidation.
      const hasRequiredData = Boolean(finalState.dateDebutActivite && finalState.dateMiseEnService);

      // 2) Données métier — declarationDraft reste l'unique source de vérité.
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          siret: finalState.siret,
          // SIRET connu → SIREN dérivé (comportement existant, inchangé) ; sinon, un
          // SIREN saisi manuellement (correctif MANUAL_PROFILE §4) est conservé tel
          // quel — jamais recalculé ni supprimé.
          siren: finalState.siret ? finalState.siret.slice(0, 9) : finalState.siren,
          activityStartDate: finalState.dateDebutActivite,
          dateMiseEnService: finalState.dateMiseEnService,
          activityType: ACTIVITE_ACTIVITY_TYPE,
          // Profil INPI (jalon préremplissage) — mêmes clés que declarationDraft/InpiProfile,
          // écrites uniquement ici (source de vérité unique), jamais par F009State lui-même.
          exploitantLastName: finalState.lastName,
          exploitantFirstName: finalState.firstName,
          exploitantEmail: finalState.email,
          exploitantTelephone: finalState.telephone,
          personalAddress: finalState.personalAddress,
          personalCity: finalState.personalAddressCity,
          personalPostalCode: finalState.personalAddressPostalCode,
          establishmentAddress: finalState.establishmentAddress,
          establishmentCity: finalState.establishmentAddressCity,
          establishmentPostalCode: finalState.establishmentAddressPostalCode,
        },
      });

      // 3) Signal de complétude unifié (Étape 6) — voir la documentation du champ dans
      // domain.ts : `inpiConfirmedAt` est lu tel quel par les 4 systèmes existants
      // (carte dashboard, isStepComplete("documents"), deriveStatutDossier,
      // isDocumentJourneyComplete/isDocumentStepComplete("inpi")), aucun d'eux n'est
      // modifié ici. Écrit après les données métier, jamais avant, jamais si les
      // données requises manquent.
      if (hasRequiredData) {
        dispatch({
          type: "DECLARATION_PATCH_DRAFT",
          patch: { inpiConfirmedAt: new Date().toISOString() },
        });
        dispatch({ type: "START_DOCUMENT_JOURNEY" });
      }

      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "activite-assistant" });
      dispatch({
        type: "CONFIRM_REGIME",
        regime: "reel",
      });
    },
    [dispatch],
  );

  /**
   * Persists session/resume state only (spec §11/§12, Étape 4) — `declarationDraft`'s
   * business fields (siret, dates…) are still written exclusively by
   * `persistCompletion`. Never a second source of truth: on COMPLETE the legacy
   * shortcut takes over at the next mount regardless of this field's contents.
   */
  const persistSession = useCallback(
    (nextState: F009State) => {
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: { activiteAssistantState: toF009PersistedState(nextState, new Date().toISOString()) },
      });
    },
    [dispatch],
  );

  const applyTurn = useCallback(
    (turn: Awaited<ReturnType<F009ActiviteAssistant["handle"]>>) => {
      setState(turn.state);
      setMessages((prev) => [...prev, ...turn.messages]);
      persistSession(turn.state);
      if (turn.completed) {
        persistCompletion(turn.state);
      }
      return turn;
    },
    [persistCompletion, persistSession],
  );

  const runAction = useCallback(
    async (action: F009Action) => {
      setBusy(true);
      try {
        const wasComplete = stateRef.current.step === "complete";
        const turn = await assistant.handle(stateRef.current, action);
        applyTurn(turn);
        // Étape 6, critère G : rouvrir COMPLETE pour modification invalide le signal
        // de complétude partagé partout où il est lu, jusqu'à une nouvelle
        // confirmation explicite (persistCompletion le réécrit — critère I). La
        // machine reste indépendante de declarationDraft ; ce geste vit ici, pas
        // dans assistant.ts.
        if (wasComplete && turn.state.step !== "complete") {
          dispatch({
            type: "DECLARATION_PATCH_DRAFT",
            patch: { inpiConfirmedAt: undefined },
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [assistant, applyTurn, dispatch],
  );

  /** Runs the existing OCR → GPT → grounding pipeline, then F009's own projection (Étape 1). No new extractor, no duplicated pipeline. */
  const analyzeDocument = useCallback(
    async (documentId: string, file: File) => {
      if (analyzingRef.current) return;
      analyzingRef.current = true;
      try {
        const document: LmnpDocument = {
          id: documentId,
          fiscalYearId: workspace.fiscalYear.id,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          category: "autre",
          documentType: "unknown",
          status: "uploaded",
          uploadedAt: new Date().toISOString(),
        };

        let pipelineResult: ActiviteGptPipelineResult;
        try {
          pipelineResult = await runActiviteDocumentPipeline({
            document,
            getFile: () => file,
            fiscalYear: workspace.fiscalYear.year,
          });
        } catch (err) {
          const cause: F009AnalysisFailureCause =
            err instanceof DocumentOcrFailedError
              ? "ocr_failed"
              : isLikelyNetworkError(err)
                ? "network"
                : "ocr_failed";
          dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "failed" });
          applyTurn(await assistant.handle(stateRef.current, { type: "analysis_failed", cause }));
          return;
        }

        const grounded = groundActiviteFactExtraction(
          pipelineResult.rawText,
          pipelineResult.extraction.data,
          documentId,
        );
        const projection = projectDocumentFactsToF009(grounded.extraction);

        // Correctif régression post-upload : un document est exploitable dès qu'AU
        // MOINS UNE des 8 informations F009 est disponible — pas seulement SIRET/date.
        // Avant ce correctif, un document dont seule l'extraction GPT (profil) avait
        // réussi — SIRET/date non trouvés par l'extracteur déterministe — était classé
        // à tort "unrecognized", alors que `projection` contenait déjà ces champs.
        const hasUsableData =
          projection.siret !== undefined ||
          projection.activityStartDate !== undefined ||
          projection.lastName !== undefined ||
          projection.firstName !== undefined ||
          projection.email !== undefined ||
          projection.telephone !== undefined ||
          projection.personalAddress !== undefined ||
          projection.establishmentAddress !== undefined ||
          projection.siretAmbiguous ||
          projection.datesAmbiguous;

        if (!hasUsableData) {
          dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "failed" });
          applyTurn(
            await assistant.handle(stateRef.current, { type: "analysis_failed", cause: "unrecognized" }),
          );
          return;
        }

        dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "analyzed" });
        dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { inpiDocumentId: documentId } });
        applyTurn(await assistant.handle(stateRef.current, { type: "analysis_success", projection }));
      } finally {
        analyzingRef.current = false;
      }
    },
    [assistant, applyTurn, dispatch, workspace.fiscalYear.id, workspace.fiscalYear.year],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      setBusy(true);
      setUploadError(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setUploadError("Utilisateur non connecté.");
          return;
        }

        const { files: uploadedFiles } = await uploadFilesForUser([file], user.id);
        const uploadedFile = uploadedFiles[0];
        if (!uploadedFile) {
          setUploadError("L'import du document a échoué. Vous pouvez réessayer.");
          return;
        }

        const documentId = crypto.randomUUID();
        dispatch({
          type: "UPLOAD_DOCUMENTS",
          files: [{ file: uploadedFile, category: "autre", documentId }],
        });
        // Makes getFile(documentId) resolve immediately below, instead of waiting on
        // the store's own async IndexedDB round-trip.
        dispatch({ type: "REGISTER_FILE", documentId, file: uploadedFile });

        applyTurn(await assistant.handle(stateRef.current, { type: "upload_document", documentId }));
        // The actual OCR/GPT run is triggered by the effect below (single place that
        // starts an analysis, so retrying and resuming a persisted ANALYZING session
        // go through the exact same path as a fresh upload).
      } finally {
        setBusy(false);
      }
    },
    [assistant, applyTurn, dispatch],
  );

  // Starts (or restarts, via retry) the real analysis whenever the machine is in
  // ANALYZING for a known document — covers the initial upload, "Reprendre
  // l'analyse", and resuming a session interrupted mid-analysis (Étape 4, test 2)
  // uniformly, using the already-uploaded file (no re-upload needed).
  useEffect(() => {
    if (state.step !== "analyzing" || !state.analyzingDocumentId) return;
    if (analyzingRef.current) return;
    const file = getFile(state.analyzingDocumentId);
    if (!file) return; // getFile triggers its own async load; effect re-runs once it resolves.
    void analyzeDocument(state.analyzingDocumentId, file);
  }, [state.step, state.analyzingDocumentId, getFile, analyzeDocument]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const showIntro = state.step === "intro";
  const showAnalyzing = state.step === "analyzing";
  const showAnalysisFailed = state.step === "analysis_failed";
  const showReview = state.step === "review_extracted_data";
  const showNoDocument = state.step === "no_document";
  const showManualProfile = state.step === "manual_profile";
  const manualProfileStage: "profile" | "date" = state.manualProfile?.stage === "date" ? "date" : "profile";
  const showOrientation = state.step === "orientation";
  const showSiret = state.step === "collect_siret";
  const showActivity = state.step === "collect_activity";
  // ASK_MISSING_DATA asks for dateDebutActivite first when the document didn't
  // provide it (correctif blocage) — the two blocks are mutually exclusive derived
  // views of the same step, gated purely by whether the date is already known, so
  // GO_BACK/resume land on the right one without any extra stored sub-stage.
  const showMissingActivityDate = state.step === "ask_missing_data" && !state.dateDebutActivite;
  const showMiseEnService =
    state.step === "mise_en_service" ||
    (state.step === "ask_missing_data" && Boolean(state.dateDebutActivite));
  const showConfirmation = state.step === "confirmation";
  const isComplete = state.step === "complete";

  const showDocumentFoundLaterLink = DOCUMENT_FOUND_LATER_STEPS.has(state.step);

  const siretConflict = state.conflicts?.siret;
  const dateConflict = state.conflicts?.dateDebutActivite;
  const hasAnyConflict = ALL_F009_DOCUMENT_FIELD_KEYS.some((key) => state.conflicts?.[key] !== undefined);

  return (
    <div className="mx-auto max-w-2xl">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(event) => {
          const files = event.target.files;
          if (files?.length) void handleFiles(Array.from(files));
          event.target.value = "";
        }}
      />

      <header style={{ marginBottom: spacing.scale[6] }}>
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            letterSpacing: typography.letterSpacing.label,
            textTransform: "uppercase",
          }}
        >
          Assistant Activité
        </p>
        <h1
          style={{
            ...typography.sectionTitle.desktop,
            color: colors.text.primary,
            marginTop: spacing.scale[2],
          }}
        >
          Établissons votre activité LMNP
        </h1>
        <p
          className="mt-2"
          style={{ ...typography.body.desktop, color: colors.text.secondary }}
        >
          Exercice {fiscalYear} — quelques questions pour poser les bases de votre dossier.
        </p>
      </header>

      {showIntro ? (
        <div style={{ marginBottom: spacing.scale[5] }}>
          <ActiviteHero year={fiscalYear} onFiles={handleFiles} disabled={busy} />
        </div>
      ) : null}

      {showDocumentFoundLaterLink ? (
        <div className="flex justify-end" style={{ marginBottom: spacing.scale[3] }}>
          <Button variant="ghost" disabled={busy} onClick={openFilePicker}>
            J&apos;ai retrouvé mon extrait INPI
          </Button>
        </div>
      ) : null}

      {uploadError ? (
        <p
          role="alert"
          style={{ ...typography.caption.desktop, color: colors.text.accent, marginBottom: spacing.scale[3] }}
        >
          {uploadError}
        </p>
      ) : null}

      {showAnalyzing ? (
        <ActiviteAiProcessing />
      ) : showAnalysisFailed ? (
        <div className="flex flex-col items-center gap-3">
          <ActiviteInterrupted onResumeAnalysis={() => void runAction({ type: "retry" })} onReplaceDocument={openFilePicker} />
          <Button variant="ghost" disabled={busy} onClick={() => void runAction({ type: "continue_manually" })}>
            Continuer sans document
          </Button>
        </div>
      ) : (
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
            {showIntro ? (
              <div className="flex flex-col gap-2">
                <Button disabled={busy} onClick={() => void runAction({ type: "select_no_document" })} variant="secondary">
                  Je n&apos;ai pas ce document
                </Button>
              </div>
            ) : null}

            {showReview ? (
              <div className="flex flex-col gap-5">
                <ReviewFieldSection
                  label="SIRET"
                  field="siret"
                  value={state.siret}
                  confirmed={Boolean(state.confirmed?.siret)}
                  provenance={state.review?.siretProvenance}
                  conflict={siretConflict}
                  ambiguous={Boolean(state.review?.siretAmbiguous)}
                  candidates={state.review?.siretCandidates.map((c) => ({
                    value: c.siret,
                    label: c.establishmentType ? `${c.siret} — ${c.establishmentType}` : c.siret,
                  }))}
                  draft={reviewSiretDraft}
                  onDraftChange={setReviewSiretDraft}
                  busy={busy}
                  onConfirm={() => void runAction({ type: "confirm_field", field: "siret" })}
                  onCorrect={(value) => void runAction({ type: "correct_field", field: "siret", value })}
                  onResolveConflict={(value) =>
                    void runAction({ type: "resolve_conflict", field: "siret", value })
                  }
                />

                <ReviewFieldSection
                  label="Date de début d'activité"
                  field="dateDebutActivite"
                  inputType="date"
                  value={state.dateDebutActivite}
                  confirmed={Boolean(state.confirmed?.dateDebutActivite)}
                  provenance={state.review?.activityStartDateProvenance}
                  conflict={dateConflict}
                  ambiguous={Boolean(state.review?.datesAmbiguous)}
                  candidates={
                    state.review?.datesAmbiguous
                      ? [
                          state.review.activityStartDateRaw
                            ? { value: state.review.activityStartDateRaw, label: `Début d'activité : ${state.review.activityStartDateRaw}` }
                            : undefined,
                          state.review.immatriculationDateRaw
                            ? { value: state.review.immatriculationDateRaw, label: `Immatriculation : ${state.review.immatriculationDateRaw}` }
                            : undefined,
                        ].filter((entry): entry is { value: string; label: string } => Boolean(entry))
                      : undefined
                  }
                  draft={reviewDateDraft}
                  onDraftChange={setReviewDateDraft}
                  busy={busy}
                  onConfirm={() => void runAction({ type: "confirm_field", field: "dateDebutActivite" })}
                  onCorrect={(value) =>
                    void runAction({ type: "correct_field", field: "dateDebutActivite", value })
                  }
                  onResolveConflict={(value) =>
                    void runAction({ type: "resolve_conflict", field: "dateDebutActivite", value })
                  }
                />

                {/* Profil INPI (jalon préremplissage) — mêmes composant et mécanique de
                    fusion/confirmation que SIRET/date ci-dessus, réutilisés tels quels. */}
                <ReviewFieldSection
                  label="Nom"
                  field="lastName"
                  value={state.lastName}
                  confirmed={Boolean(state.confirmed?.lastName)}
                  provenance={state.review?.lastNameProvenance}
                  conflict={state.conflicts?.lastName}
                  ambiguous={false}
                  draft={reviewLastNameDraft}
                  onDraftChange={setReviewLastNameDraft}
                  busy={busy}
                  onConfirm={() => void runAction({ type: "confirm_field", field: "lastName" })}
                  onCorrect={(value) => void runAction({ type: "correct_field", field: "lastName", value })}
                  onResolveConflict={(value) => void runAction({ type: "resolve_conflict", field: "lastName", value })}
                />

                <ReviewFieldSection
                  label="Prénom"
                  field="firstName"
                  value={state.firstName}
                  confirmed={Boolean(state.confirmed?.firstName)}
                  provenance={state.review?.firstNameProvenance}
                  conflict={state.conflicts?.firstName}
                  ambiguous={false}
                  draft={reviewFirstNameDraft}
                  onDraftChange={setReviewFirstNameDraft}
                  busy={busy}
                  onConfirm={() => void runAction({ type: "confirm_field", field: "firstName" })}
                  onCorrect={(value) => void runAction({ type: "correct_field", field: "firstName", value })}
                  onResolveConflict={(value) => void runAction({ type: "resolve_conflict", field: "firstName", value })}
                />

                <ReviewFieldSection
                  label="Email"
                  field="email"
                  value={state.email}
                  confirmed={Boolean(state.confirmed?.email)}
                  provenance={state.review?.emailProvenance}
                  conflict={state.conflicts?.email}
                  ambiguous={false}
                  draft={reviewEmailDraft}
                  onDraftChange={setReviewEmailDraft}
                  busy={busy}
                  onConfirm={() => void runAction({ type: "confirm_field", field: "email" })}
                  onCorrect={(value) => void runAction({ type: "correct_field", field: "email", value })}
                  onResolveConflict={(value) => void runAction({ type: "resolve_conflict", field: "email", value })}
                />

                <ReviewFieldSection
                  label="Téléphone"
                  field="telephone"
                  value={state.telephone}
                  confirmed={Boolean(state.confirmed?.telephone)}
                  provenance={state.review?.telephoneProvenance}
                  conflict={state.conflicts?.telephone}
                  ambiguous={false}
                  draft={reviewTelephoneDraft}
                  onDraftChange={setReviewTelephoneDraft}
                  busy={busy}
                  onConfirm={() => void runAction({ type: "confirm_field", field: "telephone" })}
                  onCorrect={(value) => void runAction({ type: "correct_field", field: "telephone", value })}
                  onResolveConflict={(value) => void runAction({ type: "resolve_conflict", field: "telephone", value })}
                />

                <ReviewFieldSection
                  label="Adresse personnelle"
                  field="personalAddress"
                  value={state.personalAddress}
                  confirmed={Boolean(state.confirmed?.personalAddress)}
                  provenance={state.review?.personalAddressProvenance}
                  conflict={state.conflicts?.personalAddress}
                  ambiguous={false}
                  draft={reviewPersonalAddressDraft}
                  onDraftChange={setReviewPersonalAddressDraft}
                  busy={busy}
                  onConfirm={() => void runAction({ type: "confirm_field", field: "personalAddress" })}
                  onCorrect={(value) => void runAction({ type: "correct_field", field: "personalAddress", value })}
                  onResolveConflict={(value) => void runAction({ type: "resolve_conflict", field: "personalAddress", value })}
                />

                <ReviewFieldSection
                  label="Adresse de l'établissement"
                  field="establishmentAddress"
                  value={state.establishmentAddress}
                  confirmed={Boolean(state.confirmed?.establishmentAddress)}
                  provenance={state.review?.establishmentAddressProvenance}
                  conflict={state.conflicts?.establishmentAddress}
                  ambiguous={false}
                  draft={reviewEstablishmentAddressDraft}
                  onDraftChange={setReviewEstablishmentAddressDraft}
                  busy={busy}
                  onConfirm={() => void runAction({ type: "confirm_field", field: "establishmentAddress" })}
                  onCorrect={(value) => void runAction({ type: "correct_field", field: "establishmentAddress", value })}
                  onResolveConflict={(value) => void runAction({ type: "resolve_conflict", field: "establishmentAddress", value })}
                />

                <Button
                  disabled={busy || hasAnyConflict}
                  onClick={() => void runAction({ type: "continue_review" })}
                >
                  Continuer
                </Button>
              </div>
            ) : null}

            {showNoDocument ? (
              <div className="flex flex-col gap-3">
                {noDocSiretMode === "choice" ? (
                  <div className="flex flex-col gap-2">
                    <Button disabled={busy} onClick={() => setNoDocSiretMode("entering")}>
                      Oui, je le connais
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void runAction({ type: "submit_siret_known", known: false })}
                    >
                      Non / je ne suis pas sûr
                    </Button>
                  </div>
                ) : (
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runAction({ type: "submit_siret_known", known: true, siret: noDocSiretInput });
                    }}
                  >
                    <FieldLabel>Numéro SIRET</FieldLabel>
                    <FocusableInput
                      value={noDocSiretInput}
                      onChange={(event) => setNoDocSiretInput(event.target.value)}
                      placeholder="14 chiffres"
                      inputMode="numeric"
                    />
                    <Button type="submit" disabled={busy || !noDocSiretInput.trim()}>
                      Continuer
                    </Button>
                  </form>
                )}
              </div>
            ) : null}

            {showManualProfile && manualProfileStage === "profile" ? (
              <ActiviteProfileFields
                values={manualProfileValues}
                onChange={setManualProfileValues}
                onConfirm={() =>
                  void runAction({
                    type: "submit_manual_profile_fields",
                    profile: manualProfileValuesToRecord(manualProfileValues),
                  })
                }
                confirmDisabled={busy}
              />
            ) : null}

            {showManualProfile && manualProfileStage === "date" ? (
              <div className="flex flex-col gap-3">
                <Button variant="ghost" disabled={busy} onClick={() => void runAction({ type: "go_back" })}>
                  ← Précédent
                </Button>
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runAction({ type: "submit_manual_activity_date", dateDebutActivite: manualDateInput });
                  }}
                >
                  <FieldLabel>Date de début d&apos;activité (immatriculation)</FieldLabel>
                  <FocusableInput
                    type="date"
                    value={manualDateInput}
                    onChange={(event) => setManualDateInput(event.target.value)}
                  />
                  <Button type="submit" disabled={busy || !manualDateInput}>
                    Continuer
                  </Button>
                </form>
              </div>
            ) : null}

            {showOrientation ? (
              <div className="flex flex-col gap-2">
                {[
                  { id: "registered_siret" as const, label: "Oui, et j'ai mon SIRET" },
                  { id: "registered_no_siret" as const, label: "Oui, mais je n'ai pas mon SIRET" },
                  { id: "not_sure" as const, label: "Je ne suis pas sûr" },
                  { id: "not_yet" as const, label: "Pas encore déclarée" },
                ].map((option) => (
                  <Button
                    key={option.id}
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      runAction({ type: "select_orientation", orientation: option.id as F009Orientation })
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            ) : null}

            {showSiret ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction({ type: "submit_siret", siret: siretInput });
                }}
              >
                <FocusableInput
                  value={siretInput}
                  onChange={(event) => setSiretInput(event.target.value)}
                  placeholder="14 chiffres"
                  inputMode="numeric"
                />
                <Button type="submit" disabled={busy || !siretInput.trim()}>
                  Vérifier mon SIRET
                </Button>
              </form>
            ) : null}

            {showActivity ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction({
                    type: "submit_activity",
                    dateDebutActivite: dateDebutInput,
                    regimeFiscal: "reel_simplifie",
                  });
                }}
              >
                <FieldLabel>Date de début d&apos;activité (immatriculation)</FieldLabel>
                <FocusableInput
                  type="date"
                  value={dateDebutInput}
                  onChange={(event) => setDateDebutInput(event.target.value)}
                />
                <Button type="submit" disabled={busy || !dateDebutInput}>
                  Continuer
                </Button>
              </form>
            ) : null}

            {showMissingActivityDate ? (
              <div className="flex flex-col gap-5">
                <ReviewFieldSection
                  label="Date de début d'activité"
                  field="dateDebutActivite"
                  inputType="date"
                  value={state.dateDebutActivite}
                  confirmed={Boolean(state.confirmed?.dateDebutActivite)}
                  provenance={state.review?.activityStartDateProvenance}
                  conflict={dateConflict}
                  ambiguous={Boolean(state.review?.datesAmbiguous)}
                  candidates={
                    state.review?.datesAmbiguous
                      ? [
                          state.review.activityStartDateRaw
                            ? { value: state.review.activityStartDateRaw, label: `Début d'activité : ${state.review.activityStartDateRaw}` }
                            : undefined,
                          state.review.immatriculationDateRaw
                            ? { value: state.review.immatriculationDateRaw, label: `Immatriculation : ${state.review.immatriculationDateRaw}` }
                            : undefined,
                        ].filter((entry): entry is { value: string; label: string } => Boolean(entry))
                      : undefined
                  }
                  draft={reviewDateDraft}
                  onDraftChange={setReviewDateDraft}
                  busy={busy}
                  onConfirm={() => void runAction({ type: "confirm_field", field: "dateDebutActivite" })}
                  onCorrect={(value) =>
                    void runAction({ type: "correct_field", field: "dateDebutActivite", value })
                  }
                  onResolveConflict={(value) =>
                    void runAction({ type: "resolve_conflict", field: "dateDebutActivite", value })
                  }
                />
              </div>
            ) : null}

            {showMiseEnService ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction({
                    type: "submit_mise_en_service",
                    dateMiseEnService: dateMiseEnServiceInput,
                  });
                }}
              >
                <FieldLabel>Date de première mise en location</FieldLabel>
                <FocusableInput
                  type="date"
                  value={dateMiseEnServiceInput}
                  onChange={(event) => setDateMiseEnServiceInput(event.target.value)}
                />
                <Button type="submit" disabled={busy || !dateMiseEnServiceInput}>
                  Voir l&apos;impact sur mon exercice
                </Button>
              </form>
            ) : null}

            {showConfirmation ? (
              <div className="flex flex-col gap-2">
                <Button disabled={busy} onClick={() => void runAction({ type: "confirm" })}>
                  Confirmer
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void runAction({ type: "restart" })}
                >
                  Recommencer
                </Button>
              </div>
            ) : null}

            {isComplete ? (
              <div className="flex flex-col gap-2">
                <Button variant="ghost" disabled={busy} onClick={() => void runAction({ type: "go_back" })}>
                  Modifier mes réponses
                </Button>
                <div className="flex gap-2">
                  <Link href={LMNP_ROUTES.logement} className="flex-1">
                    <Button className="w-full">Continuer vers Logement</Button>
                  </Link>
                  <Link href={LMNP_ROUTES.dashboard}>
                    <Button variant="ghost">Retour au tableau de bord</Button>
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}

type ReviewFieldSectionProps = {
  label: string;
  field: F009DocumentFieldKey;
  value?: string;
  confirmed: boolean;
  provenance?: { status: "extracted" | "proposed" | "missing" };
  conflict?: { confirmedValue: string; newValue: string };
  ambiguous: boolean;
  candidates?: { value: string; label: string }[];
  draft: string;
  onDraftChange: (value: string) => void;
  busy: boolean;
  inputType?: "text" | "date";
  onConfirm: () => void;
  onCorrect: (value: string) => void;
  onResolveConflict: (value: string) => void;
};

/** One row of the document review screen (spec §05) — shared by SIRET and date de début d'activité. */
function ReviewFieldSection({
  label,
  value,
  confirmed,
  provenance,
  conflict,
  ambiguous,
  candidates,
  draft,
  onDraftChange,
  busy,
  inputType = "text",
  onConfirm,
  onCorrect,
  onResolveConflict,
}: ReviewFieldSectionProps) {
  const statusLabel = confirmed
    ? "Confirmé"
    : provenance?.status === "extracted"
      ? "Extrait du document INPI"
      : provenance?.status === "proposed"
        ? "À confirmer"
        : "Non trouvé — à compléter";

  return (
    <div data-field-key={label} data-field-status={provenance?.status ?? "unknown"}>
      <FieldLabel>{label}</FieldLabel>
      <p
        style={{
          ...typography.caption.desktop,
          color: confirmed ? colors.success.DEFAULT : colors.text.accent,
          marginTop: spacing.scale[1],
          marginBottom: spacing.scale[2],
        }}
      >
        {statusLabel}
      </p>

      {conflict ? (
        <div className="flex flex-col gap-2">
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Votre document indique « {conflict.newValue} », vous aviez confirmé « {conflict.confirmedValue} ».
            Laquelle conservez-vous ?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => onResolveConflict(conflict.confirmedValue)}>
              Garder « {conflict.confirmedValue} »
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onResolveConflict(conflict.newValue)}
            >
              Utiliser « {conflict.newValue} »
            </Button>
          </div>
        </div>
      ) : ambiguous && candidates && candidates.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Plusieurs valeurs possibles ont été trouvées. Laquelle est correcte ?
          </p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((candidate) => (
              <Button
                key={candidate.value}
                variant="secondary"
                disabled={busy}
                onClick={() => onCorrect(candidate.value)}
              >
                {candidate.label}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <FocusableInput
            type={inputType}
            inputMode={inputType === "text" ? "numeric" : undefined}
            value={draft || value || ""}
            onChange={(event) => onDraftChange(event.target.value)}
            disabled={confirmed}
          />
          <div className="flex gap-2">
            {value && !confirmed ? (
              <Button disabled={busy} onClick={onConfirm}>
                Confirmer
              </Button>
            ) : null}
            {!confirmed ? (
              <Button
                variant="secondary"
                disabled={busy || !draft.trim() || draft === value}
                onClick={() => onCorrect(draft)}
              >
                {value ? "Corriger" : "Renseigner"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
