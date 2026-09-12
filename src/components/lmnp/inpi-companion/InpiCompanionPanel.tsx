"use client";

/**
 * Compagnon INPI — Phase 4.3. Couche distincte de F009 (collecte/validation
 * de l'activité) : accompagne la préparation et la démarche INPI, monté à
 * côté de `F009ActiviteAssistantPanel` sur la page Activité, sans jamais le
 * modifier ni partager son état interne.
 *
 * Aucune iframe, aucun scraping, aucune synchronisation fictive avec l'INPI
 * — le site officiel reste le seul lieu où la formalité est réellement
 * effectuée. Ce composant ne fait que lire des sources déjà existantes
 * (`DeclarationDraft`, le miroir `dossierInpiStatus` de `useLmnp()`) et
 * persister UNIQUEMENT la progression du Compagnon
 * (`DeclarationDraft.inpiCompanionState`) — jamais une donnée métier.
 */

import { useCallback, useMemo, useReducer, useState, type ReactNode } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { TextArea } from "@/design-system/components/Input";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { useLmnp } from "@/lib/lmnp/store";
import type { InpiStatus } from "@/lib/lmnp/types/dossier";
import { supabase } from "@/lib/supabase";
import { validateSiret } from "@/runtime";
import type {
  InpiCompanionFieldKey,
  InpiCompanionMode,
  InpiCompanionPersistedState,
  InpiCompanionStep,
} from "@/runtime/assistants/inpi-companion/types";

import { InpiCompanionChat } from "./InpiCompanionChat";
import { buildInpiCompanionChatContext, type InpiCompanionChatContext } from "./inpi-companion-chat-context";
import { INPI_COMPANION_CHAT_LLM_ROUTE } from "./inpi-companion-chat-llm";
import {
  canSubmitRegularizationMessage,
  clipRegularizationMessage,
  INITIAL_REGULARISATION_UI,
  reduceRegularisationUi,
  REGULARISATION_COPY,
  REGULARIZATION_MESSAGE_MAX,
  regularisationCounterLabel,
  regularisationResultSections,
  type RegularisationAnalysisDisplay,
} from "./inpi-companion-regularisation-ui";
import {
  computeInpiCompanionView,
  displayValueForField,
  restartInpiCompanionState,
  shouldShowReturnBanner,
  withConflictResolved,
  withFieldConfirmed,
  withOfficialSiteOpened,
  withPreparationCompleted,
  withReturnBannerDismissed,
} from "./inpi-companion-view-model";

const OFFICIAL_INPI_URL = "https://formalites.entreprises.gouv.fr";

function openOfficialInpiSite(): void {
  window.open(OFFICIAL_INPI_URL, "_blank", "noopener,noreferrer");
}

const FIELD_LABELS: Record<InpiCompanionFieldKey, string> = {
  identite: "Votre identité",
  activite: "Nature de l'activité",
  date_debut: "Date de début d'activité",
  etablissement: "Adresse de l'établissement",
  siren_siret: "SIREN / SIRET",
  regime: "Régime fiscal",
  domiciliation: "Domiciliation de l'entreprise",
  documents: "Documents à prévoir",
};

const FIELD_EXPLANATIONS: Record<InpiCompanionFieldKey, string> = {
  identite: "L'INPI vous demandera de confirmer votre identité en tant qu'exploitant.",
  activite: "D'après votre dossier, nous pensons que votre activité correspond à de la location meublée. Vérifiez que cela correspond bien à votre situation.",
  date_debut: "C'est la date d'immatriculation, distincte de la date de première mise en location.",
  etablissement: "L'adresse de l'établissement INPI n'est pas toujours la même que l'adresse du bien loué.",
  siren_siret: "Cette valeur provient d'un document ou d'une saisie précédente — elle n'est pas vérifiée en direct auprès de l'INPI.",
  regime: "Fiscal AI accompagne uniquement le régime réel simplifié.",
  domiciliation: "Le choix de l'adresse de domiciliation de votre entreprise vous appartient — nous ne pouvons pas le déterminer à votre place.",
  documents: "Voici ce que nous savons déjà de votre dossier documentaire.",
};

function isConfirmableField(step: InpiCompanionStep): step is InpiCompanionFieldKey {
  return step !== "synthese";
}

