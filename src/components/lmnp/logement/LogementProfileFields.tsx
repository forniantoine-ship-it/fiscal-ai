"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { PropertyType } from "@/lib/lmnp/types";
import type { LogementFieldKey, LogementFormValues } from "@/lib/lmnp/services/logement-profile";
import {
  LOGEMENT_FADE_IN,
  logementDelayStyle,
  logementMotionStyle,
} from "@/components/lmnp/logement/logement-visual-isolation";

function LightField({
  field,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  delayMs = 0,
  uncertain = false,
  autocompleteHint = false,
}: {
  field: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  delayMs?: number;
  uncertain?: boolean;
  autocompleteHint?: boolean;
}) {
  console.count("[LogementProfileFields.LightField render]");
  console.log("[field-runtime]", { field, value, typeofValue: typeof value });

  const [focused, setFocused] = useState(false);
  const showReview = uncertain && !focused && !value.trim();

  return (
    <label
      className={`block ${LOGEMENT_FADE_IN}`}
      style={{ ...logementDelayStyle(delayMs), paddingBlock: spacing.scale[2] }}
    >
      <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>{label}</span>
      <div className="relative mt-2">
        {autocompleteHint ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: colors.text.muted }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </span>
        ) : null}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full outline-none"
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
            paddingLeft: autocompleteHint ? spacing.scale[10] : spacing.scale[4],
            boxShadow: focused
              ? `0 0 0 3px ${colors.orange[100]}`
              : showReview
                ? `0 0 0 3px ${colors.orange[50]}`
                : "none",
            ...logementMotionStyle(motions.hover.card),
          }}
        />
      </div>
      {showReview ? (
        <p className="mt-1.5" style={{ ...typography.caption.desktop, color: colors.text.accent }}>
          Information à vérifier
        </p>
      ) : null}
      {autocompleteHint && focused ? (
        <p className="mt-1.5" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          Saisissez votre adresse — suggestions automatiques
        </p>
      ) : null}
    </label>
  );
}

