"use client";

import { useState, type CSSProperties } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { ACTIVITE_REGIME_LABEL } from "@/lib/lmnp/constants/activite-product";
import { ACTIVITE_ESTABLISHMENT_ADDRESS_LABEL } from "@/lib/documents/tunnel-field-ownership";
import type { InpiProfile } from "@/lib/lmnp/services/inpi-profile";

export type ActiviteFormValues = InpiProfile;

const ADDRESS_HELPER =
  "Cette adresse est issue du document INPI et ne correspond pas forcément au bien loué.";

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

function SectionTitle({ children, helper }: { children: string; helper?: string }) {
  return (
    <div
      className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ paddingTop: spacing.scale[6], paddingBottom: spacing.scale[2] }}
    >
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.accent,
          letterSpacing: typography.letterSpacing.label,
        }}
      >
        {children}
      </p>
      {helper ? (
        <p className="mt-1.5" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function RegimeBadge() {
  return (
    <div
      className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        marginTop: spacing.scale[2],
        padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
        borderRadius: radius.md,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.inset,
      }}
    >
      <p style={{ ...typography.body.desktop, color: colors.text.primary }}>{ACTIVITE_REGIME_LABEL}</p>
    </div>
  );
}

export type ActiviteFieldKey =
  | "lastName"
  | "firstName"
  | "siren"
  | "email"
  | "telephone"
  | "personalAddress"
  | "personalCity"
  | "personalPostalCode"
  | "establishmentAddress"
  | "establishmentCity"
  | "establishmentPostalCode";

type ActiviteProfileFieldsProps = {
  values: ActiviteFormValues;
  onChange: (values: ActiviteFormValues) => void;
  showIncompleteWarning?: boolean;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  cardStyle?: CSSProperties;
  visibleSections?: number;
  uncertainFields?: ActiviteFieldKey[];
  showConfirm?: boolean;
};

export function ActiviteProfileFields({
  values,
  onChange,
  showIncompleteWarning,
  onConfirm,
  confirmDisabled,
  cardStyle,
  visibleSections = 4,
  uncertainFields = [],
  showConfirm = true,
}: ActiviteProfileFieldsProps) {
  const uncertain = new Set(uncertainFields);

  const update = (patch: Partial<ActiviteFormValues>) => {
    onChange({ ...values, ...patch });
  };

  const form = (
    <div className="w-full">
      {visibleSections >= 1 ? (
        <>
          <SectionTitle>Activité LMNP</SectionTitle>
          <RegimeBadge />
        </>
      ) : null}

      {visibleSections >= 2 ? (
        <>
          <SectionTitle>Exploitant</SectionTitle>

          <LightField
            label="Nom"
            value={values.lastName ?? ""}
            onChange={(lastName) => update({ lastName })}
            placeholder="Dupont"
            uncertain={uncertain.has("lastName")}
            delayMs={60}
          />
          <LightField
            label="Prénom"
            value={values.firstName ?? ""}
            onChange={(firstName) => update({ firstName })}
            placeholder="Marie"
            uncertain={uncertain.has("firstName")}
            delayMs={120}
          />
          <LightField
            label="SIREN"
            value={values.siren ?? ""}
            onChange={(siren) => update({ siren })}
            placeholder="829 456 123"
            uncertain={uncertain.has("siren")}
            delayMs={180}
          />
          <LightField
            label="Email"
            type="email"
            value={values.email ?? ""}
            onChange={(email) => update({ email })}
            placeholder="marie.dupont@example.com"
            uncertain={uncertain.has("email")}
            delayMs={240}
          />
          <LightField
            label="Téléphone"
            type="tel"
            value={values.telephone ?? ""}
            onChange={(telephone) => update({ telephone })}
            placeholder="06 12 34 56 78"
            uncertain={uncertain.has("telephone")}
            delayMs={300}
          />
        </>
      ) : null}

      {visibleSections >= 3 ? (
        <>
          <SectionTitle helper={ADDRESS_HELPER}>Adresse personnelle</SectionTitle>

          <LightField
            label="Adresse"
            value={values.personalAddress ?? ""}
            onChange={(personalAddress) => update({ personalAddress })}
            placeholder="4 allée Malbec"
            uncertain={uncertain.has("personalAddress")}
            delayMs={60}
          />
          <LightField
            label="Ville"
            value={values.personalCity ?? ""}
            onChange={(personalCity) => update({ personalCity })}
            placeholder="Saint-Médard-d'Eyrans"
            uncertain={uncertain.has("personalCity")}
            delayMs={120}
          />
          <LightField
            label="Code postal"
            value={values.personalPostalCode ?? ""}
            onChange={(personalPostalCode) => update({ personalPostalCode })}
            placeholder="33650"
            uncertain={uncertain.has("personalPostalCode")}
            delayMs={180}
          />
        </>
      ) : null}

      {visibleSections >= 4 ? (
        <>
          <SectionTitle helper={ADDRESS_HELPER}>{ACTIVITE_ESTABLISHMENT_ADDRESS_LABEL}</SectionTitle>

          <LightField
            label="Adresse"
            value={values.establishmentAddress ?? ""}
            onChange={(establishmentAddress) => update({ establishmentAddress })}
            placeholder="12 rue de la Paix"
            uncertain={uncertain.has("establishmentAddress")}
            delayMs={60}
          />
          <LightField
            label="Ville"
            value={values.establishmentCity ?? ""}
            onChange={(establishmentCity) => update({ establishmentCity })}
            placeholder="Lyon"
            uncertain={uncertain.has("establishmentCity")}
            delayMs={120}
          />
          <LightField
            label="Code postal"
            value={values.establishmentPostalCode ?? ""}
            onChange={(establishmentPostalCode) => update({ establishmentPostalCode })}
            placeholder="69002"
            uncertain={uncertain.has("establishmentPostalCode")}
            delayMs={180}
          />

          {showIncompleteWarning ? (
            <p
              className="mt-8 animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
              style={{ ...typography.caption.desktop, color: colors.text.muted }}
            >
              Certaines informations restent à compléter.
            </p>
          ) : null}

          {showConfirm ? (
            <div className="mt-10 flex justify-center animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]">
              <Button onClick={onConfirm} disabled={confirmDisabled}>
                Confirmer les informations
              </Button>
            </div>
          ) : null}
        </>
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
        className="text-center text-2xl sm:text-3xl"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          color: colors.text.primary,
        }}
      >
        Informations détectées par l&apos;IA
      </h2>
      <div className="mt-10">{form}</div>
    </section>
  );
}

export function profileToFormValues(profile: InpiProfile): ActiviteFormValues {
  return { ...profile };
}

export function formValuesToProfile(values: ActiviteFormValues): InpiProfile {
  return { ...values };
}

export function isProfileIncomplete(values: ActiviteFormValues): boolean {
  if (!values.siren?.trim()) return true;
  if (!values.firstName?.trim() || !values.lastName?.trim()) return true;
  return false;
}