type RegularisationWhitelistedContext = InpiCompanionChatContext;

function readRegularizationAnalysis(payload: unknown): RegularisationAnalysisDisplay | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "summary" && key !== "points" && key !== "uncertainty")) {
    return null;
  }
  if (typeof record.summary !== "string" || !record.summary.trim()) return null;
  if (!Array.isArray(record.points) || record.points.length > 8) return null;
  if (record.points.some((point) => typeof point !== "string" || !point.trim())) return null;
  const analysis: RegularisationAnalysisDisplay = {
    summary: record.summary.trim(),
    points: record.points.map((point) => (point as string).trim()),
  };
  if (record.uncertainty === null || record.uncertainty === undefined) {
    return analysis;
  }
  if (typeof record.uncertainty !== "string" || !record.uncertainty.trim()) return null;
  analysis.uncertainty = record.uncertainty.trim();
  return analysis;
}

function ProvenanceBadge({ status }: { status: "extracted" | "proposed" | "missing" }) {
  const tone =
    status === "extracted" ? colors.success : status === "proposed" ? colors.warning : colors.error;
  const label = status === "extracted" ? "🟢 Déjà confirmé" : status === "proposed" ? "🟠 À confirmer" : "🔴 À décider";
  return (
    <span
      style={{
        ...typography.caption.desktop,
        display: "inline-block",
        color: tone.DEFAULT,
        backgroundColor: tone.light,
        border: `1px solid ${tone.border}`,
        borderRadius: radius.full,
        padding: `${spacing.scale[1]} ${spacing.scale[3]}`,
      }}
    >
      {label}
    </span>
  );
}

function PanelHeading({ children }: { children: ReactNode }) {
  return (
    <h2 style={{ ...typography.cardTitle.desktop, color: colors.text.primary, marginBottom: spacing.scale[2] }}>
      {children}
    </h2>
  );
}

function PanelBody({ children }: { children: ReactNode }) {
  return (
    <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginBottom: spacing.scale[4] }}>
      {children}
    </p>
  );
}

