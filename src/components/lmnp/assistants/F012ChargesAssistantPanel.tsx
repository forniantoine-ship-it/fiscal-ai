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
  F012ChargesAssistant,
  type CoproLigneInput,
  type F012Action,
  type F012CategoryId,
  type F012Message,
  type F012Result,
  type F012State,
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

function MessageBubble({ message }: { message: F012Message }) {
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

function ResultSummary({ result }: { result: F012Result }) {
  const { charges } = result;
  return (
    <div
      style={{
        padding: spacing.scale[4],
        borderRadius: radius.lg,
        backgroundColor: colors.surface.inset,
        marginTop: spacing.scale[4],
      }}
    >
      <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>Total déductible</p>
      <p style={{ ...typography.sectionTitle.desktop, color: colors.text.primary }}>
        {fmtEur(charges.totalDeductible)}
      </p>
      {charges.totalAmortissable > 0 ? (
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          À amortir : {fmtEur(charges.totalAmortissable)}
        </p>
      ) : null}
      {charges.totalPreExploitation > 0 ? (
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Pré-exploitation (non déductible) : {fmtEur(charges.totalPreExploitation)}
        </p>
      ) : null}
    </div>
  );
}

function ProfilageForm({ onSubmit, disabled }: { onSubmit: (values: Record<string, boolean>) => void; disabled: boolean }) {
  const [copropriete, setCopropriete] = useState(false);
  const [agence, setAgence] = useState(false);
  const [travaux, setTravaux] = useState(false);
  const [vacance, setVacance] = useState(false);
  const [comptable, setComptable] = useState(false);

  return (
    <div className="flex flex-col gap-2" style={{ marginTop: spacing.scale[4] }}>
      {[
        ["copropriete", "Bien en copropriété", copropriete, setCopropriete],
        ["agence", "Géré par une agence", agence, setAgence],
        ["travaux", "Travaux ou réparations cette année", travaux, setTravaux],
        ["vacance", "Périodes de vacance", vacance, setVacance],
        ["comptable", "Expert-comptable ou logiciel", comptable, setComptable],
      ].map(([id, label, value, setter]) => (
        <label key={id as string} className="flex items-center gap-2" style={typography.body.desktop}>
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
          />
          {label as string}
        </label>
      ))}
      <Button
        disabled={disabled}
        onClick={() =>
          onSubmit({ copropriete, agence, travaux, vacance, comptable })
        }
      >
        Construire mon inventaire
      </Button>
    </div>
  );
}

function CategoryForm({
  categoryId,
  onAction,
  disabled,
}: {
  categoryId: F012CategoryId;
  onAction: (action: F012Action) => void;
  disabled: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [provisions, setProvisions] = useState("");
  const [regularisation, setRegularisation] = useState("");
  const [fondsTravaux, setFondsTravaux] = useState("");
  const [grosTravaux, setGrosTravaux] = useState("");
  const [honoraires, setHonoraires] = useState("");
  const [etatLieux, setEtatLieux] = useState("");
  const [travauxDesc, setTravauxDesc] = useState("");
  const [travauxMontant, setTravauxMontant] = useState("");
  const [splitMontant, setSplitMontant] = useState("");
  const [diversDesc, setDiversDesc] = useState("");

  const parseAmount = (v: string) => Number(v.replace(",", "."));

  switch (categoryId) {
    case "taxe_fonciere":
    case "assurance_pno":
    case "assurance_gli":
    case "honoraires_comptable":
    case "frais_bancaires":
      return (
        <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
          <label style={labelStyle}>
            Montant (€)
            <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button
              disabled={disabled}
              onClick={() => {
                const montant = parseAmount(amount);
                if (!Number.isFinite(montant)) return;
                const map: Record<string, F012Action> = {
                  taxe_fonciere: { type: "submit_taxe_fonciere", montant },
                  assurance_pno: { type: "submit_assurance_pno", montant },
                  assurance_gli: { type: "submit_assurance_gli", montant },
                  honoraires_comptable: { type: "submit_comptable", montant },
                  frais_bancaires: { type: "submit_frais_bancaires", montant },
                };
                onAction(map[categoryId]!);
              }}
            >
              Valider
            </Button>
            <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "skip_category" })}>
              Passer
            </Button>
          </div>
        </div>
      );

    case "copropriete":
      return (
        <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
          <label style={labelStyle}>Provisions courantes<input style={inputStyle} value={provisions} onChange={(e) => setProvisions(e.target.value)} /></label>
          <label style={labelStyle}>Régularisation<input style={inputStyle} value={regularisation} onChange={(e) => setRegularisation(e.target.value)} /></label>
          <label style={labelStyle}>Fonds de travaux ALUR<input style={inputStyle} value={fondsTravaux} onChange={(e) => setFondsTravaux(e.target.value)} /></label>
          <label style={labelStyle}>Appel gros travaux (déductible)<input style={inputStyle} value={grosTravaux} onChange={(e) => setGrosTravaux(e.target.value)} /></label>
          <Button
            disabled={disabled}
            onClick={() => {
              const lignes = [
                { type: "provisions" as const, montant: parseAmount(provisions) || 0 },
                { type: "regularisation" as const, montant: parseAmount(regularisation) || 0 },
                { type: "fonds_travaux" as const, montant: parseAmount(fondsTravaux) || 0 },
                {
                  type: "appel_gros_travaux" as const,
                  montant: parseAmount(grosTravaux) || 0,
                  grosTravauxDeductible: true,
                },
              ].filter((l) => l.montant !== 0) satisfies CoproLigneInput[];
              onAction({ type: "submit_copro", lignes });
            }}
          >
            Valider la copropriété
          </Button>
        </div>
      );

    case "honoraires_gestion":
      return (
        <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
          <label style={labelStyle}>Honoraires de gestion<input style={inputStyle} value={honoraires} onChange={(e) => setHonoraires(e.target.value)} /></label>
          <label style={labelStyle}>Frais d&apos;état des lieux<input style={inputStyle} value={etatLieux} onChange={(e) => setEtatLieux(e.target.value)} /></label>
          <Button
            disabled={disabled}
            onClick={() =>
              onAction({
                type: "submit_gestion",
                honorairesGestion: parseAmount(honoraires) || 0,
                fraisEtatDesLieux: parseAmount(etatLieux) || 0,
              })
            }
          >
            Valider
          </Button>
        </div>
      );

    case "travaux":
      return (
        <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
          <label style={labelStyle}>Description<input style={inputStyle} value={travauxDesc} onChange={(e) => setTravauxDesc(e.target.value)} /></label>
          <label style={labelStyle}>Montant<input style={inputStyle} value={travauxMontant} onChange={(e) => setTravauxMontant(e.target.value)} /></label>
          <label style={labelStyle}>Part réparation (si facture mixte)<input style={inputStyle} value={splitMontant} onChange={(e) => setSplitMontant(e.target.value)} placeholder="Laisser vide si non mixte" /></label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={disabled}
              onClick={() => {
                const montant = parseAmount(travauxMontant);
                if (!travauxDesc || !Number.isFinite(montant)) return;
                onAction({ type: "submit_travaux_description", description: travauxDesc, montant });
              }}
            >
              Décrire la dépense
            </Button>
            <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "finish_travaux_category" })}>
              Terminer les travaux
            </Button>
          </div>
        </div>
      );

    case "divers":
      return (
        <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
          <label style={labelStyle}>Description<input style={inputStyle} value={diversDesc} onChange={(e) => setDiversDesc(e.target.value)} /></label>
          <label style={labelStyle}>Montant<input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => onAction({ type: "skip_category" })}
          >
            Continuer
          </Button>
        </div>
      );

    default:
      return null;
  }
}

