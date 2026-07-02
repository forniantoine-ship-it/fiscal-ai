"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { extractActeForF010 } from "@/lib/lmnp/services/f010/extract-acte-client";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import {
  F010LogementAssistant,
  suggestFrais,
  suggestRatioTerrain,
  type F010Action,
  type F010Message,
  type F010Nature,
  type F010Result,
  type F010State,
  type Localisation,
  type TypeBien,
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

export function F010LogementAssistantPanel() {
  const { workspace, dispatch } = useLmnp();
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

  const [state, setState] = useState<F010State>(() => assistant.start().state);
  const [messages, setMessages] = useState<F010Message[]>(() => assistant.start().messages);
  const [busy, setBusy] = useState(false);

  // collect_bien
  const [prix, setPrix] = useState("");
  const [typeBien, setTypeBien] = useState<TypeBien>("appartement");
  const [natureBien, setNatureBien] = useState<"ancien" | "neuf">("ancien");
  const [dateAcq, setDateAcq] = useState("");
  const [surface, setSurface] = useState("");
  const [bienSource, setBienSource] = useState<"manual" | "extracted">("manual");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // collect_frais
  const [frais, setFrais] = useState("");
  const [choixFrais, setChoixFrais] = useState<"integration" | "deduction">("integration");

  // collect_mobilier
  const [mobilier, setMobilier] = useState("");

  // ventilation
  const [ratio, setRatio] = useState("");
  const [localisation, setLocalisation] = useState<Localisation | "">("");

  const runAction = useCallback(
    async (action: F010Action) => {
      setBusy(true);
      try {
        const turn = await assistant.handle(state, action);
        setState(turn.state);
        setMessages((prev) => [...prev, ...turn.messages]);
        if (turn.completed && turn.state.result) {
          persistCompletion(turn.state);
        }
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assistant, state],
  );

  const persistCompletion = useCallback(
    (finalState: F010State) => {
      const r = finalState.result;
      if (!r) return;
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
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          logementAmortissement: {
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
            computedAt: new Date().toISOString(),
          },
        },
      });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "logement-assistant" });
    },
    [dispatch],
  );

  const handleUpload = useCallback(async (file: File) => {
    setUploadError(null);
    setBusy(true);
    try {
      const prefill = await extractActeForF010(file);
      if (prefill.prixAcquisition !== undefined) setPrix(String(prefill.prixAcquisition));
      if (prefill.typeBien && prefill.typeBien !== "autre") setTypeBien(prefill.typeBien);
      if (prefill.dateAcquisition) setDateAcq(prefill.dateAcquisition);
      if (prefill.surface !== undefined) setSurface(String(prefill.surface));
      if (prefill.fraisNotaire !== undefined) setFrais(String(prefill.fraisNotaire));
      setBienSource("extracted");
    } catch {
      setUploadError(
        "Nous n'avons pas pu lire ce document. Vous pouvez saisir les montants manuellement.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const estimateFrais = useCallback(() => {
    const prixValue = Number(prix);
    if (!Number.isFinite(prixValue) || prixValue <= 0) return;
    const suggestion = suggestFrais({ prixAcquisition: prixValue, natureBien });
    setFrais(String(Math.round(suggestion.montantSuggere)));
  }, [prix, natureBien]);

  const estimateRatio = useCallback(() => {
    if (!localisation) return;
    const suggestion = suggestRatioTerrain({ typeBien, localisation });
    setRatio(String(Math.round(suggestion.ratioSuggere * 100)));
  }, [localisation, typeBien]);

  const step = state.step;

  return (
    <div className="mx-auto max-w-2xl">
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
                  onClick={() => void runAction({ type: "select_nature", nature: option.id as F010Nature })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}

          {step === "coming_soon" ? (
            <div className="flex flex-col gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => void runAction({ type: "restart" })}>
                Choisir un autre type d&apos;acquisition
              </Button>
              <Link href={LMNP_ROUTES.dashboard}>
                <Button className="w-full" variant="secondary">
                  Retour au tableau de bord
                </Button>
              </Link>
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
            </div>
          ) : null}

          {step === "collect_bien" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction({
                  type: "submit_bien",
                  prixAcquisition: Number(prix),
                  typeBien,
                  natureBien,
                  dateAcquisition: dateAcq,
                  surface: surface ? Number(surface) : undefined,
                  source: bienSource,
                });
              }}
            >
              {state.acquisitionSource !== "manuel" ? (
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUpload(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    Importer mon acte notarié
                  </Button>
                  {uploadError ? (
                    <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{uploadError}</p>
                  ) : null}
                </div>
              ) : null}

              <label style={labelStyle}>Prix d&apos;achat du bien (€)</label>
              <input value={prix} onChange={(e) => setPrix(e.target.value)} inputMode="numeric" style={inputStyle} />

              <label style={labelStyle}>Type de bien</label>
              <select value={typeBien} onChange={(e) => setTypeBien(e.target.value as TypeBien)} style={inputStyle}>
                <option value="appartement">Appartement</option>
                <option value="maison">Maison</option>
                <option value="autre">Autre</option>
              </select>

              <label style={labelStyle}>Nature du bien</label>
              <select
                value={natureBien}
                onChange={(e) => setNatureBien(e.target.value as "ancien" | "neuf")}
                style={inputStyle}
              >
                <option value="ancien">Ancien</option>
                <option value="neuf">Neuf</option>
              </select>

              <label style={labelStyle}>Date d&apos;acquisition</label>
              <input type="date" value={dateAcq} onChange={(e) => setDateAcq(e.target.value)} style={inputStyle} />

              <label style={labelStyle}>Surface (m²) — optionnel</label>
              <input value={surface} onChange={(e) => setSurface(e.target.value)} inputMode="numeric" style={inputStyle} />

              <Button type="submit" disabled={busy || !prix || !dateAcq}>
                Continuer
              </Button>
            </form>
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
                });
              }}
            >
              <label style={labelStyle}>Frais de notaire (€)</label>
              <input value={frais} onChange={(e) => setFrais(e.target.value)} inputMode="numeric" style={inputStyle} />
              <Button type="button" variant="ghost" disabled={busy || !prix} onClick={estimateFrais}>
                Je ne sais pas — estimer pour moi
              </Button>

              <label style={labelStyle}>Comment traiter ces frais ?</label>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant={choixFrais === "integration" ? "primary" : "secondary"}
                  disabled={busy}
                  onClick={() => setChoixFrais("integration")}
                >
                  Les ajouter à la valeur du bien (recommandé)
                </Button>
                <Button
                  type="button"
                  variant={choixFrais === "deduction" ? "primary" : "secondary"}
                  disabled={busy}
                  onClick={() => setChoixFrais("deduction")}
                >
                  Les déduire immédiatement
                </Button>
              </div>

              <Button type="submit" disabled={busy || !frais}>
                Continuer
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
              <label style={labelStyle}>Montant du mobilier inclus (€)</label>
              <input value={mobilier} onChange={(e) => setMobilier(e.target.value)} inputMode="numeric" style={inputStyle} />
              <Button type="submit" disabled={busy || !mobilier}>
                Continuer
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void runAction({ type: "skip_mobilier" })}>
                Pas de mobilier
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
                });
              }}
            >
              <label style={labelStyle}>Où se situe le bien ?</label>
              <select
                value={localisation}
                onChange={(e) => setLocalisation(e.target.value as Localisation)}
                style={inputStyle}
              >
                <option value="">Sélectionner…</option>
                {(LOCALISATIONS[typeBien] ?? LOCALISATIONS.autre).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" disabled={busy || !localisation} onClick={estimateRatio}>
                Proposer une estimation
              </Button>

              <label style={labelStyle}>Part du terrain (%)</label>
              <input value={ratio} onChange={(e) => setRatio(e.target.value)} inputMode="numeric" style={inputStyle} />

              <Button type="submit" disabled={busy || !ratio}>
                Calculer mon amortissement
              </Button>
            </form>
          ) : null}

          {step === "review_plan" && state.result ? (
            <div className="flex flex-col gap-3">
              <PlanSummary result={state.result} />
              <Button disabled={busy} onClick={() => void runAction({ type: "confirm" })}>
                Oui, je valide
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void runAction({ type: "restart" })}>
                Recommencer
              </Button>
            </div>
          ) : null}

          {step === "complete" ? (
            <Link href={LMNP_ROUTES.dashboard}>
              <Button className="w-full">Retour au tableau de bord</Button>
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