export function InpiCompanionPanel() {
  const { workspace, dispatch, dossierInpiStatus, updateInpiStatus, inpiStatusUpdating } = useLmnp();
  const draft = workspace.declarationDraft;
  const companionState = draft?.inpiCompanionState;

  const [dismissedForNow, setDismissedForNow] = useState(false);
  const [siretInput, setSiretInput] = useState("");
  const [siretError, setSiretError] = useState<string | undefined>(undefined);
  const [regularizationMessage, setRegularizationMessage] = useState("");

  const view = useMemo(
    () =>
      computeInpiCompanionView({
        draft,
        properties: workspace.properties,
        dossierInpiStatus: dossierInpiStatus?.status,
        companionState,
      }),
    [draft, workspace.properties, dossierInpiStatus?.status, companionState],
  );

  // Phase 4.5.1/4.5.2 — contexte de chat, dérivé des mêmes sources, jamais
  // recalculé indépendamment. Ne sert qu'à l'aide contextuelle (lecture
  // seule) — aucune donnée métier n'est modifiée via ce chemin.
  const chatContext = useMemo(
    () =>
      buildInpiCompanionChatContext({
        draft,
        properties: workspace.properties,
        dossierInpiStatus: dossierInpiStatus?.status,
      }),
    [draft, workspace.properties, dossierInpiStatus?.status],
  );

  const persist = useCallback(
    (next: InpiCompanionPersistedState) => {
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { inpiCompanionState: next } });
    },
    [dispatch],
  );

  const declareStatus = useCallback(
    (status: InpiStatus) => {
      void updateInpiStatus(status, "declared");
    },
    [updateInpiStatus],
  );

  const confirmCurrentField = useCallback(() => {
    const step = view.stepDecision?.step;
    if (!step || !isConfirmableField(step)) return;
    persist(withFieldConfirmed(companionState, view.modeDecision.mode, step, step));
  }, [companionState, persist, view.modeDecision.mode, view.stepDecision?.step]);

  const resolveConflict = useCallback(
    (field: InpiCompanionFieldKey) => {
      if (!companionState) return;
      persist(withConflictResolved(companionState, field));
    },
    [companionState, persist],
  );

  const openInpiAndRecordDeparture = useCallback(() => {
    openOfficialInpiSite();
    persist(withOfficialSiteOpened(companionState, view.modeDecision.mode, view.modeDecision.step));
  }, [companionState, persist, view.modeDecision.mode, view.modeDecision.step]);

  const dismissReturnBanner = useCallback(() => {
    if (!companionState) return;
    persist(withReturnBannerDismissed(companionState));
  }, [companionState, persist]);

  const confirmSiret = useCallback(() => {
    const result = validateSiret({ siret: siretInput });
    if (!result.valid || !result.normalized) {
      setSiretError(result.error ?? "Ce numéro ne semble pas valide.");
      return;
    }
    setSiretError(undefined);
    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: { siret: result.normalized, siren: result.normalized.slice(0, 9) },
    });
    void updateInpiStatus("registered", "declared");
    if (companionState) dismissReturnBanner();
  }, [companionState, dismissReturnBanner, dispatch, siretInput, updateInpiStatus]);

  const showReturnBanner = shouldShowReturnBanner(companionState, dossierInpiStatus?.updatedAt);

  if (dismissedForNow) {
    return (
      <Card variant="muted" className="mx-auto max-w-2xl mt-6">
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Votre démarche INPI reste accessible ici quand vous serez prêt.
        </p>
        <div style={{ marginTop: spacing.scale[3] }}>
          <Button variant="ghost" onClick={() => setDismissedForNow(false)}>
            Reprendre le Compagnon INPI
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl mt-6 flex flex-col gap-3" style={{ gap: spacing.scale[3] }}>
      {showReturnBanner ? (
        <Card
          style={{ backgroundColor: colors.warning.surface, border: `1px solid ${colors.warning.border}` }}
        >
          <PanelHeading>Vous êtes revenu de l&apos;INPI</PanelHeading>
          <PanelBody>Si vous avez avancé votre démarche, indiquez-nous simplement où vous en êtes.</PanelBody>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => { declareStatus("submitted"); dismissReturnBanner(); }}>
              J&apos;ai envoyé ma démarche
            </Button>
            <Button variant="secondary" onClick={() => { declareStatus("regularization_required"); dismissReturnBanner(); }}>
              L&apos;INPI m&apos;a demandé une correction
            </Button>
            <Button variant="ghost" onClick={dismissReturnBanner}>
              Je ne l&apos;ai pas terminée
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        {view.modeDecision.mode === "diagnostic" ? (
          <DiagnosticView onDeclare={declareStatus} busy={inpiStatusUpdating} />
        ) : null}

        {(view.modeDecision.mode === "creation" || view.modeDecision.mode === "poursuite") &&
        view.stepDecision ? (
          <CreationPoursuiteView
            mode={view.modeDecision.mode}
            companionState={companionState}
            stepDecision={view.stepDecision}
            draft={draft}
            onStartPreparation={() => {
              if (!dossierInpiStatus?.status || dossierInpiStatus.status === "not_started") {
                declareStatus("preparing");
              }
            }}
            onLater={() => setDismissedForNow(true)}
            onRestart={() => persist(restartInpiCompanionState(view.modeDecision.mode))}
            onConfirmField={confirmCurrentField}
            onResolveConflict={resolveConflict}
            onOpenInpi={openInpiAndRecordDeparture}
            onReachSynthese={() => companionState && persist(withPreparationCompleted(companionState))}
          />
        ) : null}

        {view.modeDecision.mode === "attente" ? (
          <AttenteView
            siretInput={siretInput}
            siretError={siretError}
            onSiretChange={(value) => { setSiretInput(value); setSiretError(undefined); }}
            onConfirmSiret={confirmSiret}
            busy={inpiStatusUpdating}
          />
        ) : null}

        {view.modeDecision.mode === "regularisation" ? (
          <RegularisationView
            message={regularizationMessage}
            onChange={setRegularizationMessage}
            context={chatContext}
          />
        ) : null}

        {view.modeDecision.mode === "verification" ? (
          <VerificationView
            draft={draft}
            busy={inpiStatusUpdating}
            onSignalModification={() => declareStatus("modification_in_progress")}
          />
        ) : null}
      </Card>

      <InpiCompanionChat context={chatContext} />
    </div>
  );
}

// ─── Sous-vues par mode ────────────────────────────────────────────────────

function DiagnosticView({
  onDeclare,
  busy,
}: {
  onDeclare: (status: InpiStatus) => void;
  busy: boolean;
}) {
  return (
    <>
      <PanelHeading>Votre démarche INPI</PanelHeading>
      <PanelBody>
        Votre activité de location meublée doit être enregistrée auprès du Guichet unique des entreprises.
        Où en êtes-vous ?
      </PanelBody>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => onDeclare("not_started")}>
          Je n&apos;ai pas encore fait la démarche
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onDeclare("in_progress")}>
          J&apos;ai déjà commencé
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onDeclare("submitted")}>
          J&apos;ai déjà envoyé ma démarche
        </Button>
        <Button variant="ghost" disabled={busy}>
          Je ne sais pas où j&apos;en suis
        </Button>
      </div>
    </>
  );
}