export function F012ChargesAssistantPanel() {
  const { workspace, dispatch } = useLmnp();
  const fiscalYear = workspace.fiscalYear.year;
  const draft = workspace.declarationDraft;

  const assistant = useMemo(
    () =>
      new F012ChargesAssistant(
        {
          dossierId: workspace.fiscalYear.id,
          fiscalYear,
          route: "/assistants/charges",
        },
        { dateMiseEnService: draft?.dateMiseEnService },
      ),
    [draft?.dateMiseEnService, fiscalYear, workspace.fiscalYear.id],
  );

  const [state, setState] = useState<F012State>(() => {
    if (draft?.chargesAssistant) {
      return {
        step: "complete",
        categoryInventory: [],
        currentCategoryIndex: 0,
        collected: {
          coproLignes: [],
          travaux: [],
          divers: [],
          skippedCategories: [],
        },
        fieldSources: draft.chargesAssistant.fieldSources ?? {},
        result: {
          charges: {
            exerciceFiscal: draft.chargesAssistant.exerciceFiscal,
            lignes: [],
            parCategorie: draft.chargesAssistant.parCategorie,
            totalDeductible: draft.chargesAssistant.totalDeductible,
            totalNonDeductible: draft.chargesAssistant.totalNonDeductible,
            totalAmortissable: draft.chargesAssistant.totalAmortissable,
            totalPreExploitation: draft.chargesAssistant.totalPreExploitation,
            composantsNouveaux: draft.chargesAssistant.composantsNouveaux,
          },
          explanation: "",
          immobilisationNotes: [],
          anomalies: [],
          composantsNouveaux: draft.chargesAssistant.composantsNouveaux,
        },
      };
    }
    return assistant.start().state;
  });

  const [messages, setMessages] = useState<F012Message[]>(() => {
    if (draft?.chargesAssistant) {
      return [{ role: "assistant", content: "Vos charges sont déjà enregistrées pour cet exercice." }];
    }
    return assistant.start().messages;
  });

  const [busy, setBusy] = useState(false);

  const persistCompletion = useCallback(
    (finalState: F012State) => {
      const result = finalState.result;
      if (!result) return;

      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          chargesAssistant: {
            exerciceFiscal: result.charges.exerciceFiscal,
            totalDeductible: result.charges.totalDeductible,
            totalNonDeductible: result.charges.totalNonDeductible,
            totalAmortissable: result.charges.totalAmortissable,
            totalPreExploitation: result.charges.totalPreExploitation,
            parCategorie: result.charges.parCategorie,
            composantsNouveaux: result.charges.composantsNouveaux,
            fieldSources: finalState.fieldSources,
            computedAt: new Date().toISOString(),
          },
          chargesConfirmedAt: new Date().toISOString(),
        },
      });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "charges-assistant" });
    },
    [dispatch],
  );

  const runAction = useCallback(
    async (action: F012Action) => {
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
      if (suggestionId === "skip_category") void runAction({ type: "skip_category" });
      if (suggestionId === "finish_travaux") void runAction({ type: "finish_travaux_category" });
      if (suggestionId === "start_travaux") void runAction({ type: "start_travaux" });
      if (suggestionId === "completeness_no") void runAction({ type: "confirm_completeness", hasOther: false });
      if (suggestionId === "completeness_yes") void runAction({ type: "confirm_completeness", hasOther: true });
      if (
        suggestionId === "reparation_identique" ||
        suggestionId === "amelioration" ||
        suggestionId === "mixte" ||
        suggestionId === "incertain"
      ) {
        void runAction({
          type: "submit_travaux_qualification",
          choix: suggestionId,
        });
      }
    },
    [runAction],
  );

  const currentCategory = state.categoryInventory[state.currentCategoryIndex];
  const showProfilage = state.step === "profilage";
  const showCategory = state.step === "category_collect" && currentCategory;
  const travauxSplit = state.travauxSubStep === "split";

  return (
    <div className="mx-auto max-w-2xl">
      <header style={{ marginBottom: spacing.scale[6] }}>
        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          <Link href={LMNP_ROUTES.dashboard} style={{ color: colors.text.muted }}>
            Tableau de bord
          </Link>
          {" / Charges"}
        </p>
        <h1 style={{ ...typography.sectionTitle.desktop, color: colors.text.primary, marginTop: spacing.scale[2] }}>
          Assistant Charges
        </h1>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginTop: spacing.scale[2] }}>
          Qualifiez et totalisez vos charges déductibles pour l&apos;exercice {fiscalYear}.
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

          {showProfilage ? (
            <ProfilageForm
              disabled={busy}
              onSubmit={(values) =>
                void runAction({
                  type: "submit_profilage",
                  copropriete: values.copropriete ?? false,
                  agence: values.agence ?? false,
                  travaux: values.travaux ?? false,
                  vacance: values.vacance ?? false,
                  comptable: values.comptable ?? false,
                })
              }
            />
          ) : null}

          {showCategory ? (
            <CategoryForm categoryId={currentCategory} disabled={busy} onAction={(action) => void runAction(action)} />
          ) : null}

          {travauxSplit ? (
            <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
              <label style={labelStyle}>
                Part remise en état (€)
                <input
                  style={inputStyle}
                  id="split-montant"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const value = Number((e.target as HTMLInputElement).value);
                      if (Number.isFinite(value)) {
                        void runAction({ type: "submit_travaux_split", montantReparation: value });
                      }
                    }
                  }}
                />
              </label>
            </div>
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
