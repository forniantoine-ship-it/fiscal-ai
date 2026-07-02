"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import {
  F013RevenusAssistant,
  type ContinuiteBail,
  type F013Action,
  type F013Message,
  type F013Result,
  type F013State,
  type ModeCharges,
  type TypeLocation,
} from "@/runtime";

const inputStyle = {
  ...typography.body.desktop,
  padding: spacing.scale[3],
  borderRadius: radius.md,
  border: `1px solid ${colors.border.subtle}`,
  backgroundColor: colors.surface.primary,
  width: "100%",
} as const;

const labelStyle = { ...typography.caption.desktop, color: colors.text.muted } as const;

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function MessageBubble({ message }: { message: F013Message }) {
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
          whiteSpace: "pre-wrap",
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

function SuggestionButton({
  suggestionId,
  label,
  onPick,
}: {
  suggestionId: string;
  label: string;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(suggestionId)}
      style={{
        ...typography.caption.desktop,
        padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
        borderRadius: radius.md,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ResultSummary({ result }: { result: F013Result }) {
  const { recettes } = result;
  return (
    <div
      style={{
        padding: spacing.scale[4],
        borderRadius: radius.lg,
        backgroundColor: colors.surface.inset,
        marginTop: spacing.scale[4],
      }}
    >
      <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>Total recettes</p>
      <p style={{ ...typography.sectionTitle.desktop, color: colors.text.primary }}>
        {fmtEur(recettes.totalRecettes)}
      </p>
      {recettes.revenuTheorique ? (
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Théorique : {fmtEur(recettes.revenuTheorique.montantAttendu)}
        </p>
      ) : null}
    </div>
  );
}

function DiagnosticForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (values: {
    typeLocation: TypeLocation;
    continuiteBail: ContinuiteBail;
    modeCharges: ModeCharges;
  }) => void;
  disabled: boolean;
}) {
  const [typeLocation, setTypeLocation] = useState<TypeLocation>("longue_duree");
  const [continuiteBail, setContinuiteBail] = useState<ContinuiteBail>("un_locataire");
  const [modeCharges, setModeCharges] = useState<ModeCharges>("charges_comprises");

  return (
    <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
      <label style={labelStyle}>
        Type de location
        <select
          style={inputStyle}
          value={typeLocation}
          onChange={(e) => setTypeLocation(e.target.value as TypeLocation)}
        >
          <option value="longue_duree">Longue durée (bail résidentiel)</option>
          <option value="plateforme">Plateforme (Airbnb, Booking…)</option>
          <option value="mixte">Les deux (mixte)</option>
        </select>
      </label>
      <label style={labelStyle}>
        Continuité du bail
        <select
          style={inputStyle}
          value={continuiteBail}
          onChange={(e) => setContinuiteBail(e.target.value as ContinuiteBail)}
        >
          <option value="un_locataire">Un seul locataire sur toute l&apos;année</option>
          <option value="changement_locataire">Changement de locataire</option>
          <option value="vacance">Périodes sans locataire</option>
        </select>
      </label>
      <label style={labelStyle}>
        Loyer
        <select
          style={inputStyle}
          value={modeCharges}
          onChange={(e) => setModeCharges(e.target.value as ModeCharges)}
        >
          <option value="charges_comprises">Charges comprises</option>
          <option value="hors_charges">Hors charges + provisions</option>
          <option value="inconnu">Je ne sais pas</option>
        </select>
      </label>
      <Button disabled={disabled} onClick={() => onSubmit({ typeLocation, continuiteBail, modeCharges })}>
        Continuer
      </Button>
    </div>
  );
}

function AmountForm({
  label,
  onSubmit,
  disabled,
}: {
  label: string;
  onSubmit: (montant: number) => void;
  disabled: boolean;
}) {
  const [amount, setAmount] = useState("");
  const parseAmount = (v: string) => Number(v.replace(",", "."));

  return (
    <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
      <label style={labelStyle}>
        {label}
        <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <Button
        disabled={disabled}
        onClick={() => {
          const montant = parseAmount(amount);
          if (Number.isFinite(montant) && montant >= 0) onSubmit(montant);
        }}
      >
        Valider
      </Button>
    </div>
  );
}

function VacanceForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (dateDebut: string, dateFin: string, enTravaux: boolean) => void;
  disabled: boolean;
}) {
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [enTravaux, setEnTravaux] = useState(false);

  return (
    <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
      <label style={labelStyle}>
        Du
        <input type="date" style={inputStyle} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
      </label>
      <label style={labelStyle}>
        Au
        <input type="date" style={inputStyle} value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
      </label>
      <label className="flex items-center gap-2" style={typography.body.desktop}>
        <input type="checkbox" checked={enTravaux} onChange={(e) => setEnTravaux(e.target.checked)} />
        Le bien était en travaux pendant cette période
      </label>
      <Button
        disabled={disabled || !dateDebut || !dateFin}
        onClick={() => onSubmit(dateDebut, dateFin, enTravaux)}
      >
        Enregistrer la vacance
      </Button>
    </div>
  );
}