function CreationPoursuiteView({
  mode,
  companionState,
  stepDecision,
  draft,
  onStartPreparation,
  onLater,
  onRestart,
  onConfirmField,
  onResolveConflict,
  onOpenInpi,
  onReachSynthese,
}: {
  mode: InpiCompanionMode;
  companionState: InpiCompanionPersistedState | undefined;
  stepDecision: NonNullable<ReturnType<typeof computeInpiCompanionView>["stepDecision"]>;
  draft: ReturnType<typeof useLmnp>["workspace"]["declarationDraft"];
  onStartPreparation: () => void;
  onLater: () => void;
  onRestart: () => void;
  onConfirmField: () => void;
  onResolveConflict: (field: InpiCompanionFieldKey) => void;
  onOpenInpi: () => void;
  onReachSynthese: () => void;
}) {
  const hasStarted = Boolean(companionState);

  if (!hasStarted && mode === "creation") {
    return (
      <>
        <PanelHeading>Votre démarche INPI</PanelHeading>
        <PanelBody>
          Votre dossier fiscal est déjà bien renseigné. Nous allons utiliser les informations que vous avez
          fournies pour préparer votre démarche INPI.
        </PanelBody>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={onStartPreparation}>Préparer ma démarche INPI</Button>
          <Button variant="ghost" onClick={onLater}>
            Je le ferai plus tard
          </Button>
        </div>
      </>
    );
  }

  if (mode === "poursuite" && companionState?.progressStatus !== "active") {
    return (
      <>
        <PanelHeading>Votre démarche INPI est déjà commencée</PanelHeading>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={onStartPreparation}>Reprendre mon accompagnement</Button>
          <Button variant="ghost" onClick={onRestart}>
            Recommencer la préparation
          </Button>
        </div>
      </>
    );
  }

  if (stepDecision.step === "synthese") {
    return <SyntheseView draft={draft} onOpenInpi={onOpenInpi} onReached={onReachSynthese} />;
  }

  const conflict = companionState?.conflicts[stepDecision.step as InpiCompanionFieldKey];
  if (conflict) {
    return (
      <ConflictView
        field={stepDecision.step as InpiCompanionFieldKey}
        conflict={conflict}
        onResolve={onResolveConflict}
      />
    );
  }

  const step = stepDecision.step as InpiCompanionFieldKey;
  const value = displayValueForField(step, draft);

  if (step === "domiciliation") {
    return (
      <FieldShell step={step} status={stepDecision.status}>
        <PanelBody>
          L&apos;INPI vous demandera l&apos;adresse de domiciliation de votre entreprise. Ce choix vous
          appartient entièrement — nous ne pouvons pas le déterminer à votre place.
        </PanelBody>
        <Button onClick={onConfirmField}>J&apos;ai compris, je le renseignerai sur le Guichet unique</Button>
      </FieldShell>
    );
  }

  return (
    <FieldShell step={step} status={stepDecision.status}>
      {stepDecision.multiPropertyCaution ? (
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.warning.DEFAULT,
            backgroundColor: colors.warning.surface,
            border: `1px solid ${colors.warning.border}`,
            borderRadius: radius.md,
            padding: spacing.scale[3],
            marginBottom: spacing.scale[3],
          }}
        >
          Vous avez plusieurs biens dans votre dossier. Nous ne pouvons pas déterminer automatiquement quel
          établissement correspond à votre démarche INPI — vérifiez cette correspondance vous-même.
        </p>
      ) : null}
      {value ? (
        <p style={{ ...typography.cardTitle.desktop, color: colors.text.primary, marginBottom: spacing.scale[2] }}>
          {value}
        </p>
      ) : (
        <PanelBody>Cette information n&apos;est pas encore disponible dans votre dossier.</PanelBody>
      )}
      <p style={{ ...typography.caption.desktop, color: colors.text.tertiary, marginBottom: spacing.scale[3] }}>
        {FIELD_EXPLANATIONS[step]}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={onConfirmField}>Confirmer et continuer</Button>
        <Button variant="ghost" onClick={onLater}>
          Je le ferai plus tard
        </Button>
      </div>
    </FieldShell>
  );
}

