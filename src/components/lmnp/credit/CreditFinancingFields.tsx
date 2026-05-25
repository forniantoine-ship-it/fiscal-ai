"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  formatCurrency,
  type CreditFieldKey,
  type CreditFormValues,
} from "@/lib/lmnp/services/credit-profile";
import type { LoanInstallment } from "@/lib/lmnp/types";

function LightField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  delayMs = 0,
  uncertain = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  delayMs?: number;
  uncertain?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const showReview = uncertain && !focused && !value.trim();

  return (
    <label
      className="block animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ animationDelay: `${delayMs}ms`, paddingBlock: spacing.scale[2] }}
    >
      <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="mt-2 w-full outline-none"
        style={{
          ...typography.body.desktop,
          color: colors.text.primary,
          backgroundColor: colors.surface.inset,
          border: `1px solid ${
            focused
              ? colors.border.focus
              : showReview
                ? colors.orange[300]
                : colors.border.subtle
          }`,
          borderRadius: radius.md,
          padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
          boxShadow: focused
            ? `0 0 0 3px ${colors.orange[100]}`
            : showReview
              ? `0 0 0 3px ${colors.orange[50]}`
              : "none",
          transition: motions.hover.card,
        }}
      />
      {showReview ? (
        <p className="mt-1.5" style={{ ...typography.caption.desktop, color: colors.text.accent }}>
          Information à vérifier
        </p>
      ) : null}
    </label>
  );
}