export function F013RevenusAssistantPanel() {
  const { workspace, dispatch } = useLmnp();
  const fiscalYear = workspace.fiscalYear.year;
  const draft = workspace.declarationDraft;

  const assistant = useMemo(
    () =>
      new F013RevenusAssistant(
        {
          dossierId: workspace.fiscalYear.id,
          fiscalYear,
          route: "/assistants/revenus",
        },
        {
          dateMiseEnService: draft?.dateMiseEnService,
        },
      ),
    [draft?.dateMiseEnService, fiscalYear, workspace.fiscalYear.id],
  );

  const [state, setState] = useState<F013State>(() => {
    if (draft?.revenusAssistant) {
      return {
        step: "complete",
        collected: { vacancePeriodes: [], periodes: [] },
        fieldSources: draft.revenusAssistant.fieldSources ?? {},
        modeCollecte: false,
        result: {
          recettes: {
            exerciceFiscal: draft.revenusAssistant.exerciceFiscal,
            totalRecettes: draft.revenusAssistant.totalRecettes,
            loyersEncaisses: draft.revenusAssistant.loyersEncaisses,
            indemnitesAssurance: draft.revenusAssistant.indemnitesAssurance,
            recettesPlateforme: draft.revenusAssistant.recettesPlateforme,
            ajustementsJanDec: draft.revenusAssistant.ajustementsJanDec,
            moisLocationEffectifs: draft.revenusAssistant.moisLocationEffectifs,
            lignes: [],
            deltaExplique: 0,
          },
          explanation: "",
          anomalies: [],
        },
      };
    }
    return assistant.start().state;
  });

  const [messages, setMessages] = useState<F013Message[]>(() => {
    if (draft?.revenusAssistant) {
      return [{ role: "assistant", content: "Vos revenus sont déjà enregistrés pour cet exercice." }];
    }
    return assistant.start().messages;
  });

  const [busy, setBusy] = useState(false);

  const persistCompletion = useCallback(
    (finalState: F013State) => {
      const result = finalState.result;
      if (!result) return;

      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          revenusAssistant: {
            exerciceFiscal: result.recettes.exerciceFiscal,
            totalRecettes: result.recettes.totalRecettes,
            loyersEncaisses: result.recettes.loyersEncaisses,
            indemnitesAssurance: result.recettes.indemnitesAssurance,
            recettesPlateforme: result.recettes.recettesPlateforme,
            ajustementsJanDec: result.recettes.ajustementsJanDec,
            moisLocationEffectifs: result.recettes.moisLocationEffectifs,
            revenuTheorique: result.recettes.revenuTheorique?.montantAttendu,
            fieldSources: finalState.fieldSources,
            computedAt: new Date().toISOString(),
          },
          revenusConfirmedAt: new Date().toISOString(),
        },
      });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "revenus-assistant" });
    },
    [dispatch],
  );

  const runAction = useCallback(
    async (action: F013Action) => {
      setBusy(true);
      try {
        const turn = await assistant.handle(state, action);
        setState(turn.state);
        setMessages((prev) => [...prev, ...turn.messages]);
        if (turn.completed) persistCompletion(turn.state);
      } finally {
        setBusy(false);
      }
    },
    [assistant, persistCompletion, state],
  );

  const handleSuggestion = useCallback(
    (suggestionId: string) => {
      if (suggestionId === "confirm_all") void runAction({ type: "confirm_all" });

      const decalageMap: Record<string, { janvierOui: boolean; decembreOui: boolean }> = {
        decalage_non_non: { janvierOui: false, decembreOui: false },
        decalage_oui_non: { janvierOui: true, decembreOui: false },
        decalage_non_oui: { janvierOui: false, decembreOui: true },
        decalage_oui_oui: { janvierOui: true, decembreOui: true },
      };
      if (decalageMap[suggestionId]) {
        void runAction({ type: "submit_decalage", ...decalageMap[suggestionId] });
      }

      const ecartMap: Record<string, F013Action> = {
        ecart_impaye: { type: "submit_ecart_raison", raison: "impaye" },
        ecart_vacance: { type: "submit_ecart_raison", raison: "vacance" },
        ecart_loyer_inferieur: { type: "submit_ecart_raison", raison: "loyer_inferieur" },
        ecart_autre: { type: "submit_ecart_raison", raison: "autre" },
        ecart_rattrapage: { type: "submit_ecart_raison", raison: "rattrapage" },
        ecart_complementaire: { type: "submit_ecart_raison", raison: "complementaire" },
        ecart_erreur: { type: "submit_ecart_raison", raison: "erreur_saisie" },
      };
      if (ecartMap[suggestionId]) void runAction(ecartMap[suggestionId]);

      if (suggestionId === "gli_oui") void runAction({ type: "submit_impaye", gli: true });
      if (suggestionId === "gli_non") void runAction({ type: "submit_impaye", gli: false });
    },
    [runAction],
  );

  const showDiagnostic = state.step === "diagnostic";
  const showLoyer = state.step === "loyer_collect";
  const showDeclaration = state.step === "declaration";
  const showPlateforme = state.step === "sources_plateforme";
  const showVacance = state.step === "ecart_vacance";

  return (
    <div className="mx-auto max-w-2xl">
      <header style={{ marginBottom: spacing.scale[6] }}>
        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          <Link href={LMNP_ROUTES.dashboard} style={{ color: colors.text.muted }}>
            Tableau de bord
          </Link>
          {" / Revenus"}
        </p>
        <h1 style={{ ...typography.sectionTitle.desktop, color: colors.text.primary, marginTop: spacing.scale[2] }}>
          Assistant Revenus
        </h1>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginTop: spacing.scale[2] }}>
          Vérifiez que vos revenus encaissés correspondent à votre bail pour l&apos;exercice {fiscalYear}.
        </p>
      </header>

      <Card>
        <div style={{ padding: spacing.scale[4] }}>
          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))}

          {messages.at(-1)?.suggestions ? (
            <div className="flex flex-wrap gap-2" style={{ marginBottom: spacing.scale[4] }}>
              {messages.at(-1)!.suggestions!.map((s) => (
                <SuggestionButton key={s.id} suggestionId={s.id} label={s.label} onPick={handleSuggestion} />
              ))}
            </div>
          ) : null}

          {showDiagnostic ? (
            <DiagnosticForm
              disabled={busy}
              onSubmit={(values) =>
                void runAction({
                  type: "submit_diagnostic",
                  typeLocation: values.typeLocation,
                  continuiteBail: values.continuiteBail,
                  modeCharges: values.modeCharges,
                })
              }
            />
          ) : null}

          {showLoyer ? (
            <AmountForm
              label="Loyer mensuel inscrit au bail (€)"
              disabled={busy}
              onSubmit={(montant) => void runAction({ type: "submit_loyer", loyerMensuel: montant })}
            />
          ) : null}

          {showDeclaration ? (
            <AmountForm
              label="Montant total encaissé (€)"
              disabled={busy}
              onSubmit={(montant) => void runAction({ type: "submit_declaration", montant })}
            />
          ) : null}

          {showPlateforme ? (
            <AmountForm
              label="Total des virements plateforme (€)"
              disabled={busy}
              onSubmit={(montant) => void runAction({ type: "submit_plateforme", montant })}
            />
          ) : null}

          {showVacance ? (
            <VacanceForm
              disabled={busy}
              onSubmit={(dateDebut, dateFin, enTravaux) =>
                void runAction({ type: "submit_vacance", dateDebut, dateFin, enTravaux })
              }
            />
          ) : null}

          {state.result ? <ResultSummary result={state.result} /> : null}

          {state.step === "complete" ? (
            <div style={{ marginTop: spacing.scale[4] }}>
              <Link href={LMNP_ROUTES.dashboard}>
                <Button variant="secondary">Retour au tableau de bord</Button>
              </Link>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