function FieldShell({
  step,
  status,
  children,
}: {
  step: InpiCompanionFieldKey;
  status: "extracted" | "proposed" | "missing";
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between" style={{ marginBottom: spacing.scale[2] }}>
        <PanelHeading>{FIELD_LABELS[step]}</PanelHeading>
        <ProvenanceBadge status={status} />
      </div>
      {children}
    </>
  );
}

function ConflictView({
  field,
  conflict,
  onResolve,
}: {
  field: InpiCompanionFieldKey;
  conflict: { previousValue: string; newValue: string };
  onResolve: (field: InpiCompanionFieldKey) => void;
}) {
  return (
    <>
      <PanelHeading>Deux informations différentes ont été trouvées</PanelHeading>
      <PanelBody>Pour « {FIELD_LABELS[field]} », laquelle devons-nous retenir ?</PanelBody>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.scale[2], marginBottom: spacing.scale[3] }}>
        <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
          Dans votre dossier : <strong>{conflict.previousValue}</strong>
        </p>
        <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
          Dans le document : <strong>{conflict.newValue}</strong>
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => onResolve(field)}>Utiliser la valeur du dossier</Button>
        <Button variant="secondary" onClick={() => onResolve(field)}>
          Utiliser la valeur du document
        </Button>
        <Button variant="ghost">Je ne sais pas</Button>
      </div>
    </>
  );
}

function SyntheseView({
  draft,
  onOpenInpi,
  onReached,
}: {
  draft: ReturnType<typeof useLmnp>["workspace"]["declarationDraft"];
  onOpenInpi: () => void;
  onReached: () => void;
}) {
  useMemo(() => {
    onReached();
    return null;
    // Marque la préparation comme terminée dès l'affichage de la synthèse —
    // volontairement dans useMemo (exécution une seule fois par montage de
    // cette vue) plutôt qu'un useEffect, pour rester cohérent avec le style
    // du fichier ; aucune conséquence sur le rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: Array<[string, string | undefined]> = [
    ["Forme", "Entreprise individuelle"],
    ["Activité", displayValueForField("activite", draft)],
    ["Début d'activité", displayValueForField("date_debut", draft)],
    ["Établissement", displayValueForField("etablissement", draft)],
    ["Régime fiscal", displayValueForField("regime", draft)],
  ];

  return (
    <>
      <PanelHeading>Votre préparation est terminée</PanelHeading>
      <PanelBody>
        Vous allez maintenant vérifier et déposer officiellement votre démarche sur le site de l&apos;INPI.
      </PanelBody>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.scale[2], marginBottom: spacing.scale[4] }}>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <span style={{ ...typography.caption.desktop, color: colors.text.tertiary }}>{label}</span>
            <span style={{ ...typography.body.desktop, color: colors.text.primary }}>{value ?? "—"}</span>
          </div>
        ))}
      </div>
      <Button onClick={onOpenInpi}>Ouvrir le Guichet unique</Button>
    </>
  );
}