function LightSelect({
  field,
  label,
  value,
  onChange,
  options,
  delayMs = 0,
}: {
  field: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  delayMs?: number;
}) {
  console.count("[LogementProfileFields.LightSelect render]");
  console.log("[field-runtime]", { field, value, typeofValue: typeof value });

  const [focused, setFocused] = useState(false);

  return (
    <label
      className={`block ${LOGEMENT_FADE_IN}`}
      style={{ ...logementDelayStyle(delayMs), paddingBlock: spacing.scale[2] }}
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
          border: `1px solid ${focused ? colors.border.focus : colors.border.subtle}`,
          borderRadius: radius.md,
          padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
          boxShadow: focused ? `0 0 0 3px ${colors.orange[100]}` : "none",
          ...logementMotionStyle(motions.hover.card),
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
  console.count("[LogementProfileFields.SectionTitle render]");

  return (
    <p
      className={LOGEMENT_FADE_IN}
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

type LogementProfileFieldsProps = {
  values: LogementFormValues;
  onChange: (values: LogementFormValues) => void;
  showIncompleteWarning?: boolean;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  cardStyle?: CSSProperties;
  visibleSections?: number;
  uncertainFields?: LogementFieldKey[];
  showConfirm?: boolean;
};

export function LogementProfileFields({
  values,
  onChange,
  showIncompleteWarning,
  onConfirm,
  confirmDisabled,
  cardStyle,
  visibleSections = 2,
  uncertainFields = [],
  showConfirm = true,
}: LogementProfileFieldsProps) {
  console.count("[LogementProfileFields render]");
  console.log("[logement-form-props]", {
    address: values.address,
    city: values.city,
    postalCode: values.postalCode,
    acquisitionDate: values.acquisitionDate,
    surface: values.surface,
    propertyType: values.propertyType,
  });

  const uncertain = new Set(uncertainFields);

  const update = (patch: Partial<LogementFormValues>) => {
    onChange({ ...values, ...patch });
  };

  const propertyTypeOptions = useMemo(
    () =>
      [
        { value: "appartement", label: "Appartement" },
        { value: "maison", label: "Maison" },
        { value: "meuble-tourisme", label: "Meublé tourisme" },
        { value: "chambre-hote", label: "Chambre d'hôte" },
        { value: "non-classe", label: "Non classé" },
      ] as const,
    [],
  );

  const form = (
    <div className="w-full">
      {visibleSections >= 1 ? (
        <>
          <SectionTitle>Identité logement</SectionTitle>
          <LightField
            field="label"
            label="Nom du logement"
            value={values.label}
            onChange={(label) => update({ label })}
            placeholder="Appartement Bordeaux Gambetta"
            uncertain={uncertain.has("label")}
            delayMs={60}
          />
          <LightField
            field="address"
            label="Adresse"
            value={values.address}
            onChange={(address) => update({ address })}
            placeholder="42 cours Gambetta"
            uncertain={uncertain.has("address")}
            autocompleteHint
            delayMs={120}
          />
          <LightField
            field="addressLine2"
            label="Complément adresse"
            value={values.addressLine2}
            onChange={(addressLine2) => update({ addressLine2 })}
            placeholder="Bâtiment A, 3e étage"
            uncertain={uncertain.has("addressLine2")}
            delayMs={180}
          />
          <LightField
            field="city"
            label="Ville"
            value={values.city}
            onChange={(city) => update({ city })}
            placeholder="Bordeaux"
            uncertain={uncertain.has("city")}
            delayMs={240}
          />
          <LightField
            field="postalCode"
            label="Code postal"
            value={values.postalCode}
            onChange={(postalCode) => update({ postalCode })}
            placeholder="33000"
            uncertain={uncertain.has("postalCode")}
            delayMs={300}
          />
        </>
      ) : null}

      {visibleSections >= 2 ? (
        <>
          <SectionTitle>Acquisition</SectionTitle>
          <LightField
            field="propertyPurchasePrice"
            label="Prix du bien (hors frais, travaux et mobilier)"
            value={values.propertyPurchasePrice}
            onChange={(propertyPurchasePrice) => update({ propertyPurchasePrice })}
            placeholder="245 000"
            uncertain={uncertain.has("propertyPurchasePrice")}
            delayMs={60}
          />
          <div className="grid gap-0 sm:grid-cols-2 sm:gap-x-4">
            <LightField
              field="notaryFees"
              label="Frais de notaire"
              value={values.notaryFees}
              onChange={(notaryFees) => update({ notaryFees })}
              placeholder="18 500"
              uncertain={uncertain.has("notaryFees")}
              delayMs={120}
            />
            <LightField
              field="acquisitionDate"
              label="Date acquisition"
              type="date"
              value={values.acquisitionDate}
              onChange={(acquisitionDate) => update({ acquisitionDate })}
              uncertain={uncertain.has("acquisitionDate")}
              delayMs={180}
            />
          </div>
          <SectionTitle>Caractéristiques</SectionTitle>
          <LightSelect
            field="propertyType"
            label="Type de propriété"
            value={values.propertyType}
            onChange={(propertyType) => update({ propertyType: propertyType as PropertyType })}
            options={propertyTypeOptions.map((option) => ({ value: option.value, label: option.label }))}
            delayMs={60}
          />
          <div
            className={LOGEMENT_FADE_IN}
            style={{ ...logementDelayStyle(120), paddingBlock: spacing.scale[2] }}
          >
            <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>Copropriété</p>
            <div className="mt-3 flex gap-3">
              {(["non", "oui"] as const).map((choice) => {
                const selected = choice === "oui" ? values.coproperty : !values.coproperty;
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => update({ coproperty: choice === "oui" })}
                    style={{
                      ...typography.caption.desktop,
                      textTransform: "capitalize",
                      padding: `${spacing.scale[2]} ${spacing.scale[4]}`,
                      borderRadius: radius.full,
                      border: `1px solid ${selected ? colors.border.selected : colors.border.subtle}`,
                      backgroundColor: selected ? colors.surface.selected : colors.surface.primary,
                      color: selected ? colors.text.primary : colors.text.secondary,
                      ...logementMotionStyle(motions.hover.button),
                    }}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          </div>
          <LightField
            field="surface"
            label="Surface"
            value={values.surface}
            onChange={(surface) => update({ surface })}
            placeholder="62"
            uncertain={uncertain.has("surface")}
            delayMs={180}
          />
          <LightField
            field="status"
            label="Statut"
            value={values.status}
            onChange={(status) => update({ status })}
            placeholder="Loué meublé"
            uncertain={uncertain.has("status")}
            delayMs={240}
          />
        </>
      ) : null}

      {showIncompleteWarning ? (
        <p
          className={`mt-8 ${LOGEMENT_FADE_IN}`}
          style={{ ...typography.caption.desktop, color: colors.text.muted }}
        >
          Certaines informations restent à compléter.
        </p>
      ) : null}

      {showConfirm && visibleSections >= 2 ? (
        <div className={`mt-10 flex justify-center ${LOGEMENT_FADE_IN}`}>
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
      className={`relative w-full ${LOGEMENT_FADE_IN}`}
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
        Informations détectées par l&apos;IA
      </h2>
      <div className="mt-8">{form}</div>
    </section>
  );
}

export type { LogementFormValues, LogementFieldKey };