function LightSelect({
  label,
  value,
  onChange,
  options,
  delayMs = 0,
  uncertain = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  delayMs?: number;
  uncertain?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const showReview = uncertain && !focused && !value.trim();

  return (
    <label
      className="block animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ animationDelay: `${delayMs}ms`, paddingBlock: spacing.scale[2] }}
    >
      <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="mt-2 w-full outline-none"
        style={{
          ...typography.body.desktop,
          color: colors.text.primary,
          backgroundColor: colors.surface.inset,
          border: `1px solid ${
            focused
              ? colors.border.focus
              : showReview
                ? colors.orange[300]
                : colors.border.subtle
          }`,
          borderRadius: radius.md,
          padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
          boxShadow: focused ? `0 0 0 3px ${colors.orange[100]}` : "none",
          transition: motions.hover.card,
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <p
      className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        ...typography.caption.desktop,
        color: colors.text.accent,
        letterSpacing: typography.letterSpacing.label,
        paddingTop: spacing.scale[6],
        paddingBottom: spacing.scale[2],
      }}
    >
      {children}
    </p>
  );
}

function SummaryMetric({
  label,
  value,
  delayMs = 0,
}: {
  label: string;
  value: string;
  delayMs?: number;
}) {
  return (
    <div
      className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        animationDelay: `${delayMs}ms`,
        padding: `${spacing.scale[4]} ${spacing.scale[5]}`,
        borderRadius: radius.md,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
      }}
    >
      <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{label}</p>
      <p
        className="mt-2"
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.xl,
          color: colors.text.primary,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function InstallmentTable({ rows }: { rows: LoanInstallment[] }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            {["Date", "Total échéance", "Capital", "Intérêts", "Assurance", "Frais dossier", "Commentaire"].map(
              (header) => (
                <th
                  key={header}
                  className="pb-4 text-left font-normal"
                  style={{
                    ...typography.caption.desktop,
                    color: colors.text.muted,
                    paddingInline: spacing.scale[3],
                  }}
                >
                  {header}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.date}
              className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
              style={{
                borderTop: `1px solid ${colors.border.subtle}`,
              }}
            >
              <td style={{ ...typography.body.desktop, fontSize: typography.fontSize.sm, padding: `${spacing.scale[4]} ${spacing.scale[3]}` }}>
                {new Date(row.date).toLocaleDateString("fr-FR")}
              </td>
              <td style={{ ...typography.body.desktop, fontSize: typography.fontSize.sm, padding: `${spacing.scale[4]} ${spacing.scale[3]}` }}>
                {formatCurrency(row.totalPayment)}
              </td>
              <td style={{ ...typography.body.desktop, fontSize: typography.fontSize.sm, padding: `${spacing.scale[4]} ${spacing.scale[3]}`, color: colors.text.secondary }}>
                {formatCurrency(row.principal)}
              </td>
              <td style={{ ...typography.body.desktop, fontSize: typography.fontSize.sm, padding: `${spacing.scale[4]} ${spacing.scale[3]}`, color: colors.text.secondary }}>
                {formatCurrency(row.interest)}
              </td>
              <td style={{ ...typography.body.desktop, fontSize: typography.fontSize.sm, padding: `${spacing.scale[4]} ${spacing.scale[3]}`, color: colors.text.secondary }}>
                {formatCurrency(row.insurance)}
              </td>
              <td style={{ ...typography.body.desktop, fontSize: typography.fontSize.sm, padding: `${spacing.scale[4]} ${spacing.scale[3]}`, color: colors.text.secondary }}>
                {formatCurrency(row.fees)}
              </td>
              <td style={{ ...typography.caption.desktop, padding: `${spacing.scale[4]} ${spacing.scale[3]}`, color: colors.text.muted }}>
                {row.comment ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CreditFinancingFieldsProps = {
  values: CreditFormValues;
  onChange: (values: CreditFormValues) => void;
  revenueYear: number;
  installments: LoanInstallment[];
  showIncompleteWarning?: boolean;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  cardStyle?: CSSProperties;
  visibleSections?: number;
  uncertainFields?: CreditFieldKey[];
  showConfirm?: boolean;
};

export function CreditFinancingFields({
  values,
  onChange,
  revenueYear,
  installments,
  showIncompleteWarning,
  onConfirm,
  confirmDisabled,
  cardStyle,
  visibleSections = 2,
  uncertainFields = [],
  showConfirm = true,
}: CreditFinancingFieldsProps) {
  const [showSchedule, setShowSchedule] = useState(false);
  const uncertain = new Set(uncertainFields);

  const deferralOptions = useMemo(
    () => [
      { value: "none", label: "Aucun" },
      { value: "total", label: "Différé total" },
      { value: "partial", label: "Différé partiel" },
      { value: "franchise", label: "Franchise" },
    ],
    [],
  );

  const updateLoan = (index: number, patch: Partial<CreditFormValues["loans"][0]>) => {
    const loans = values.loans.map((loan, loanIndex) =>
      loanIndex === index ? { ...loan, ...patch } : loan,
    );
    onChange({ ...values, loans });
  };

  const updateSummary = (patch: Partial<CreditFormValues["summary"]>) => {
    onChange({ ...values, summary: { ...values.summary, ...patch } });
  };

  const summaryDisplay = {
    annualInterest: values.summary.annualInterest
      ? formatCurrency(Number(values.summary.annualInterest.replace(/\s/g, "").replace(",", ".")))
      : "—",
    annualInsurance: values.summary.annualInsurance
      ? formatCurrency(Number(values.summary.annualInsurance.replace(/\s/g, "").replace(",", ".")))
      : "—",
    annualFinancingCharges: values.summary.annualFinancingCharges
      ? formatCurrency(Number(values.summary.annualFinancingCharges.replace(/\s/g, "").replace(",", ".")))
      : "—",
    remainingCapital: values.summary.remainingCapital
      ? formatCurrency(Number(values.summary.remainingCapital.replace(/\s/g, "").replace(",", ".")))
      : "—",
  };

  const form = (
    <div className="w-full">
      {visibleSections >= 1 ? (
        <>
          <h3
            className="text-center text-lg sm:text-xl"
            style={{
              fontFamily: typography.fontFamily.display,
              fontWeight: typography.fontWeight.regular,
              color: colors.text.primary,
            }}
          >
            Votre financement préparé
          </h3>
          <p
            className="mt-2 text-center"
            style={{ ...typography.caption.desktop, color: colors.text.muted }}
          >
            Année fiscale {revenueYear} · déclaration {revenueYear + 1}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <SummaryMetric label={`Intérêts ${revenueYear}`} value={summaryDisplay.annualInterest} delayMs={60} />
            <SummaryMetric label="Assurance" value={summaryDisplay.annualInsurance} delayMs={120} />
            <SummaryMetric label="Charges financières" value={summaryDisplay.annualFinancingCharges} delayMs={180} />
            <SummaryMetric label="Capital restant dû" value={summaryDisplay.remainingCapital} delayMs={240} />
          </div>
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setShowSchedule((current) => !current)}
              style={{
                ...typography.caption.desktop,
                color: colors.text.accent,
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              {showSchedule ? "Masquer le détail des échéances" : "Voir détail des échéances"}
            </button>
          </div>
          {showSchedule ? <InstallmentTable rows={installments} /> : null}
        </>
      ) : null}

      {visibleSections >= 2 ? (
        <>
          {values.loans.map((loan, index) => (
            <div key={`loan-${index}`}>
              <SectionTitle>
                {values.loans.length > 1 ? `Financement ${index + 1}` : "Détails du prêt"}
              </SectionTitle>
              <LightField
                label="Banque"
                value={loan.bank}
                onChange={(bank) => updateLoan(index, { bank })}
                placeholder="Crédit Agricole"
                uncertain={uncertain.has("bank")}
                delayMs={60}
              />
              <LightField
                label="Type de prêt"
                value={loan.loanType}
                onChange={(loanType) => updateLoan(index, { loanType })}
                placeholder="Prêt immobilier amortissable"
                uncertain={uncertain.has("loanType")}
                delayMs={120}
              />
              <div className="grid gap-0 sm:grid-cols-2 sm:gap-x-4">
                <LightField
                  label="Montant emprunté"
                  value={loan.borrowedAmount}
                  onChange={(borrowedAmount) => updateLoan(index, { borrowedAmount })}
                  placeholder="180 000"
                  uncertain={uncertain.has("borrowedAmount")}
                  delayMs={180}
                />
                <LightField
                  label="Taux"
                  value={loan.rate}
                  onChange={(rate) => updateLoan(index, { rate })}
                  placeholder="3,15"
                  uncertain={uncertain.has("rate")}
                  delayMs={240}
                />
              </div>
              <div className="grid gap-0 sm:grid-cols-2 sm:gap-x-4">
                <LightField
                  label="Durée (mois)"
                  value={loan.durationMonths}
                  onChange={(durationMonths) => updateLoan(index, { durationMonths })}
                  placeholder="240"
                  uncertain={uncertain.has("durationMonths")}
                  delayMs={300}
                />
                <LightField
                  label="Mensualité"
                  value={loan.monthlyPayment}
                  onChange={(monthlyPayment) => updateLoan(index, { monthlyPayment })}
                  placeholder="1 012"
                  uncertain={uncertain.has("monthlyPayment")}
                  delayMs={360}
                />
              </div>
              <div className="grid gap-0 sm:grid-cols-2 sm:gap-x-4">
                <LightField
                  label="Assurance"
                  value={loan.insurance}
                  onChange={(insurance) => updateLoan(index, { insurance })}
                  placeholder="42"
                  uncertain={uncertain.has("insurance")}
                  delayMs={420}
                />
                <LightSelect
                  label="Différé"
                  value={loan.deferralType}
                  onChange={(deferralType) => updateLoan(index, { deferralType })}
                  options={deferralOptions}
                  uncertain={uncertain.has("deferralType")}
                  delayMs={480}
                />
              </div>
              <div className="grid gap-0 sm:grid-cols-2 sm:gap-x-4">
                <LightField
                  label="Frais dossier"
                  value={loan.fees}
                  onChange={(fees) => updateLoan(index, { fees })}
                  placeholder="850"
                  uncertain={uncertain.has("fees")}
                  delayMs={540}
                />
                <LightField
                  label="Capital restant dû"
                  value={loan.remainingCapital}
                  onChange={(remainingCapital) => updateLoan(index, { remainingCapital })}
                  placeholder="168 420"
                  uncertain={uncertain.has("remainingCapital")}
                  delayMs={600}
                />
              </div>
              <div className="grid gap-0 sm:grid-cols-2 sm:gap-x-4">
                <LightField
                  label="Date début prêt"
                  type="date"
                  value={loan.startDate}
                  onChange={(startDate) => updateLoan(index, { startDate })}
                  uncertain={uncertain.has("startDate")}
                  delayMs={660}
                />
                <LightField
                  label="Date première échéance"
                  type="date"
                  value={loan.firstPaymentDate}
                  onChange={(firstPaymentDate) => updateLoan(index, { firstPaymentDate })}
                  uncertain={uncertain.has("firstPaymentDate")}
                  delayMs={720}
                />
              </div>
              <div
                className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
                style={{ animationDelay: "780ms", paddingBlock: spacing.scale[2] }}
              >
                <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>Prêt travaux</p>
                <div className="mt-3 flex gap-3">
                  {(["non", "oui"] as const).map((choice) => {
                    const selected = choice === "oui" ? loan.isWorksLoan : !loan.isWorksLoan;
                    return (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => updateLoan(index, { isWorksLoan: choice === "oui" })}
                        style={{
                          ...typography.caption.desktop,
                          textTransform: "capitalize",
                          padding: `${spacing.scale[2]} ${spacing.scale[4]}`,
                          borderRadius: radius.full,
                          border: `1px solid ${selected ? colors.border.selected : colors.border.subtle}`,
                          backgroundColor: selected ? colors.surface.selected : colors.surface.primary,
                          color: selected ? colors.text.primary : colors.text.secondary,
                          transition: motions.hover.button,
                        }}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          <SectionTitle>Totaux annuels</SectionTitle>
          <div className="grid gap-0 sm:grid-cols-2 sm:gap-x-4">
            <LightField
              label={`Intérêts ${revenueYear}`}
              value={values.summary.annualInterest}
              onChange={(annualInterest) => updateSummary({ annualInterest })}
              placeholder="4 820"
              delayMs={60}
            />
            <LightField
              label="Assurance annuelle"
              value={values.summary.annualInsurance}
              onChange={(annualInsurance) => updateSummary({ annualInsurance })}
              placeholder="600"
              delayMs={120}
            />
            <LightField
              label="Charges financières"
              value={values.summary.annualFinancingCharges}
              onChange={(annualFinancingCharges) => updateSummary({ annualFinancingCharges })}
              placeholder="5 420"
              delayMs={180}
            />
            <LightField
              label="Capital restant dû"
              value={values.summary.remainingCapital}
              onChange={(remainingCapital) => updateSummary({ remainingCapital })}
              placeholder="189 600"
              delayMs={240}
            />
          </div>
        </>
      ) : null}

      {showIncompleteWarning ? (
        <p
          className="mt-8 animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{ ...typography.caption.desktop, color: colors.text.muted }}
        >
          Certaines informations restent à compléter.
        </p>
      ) : null}

      {showConfirm && visibleSections >= 2 ? (
        <div className="mt-10 flex justify-center animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]">
          <Button onClick={onConfirm} disabled={confirmDisabled}>
            Confirmer les informations
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (!cardStyle) return form;

  return (
    <section
      className="relative w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={cardStyle}
    >
      <h2
        className="text-center text-xl sm:text-2xl"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          color: colors.text.primary,
        }}
      >
        Financement détecté par l&apos;IA
      </h2>
      <div className="mt-8">{form}</div>
    </section>
  );
}

export type { CreditFormValues, CreditFieldKey };