function AttenteView({
  siretInput,
  siretError,
  onSiretChange,
  onConfirmSiret,
  busy,
}: {
  siretInput: string;
  siretError: string | undefined;
  onSiretChange: (value: string) => void;
  onConfirmSiret: () => void;
  busy: boolean;
}) {
  return (
    <>
      <PanelHeading>Votre démarche INPI a été envoyée</PanelHeading>
      <PanelBody>
        Il reste à attendre son traitement ou votre numéro d&apos;identification. Nous ne pouvons pas connaître
        le délai, ni prétendre que l&apos;INPI a déjà accepté la formalité.
      </PanelBody>
      <div className="flex flex-col gap-2 sm:flex-row" style={{ alignItems: "center" }}>
        <input
          type="text"
          value={siretInput}
          onChange={(event) => onSiretChange(event.target.value)}
          placeholder="Votre SIRET"
          style={{
            ...typography.body.desktop,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.md,
            padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
          }}
        />
        <Button disabled={busy || siretInput.length === 0} onClick={onConfirmSiret}>
          J&apos;ai reçu mon SIREN / SIRET
        </Button>
      </div>
      {siretError ? (
        <p style={{ ...typography.caption.desktop, color: colors.error.DEFAULT, marginTop: spacing.scale[2] }}>
          {siretError}
        </p>
      ) : null}
    </>
  );
}

