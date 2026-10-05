"use client";

import { useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { useBienScope, useLmnp } from "@/lib/lmnp/store";
import {
  answerBalance,
  answerCollections,
  answerCoverage,
  answerExceptions,
  buildManualSummary,
  clearBalance,
  nextManualStep,
  parseEurosToCents,
  type BalanceKey,
  type ManualStep,
} from "@/lib/lmnp/services/f013/v2/f013-v2-manual-flow";
import type { MoneyFact, OutOfDomainTreatment } from "@/lib/lmnp/services/f013/v2/f013-v2-contract";
import {
  confirmRentReconciliation,
  createRentReconciliationState,
  parseRentReconciliationState,
  type RentReconciliationV2State,
} from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import { BienScopeGate } from "./BienScopeGate";

/** Activation explicite : sans ce drapeau la route F013 v2 reste inerte (aucune lecture, aucune écriture). */
export function isF013V2ManualEnabled(): boolean {
  return process.env.NEXT_PUBLIC_F013_V2_MANUAL === "1";
}

const STEP_ORDER: ManualStep[] = ["collections", "coverage", "opening", "closing", "exceptions", "summary"];

const EXCEPTION_LABELS: Record<Extract<OutOfDomainTreatment, "security_deposit" | "insurance_indemnity" | "refund" | "gli" | "dispute" | "complex_cancellation" | "doubtful_receivable_provision">, string> = {
  security_deposit: "Un dépôt de garantie",
  insurance_indemnity: "Une indemnité (assurance, sinistre…)",
  refund: "Un remboursement",
  gli: "Une garantie loyers impayés (GLI)",
  dispute: "Une somme faisant l'objet d'un litige",
  complex_cancellation: "Une annulation ou remise de loyer complexe",
  doubtful_receivable_provision: "Un loyer impayé considéré comme douteux ou perdu",
};

const fmt = (cents: number | null) =>
  cents === null ? "—" : `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const inputStyle = {
  ...typography.body.desktop,
  padding: spacing.scale[3],
  borderRadius: radius.md,
  border: `1px solid ${colors.border.subtle}`,
  backgroundColor: colors.surface.primary,
  width: "100%",
} as const;

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.scale[3] }}>
        <p style={{ ...typography.body.desktop, fontWeight: 600 }}>{title}</p>
        {children}
      </div>
    </Card>
  );
}

function AmountInput({ onSubmit, label }: { onSubmit: (cents: number) => void; label: string }) {
  const [raw, setRaw] = useState("");
  const cents = parseEurosToCents(raw);
  return (
    <div style={{ display: "flex", gap: spacing.scale[2] }}>
      <input aria-label={label} inputMode="decimal" placeholder="0,00" value={raw} onChange={(e) => setRaw(e.target.value)} style={inputStyle} />
      <Button disabled={cents === null} onClick={() => cents !== null && onSubmit(cents)}>Valider</Button>
    </div>
  );
}

function BalanceQuestion({
  title,
  fact,
  onNone,
  onSome,
  onClear,
}: {
  title: string;
  fact: MoneyFact;
  onNone: () => void;
  onSome: (cents: number) => void;
  onClear: () => void;
}) {
  const [wantsAmount, setWantsAmount] = useState(false);
  const isNone = fact.status === "VALIDATED" && fact.amountCents === 0;
  const isSome = fact.status === "VALIDATED" && fact.amountCents > 0;
  return (
    <Question title={title}>
      <div style={{ display: "flex", gap: spacing.scale[2] }}>
        <Button variant={isNone ? "primary" : "secondary"} onClick={() => { setWantsAmount(false); onNone(); }}>Non</Button>
        <Button variant={isSome || wantsAmount ? "primary" : "secondary"} onClick={() => { if (!isSome) { setWantsAmount(true); } }}>Oui</Button>
        {fact.status !== "UNKNOWN" ? <Button variant="ghost" onClick={() => { setWantsAmount(false); onClear(); }}>Effacer ma réponse</Button> : null}
      </div>
      {isSome ? <p>Montant : {fmt(fact.amountCents)}</p> : null}
      {wantsAmount || isSome ? <AmountInput label={`${title} — montant`} onSubmit={(c) => { setWantsAmount(false); onSome(c); }} /> : null}
    </Question>
  );
}

export function F013V2ManualPanel() {
  if (!isF013V2ManualEnabled()) {
    return <div role="status">Cette fonctionnalité n’est pas disponible pour le moment.</div>;
  }
  return (
    <BienScopeGate>
      <F013V2ManualPanelBody />
    </BienScopeGate>
  );
}

function F013V2ManualPanelBody() {
  const { workspace } = useLmnp();
  const bienScope = useBienScope();
  const propertyId = bienScope.propertyId;
  const fiscalYear = workspace.fiscalYear.year;
  const scope = useMemo(() => (propertyId ? { propertyId, fiscalYear } : undefined), [propertyId, fiscalYear]);

  // Restauration : uniquement depuis les faits persistés — jamais depuis `revenusAssistant` (legacy_cash_v1).
  const persisted = parseRentReconciliationState(bienScope.draft.rentReconciliationV2);
  const matchesScope = persisted && scope && persisted.facts.propertyId === scope.propertyId && persisted.facts.fiscalYear === scope.fiscalYear;
  const state: RentReconciliationV2State | undefined = scope ? (matchesScope ? persisted : createRentReconciliationState(scope)) : undefined;
  const [error, setError] = useState<string | null>(null);

  if (!scope || !state) return <div role="status">Choisissez le bien à renseigner.</div>;

  const commit = (next: RentReconciliationV2State) => {
    setError(null);
    if (next === state && persisted) return;
    bienScope.dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: next } });
  };
  const step = nextManualStep(state);
  const reached = (target: ManualStep) => STEP_ORDER.indexOf(target) <= STEP_ORDER.indexOf(step);
  const f = state.facts;
  const summary = buildManualSummary(state, scope);
  const fail = () => setError("Montant invalide : saisissez un montant positif, avec au plus deux décimales.");
  const balance = (key: BalanceKey) => ({
    fact: f[key],
    onNone: () => {
      const r = answerBalance(state, key, { answer: "none" });
      if (r.ok) commit(r.state);
    },
    onSome: (cents: number) => {
      const r = answerBalance(state, key, { answer: "some", amountCents: cents });
      if (r.ok) commit(r.state); else fail();
    },
    onClear: () => commit(clearBalance(state, key)),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.scale[4] }}>
      <h1 style={{ ...typography.body.desktop, fontWeight: 700 }}>Loyers de l’année {fiscalYear}</h1>
      {error ? <p role="alert" style={{ color: colors.text.muted }}>{error}</p> : null}

      <Question title={`Combien de loyers avez-vous réellement reçus pendant ${fiscalYear} pour ce bien ?`}>
        {f.collections.status !== "UNKNOWN" ? <p>Montant déclaré : {fmt(f.collections.amountCents)}</p> : null}
        <AmountInput
          label="Loyers reçus"
          onSubmit={(c) => { const r = answerCollections(state, c); if (r.ok) commit(r.state); else fail(); }}
        />
      </Question>

      {reached("coverage") && f.collections.status !== "UNKNOWN" ? (
        <Question title={`Ce montant comprend-il tous les loyers reçus pendant ${fiscalYear} pour ce bien, hors dépôt de garantie et mouvements personnels ?`}>
          <div style={{ display: "flex", gap: spacing.scale[2] }}>
            <Button variant={f.collectionsCoverage.completeness === "COMPLETE" ? "primary" : "secondary"} onClick={() => commit(answerCoverage(state, "all"))}>Oui, tous</Button>
            <Button variant={f.collectionsCoverage.completeness === "PARTIAL" ? "primary" : "secondary"} onClick={() => commit(answerCoverage(state, "not_all"))}>Non, il en manque</Button>
          </div>
          {f.collectionsCoverage.completeness === "PARTIAL" ? <p>Complétez le montant ci-dessus avec tous les loyers reçus, puis répondez « Oui, tous ».</p> : null}
        </Question>
      ) : null}

      {reached("opening") ? (
        <>
          <BalanceQuestion title={`Au 1er janvier ${fiscalYear}, restait-il des loyers d’une année précédente à recevoir ?`} {...balance("openingReceivables")} />
          <BalanceQuestion title={`Avant ${fiscalYear}, aviez-vous déjà reçu des loyers correspondant à ${fiscalYear} ou après ?`} {...balance("openingAdvances")} />
        </>
      ) : null}

      {reached("closing") ? (
        <>
          <BalanceQuestion title={`Au 31 décembre ${fiscalYear}, restait-il des loyers de ${fiscalYear} à recevoir ?`} {...balance("closingReceivables")} />
          <BalanceQuestion title={`Au 31 décembre ${fiscalYear}, aviez-vous déjà reçu des loyers pour une période après ${fiscalYear} ?`} {...balance("closingAdvances")} />
        </>
      ) : null}

      {reached("exceptions") ? (
        <Question title="Les sommes reçues comprennent-elles l’un de ces éléments ?">
          <ExceptionsForm
            selected={f.outOfDomain ?? []}
            reviewed={f.exceptionsReviewed}
            onNone={() => { const r = answerExceptions(state, { answer: "none" }); if (r.ok) commit(r.state); }}
            onSome={(treatments) => { const r = answerExceptions(state, { answer: "some", treatments }); if (r.ok) commit(r.state); }}
          />
        </Question>
      ) : null}

      {reached("summary") ? (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: spacing.scale[2] }}>
            {summary.lines.map((line) => (
              <div key={line.label} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{line.sign} {line.label}</span>
                <strong>{fmt(line.amountCents)}</strong>
              </div>
            ))}
            {summary.result.status === "SUPPORTED" ? (
              summary.confirmationFresh ? (
                <p role="status">Rapprochement confirmé.</p>
              ) : (
                <>
                  {summary.confirmationStale ? <p role="status">Vos réponses ont changé : confirmez à nouveau.</p> : null}
                  <Button
                    onClick={() => {
                      const r = confirmRentReconciliation(state, scope, new Date().toISOString());
                      if (r.ok) commit(r.state);
                    }}
                  >
                    Confirmer ces loyers
                  </Button>
                </>
              )
            ) : (
              <p role="status">
                {summary.result.status === "OUT_OF_DOMAIN"
                  ? "Cette situation nécessite un traitement que nous ne gérons pas encore automatiquement."
                  : "Il manque des informations avant de pouvoir confirmer."}
              </p>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ExceptionsForm({
  selected,
  reviewed,
  onNone,
  onSome,
}: {
  selected: readonly OutOfDomainTreatment[];
  reviewed: boolean;
  onNone: () => void;
  onSome: (treatments: OutOfDomainTreatment[]) => void;
}) {
  const [picked, setPicked] = useState<OutOfDomainTreatment[]>([...selected]);
  const keys = Object.keys(EXCEPTION_LABELS) as (keyof typeof EXCEPTION_LABELS)[];
  return (
    <>
      {keys.map((key) => (
        <label key={key} style={{ display: "flex", gap: spacing.scale[2] }}>
          <input
            type="checkbox"
            checked={picked.includes(key)}
            onChange={(e) => setPicked((p) => (e.target.checked ? [...p, key] : p.filter((k) => k !== key)))}
          />
          {EXCEPTION_LABELS[key]}
        </label>
      ))}
      <div style={{ display: "flex", gap: spacing.scale[2] }}>
        <Button variant={reviewed && selected.length === 0 ? "primary" : "secondary"} onClick={onNone}>Aucun de ces éléments</Button>
        <Button disabled={picked.length === 0} onClick={() => onSome(picked)}>Enregistrer ces éléments</Button>
      </div>
    </>
  );
}