function RegularisationView({
  message,
  onChange,
  context,
}: {
  message: string;
  onChange: (value: string) => void;
  context: RegularisationWhitelistedContext;
}) {
  const [ui, applyUi] = useReducer(reduceRegularisationUi, INITIAL_REGULARISATION_UI);
  const canAnalyze = canSubmitRegularizationMessage(message);
  const analyzing = ui.phase === "analyzing";
  const showComposer = ui.phase === "compose" || ui.phase === "analyzing";
  const sections = ui.analysis ? regularisationResultSections(ui.analysis) : null;

  const runAnalysis = useCallback(async () => {
    applyUi({ type: "analyze", message });
    if (!canSubmitRegularizationMessage(message)) return;
    applyUi({ type: "analysis_started" });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      if (!authToken) {
        applyUi({ type: "analysis_failed" });
        return;
      }
      const response = await fetch(INPI_COMPANION_CHAT_LLM_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "regularization_analysis",
          message,
          context,
          authToken,
        }),
      });
      if (!response.ok) {
        applyUi({ type: "analysis_failed" });
        return;
      }
      const payload: unknown = await response.json();
      const analysis = readRegularizationAnalysis(payload);
      if (!analysis) {
        applyUi({ type: "analysis_failed" });
        return;
      }
      applyUi({ type: "analysis_succeeded", analysis });
    } catch {
      applyUi({ type: "analysis_failed" });
    }
  }, [context, message]);

  return (
    <>
      <PanelHeading>{REGULARISATION_COPY.heading}</PanelHeading>
      <PanelBody>{REGULARISATION_COPY.intro}</PanelBody>

      {showComposer ? (
        <div style={{ minWidth: 0, maxWidth: "100%" }}>
          <label
            htmlFor="inpi-regularisation-message"
            style={{ ...typography.caption.desktop, color: colors.text.tertiary, display: "block", marginBottom: spacing.scale[2] }}
          >
            {REGULARISATION_COPY.textareaLabel}
          </label>
          <TextArea
            id="inpi-regularisation-message"
            aria-label={REGULARISATION_COPY.textareaLabel}
            aria-invalid={Boolean(ui.validationError)}
            aria-describedby="inpi-regularisation-counter inpi-regularisation-empty"
            value={message}
            maxLength={REGULARIZATION_MESSAGE_MAX}
            readOnly={analyzing}
            rows={4}
            placeholder={REGULARISATION_COPY.placeholder}
            onChange={(event) => onChange(clipRegularizationMessage(event.target.value))}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
          />
          <p
            id="inpi-regularisation-counter"
            style={{ ...typography.caption.desktop, color: colors.text.tertiary, marginTop: spacing.scale[2] }}
          >
            {regularisationCounterLabel(message)}
          </p>
          {ui.validationError ? (
            <p
              id="inpi-regularisation-empty"
              role="alert"
              style={{ ...typography.caption.desktop, color: colors.error.DEFAULT, marginTop: spacing.scale[2] }}
            >
              {ui.validationError}
            </p>
          ) : (
            <span id="inpi-regularisation-empty" hidden />
          )}
        </div>
      ) : null}

      {ui.phase === "analyzing" ? (
        <p role="status" aria-live="polite" style={{ ...typography.body.desktop, color: colors.text.secondary, marginTop: spacing.scale[3] }}>
          {REGULARISATION_COPY.analyzing}
        </p>
      ) : null}

      {ui.phase === "result" && sections ? (
        <div style={{ minWidth: 0, maxWidth: "100%", marginTop: spacing.scale[2] }}>
          <p style={{ ...typography.caption.desktop, color: colors.text.tertiary, marginBottom: spacing.scale[3] }}>
            {REGULARISATION_COPY.textareaLabel}
          </p>
          <h3 style={{ ...typography.cardTitle.desktop, color: colors.text.primary, marginBottom: spacing.scale[2] }}>
            {REGULARISATION_COPY.summaryTitle}
          </h3>
          <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginBottom: spacing.scale[4] }}>
            {sections.summary}
          </p>
          {sections.points ? (
            <>
              <h3 style={{ ...typography.cardTitle.desktop, color: colors.text.primary, marginBottom: spacing.scale[2] }}>
                {REGULARISATION_COPY.pointsTitle}
              </h3>
              <ul style={{ ...typography.body.desktop, color: colors.text.secondary, marginBottom: spacing.scale[4], paddingLeft: spacing.scale[5] }}>
                {sections.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </>
          ) : null}
          {sections.uncertainty ? (
            <>
              <h3 style={{ ...typography.cardTitle.desktop, color: colors.text.primary, marginBottom: spacing.scale[2] }}>
                {REGULARISATION_COPY.uncertaintyTitle}
              </h3>
              <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginBottom: spacing.scale[4] }}>
                {sections.uncertainty}
              </p>
            </>
          ) : null}
          <p style={{ ...typography.caption.desktop, color: colors.text.tertiary, marginBottom: spacing.scale[4] }}>
            {REGULARISATION_COPY.reminder}
          </p>
        </div>
      ) : null}

      {ui.phase === "error" ? (
        <p role="alert" style={{ ...typography.body.desktop, color: colors.text.secondary, marginBottom: spacing.scale[4] }}>
          {REGULARISATION_COPY.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row" style={{ marginTop: spacing.scale[3], minWidth: 0, maxWidth: "100%" }}>
        {ui.phase === "compose" || ui.phase === "analyzing" ? (
          <>
            <Button
              disabled={!canAnalyze || analyzing}
              aria-busy={analyzing}
              onClick={() => {
                void runAnalysis();
              }}
            >
              {REGULARISATION_COPY.analyze}
            </Button>
            <Button
              variant="ghost"
              disabled={analyzing}
              onClick={() => {
                applyUi({ type: "cancel" });
                onChange("");
              }}
            >
              {REGULARISATION_COPY.cancel}
            </Button>
          </>
        ) : null}
        {ui.phase === "result" ? (
          <Button variant="ghost" onClick={() => applyUi({ type: "edit" })}>
            {REGULARISATION_COPY.edit}
          </Button>
        ) : null}
        {ui.phase === "error" ? (
          <>
            <Button onClick={() => { void runAnalysis(); }}>{REGULARISATION_COPY.retry}</Button>
            <Button variant="ghost" onClick={() => applyUi({ type: "edit" })}>
              {REGULARISATION_COPY.edit}
            </Button>
          </>
        ) : null}
      </div>
    </>
  );
}

function VerificationView({
  draft,
  busy,
  onSignalModification,
}: {
  draft: ReturnType<typeof useLmnp>["workspace"]["declarationDraft"];
  busy: boolean;
  onSignalModification: () => void;
}) {
  return (
    <>
      <PanelHeading>Votre activité est déjà enregistrée</PanelHeading>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.scale[2], marginBottom: spacing.scale[4] }}>
        <div className="flex items-center justify-between">
          <span style={{ ...typography.caption.desktop, color: colors.text.tertiary }}>SIREN / SIRET</span>
          <span style={{ ...typography.body.desktop, color: colors.text.primary }}>{draft?.siret ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ ...typography.caption.desktop, color: colors.text.tertiary }}>Établissement</span>
          <span style={{ ...typography.body.desktop, color: colors.text.primary }}>
            {displayValueForField("etablissement", draft) ?? "—"}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="ghost" disabled={busy} onClick={onSignalModification}>
          Signaler une modification
        </Button>
      </div>
    </>
  );
}
