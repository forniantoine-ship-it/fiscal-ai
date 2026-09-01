"use client";

import { useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { ACTIVITE_REGIME_LABEL } from "@/lib/lmnp/constants/activite-product";
import { ACTIVITE_ESTABLISHMENT_ADDRESS_LABEL } from "@/lib/documents/tunnel-field-ownership";
import type { InpiProfile } from "@/lib/lmnp/services/inpi-profile";
import {
  ACTIVITE_ESTABLISHMENT_ADDRESS_FIELD_KEYS,
  getActiviteFieldStatusCopy,
  hasExtractedInpiAddressInGroup,
  hasProposedEstablishmentAddressGroup,
  type ActiviteFieldProvenanceMap,
} from "@/lib/lmnp/services/activite-field-provenance";

export type ActiviteFormValues = InpiProfile;

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

const ADDRESS_HELPER =
  "Cette adresse est issue du document INPI et ne correspond pas forcément au bien loué.";

const CARD_TITLE = "Informations identifiées dans votre document";
const CARD_SUBTITLE =
  "Vérifiez ce que nous avons lu dans votre extrait INPI et complétez les champs absents.";

const PERSONAL_ADDRESS_KEYS = [
  "personalAddress",
  "personalCity",
  "personalPostalCode",
] as const satisfies readonly ActiviteFieldKey[];

const ESTABLISHMENT_ADDRESS_KEYS = ACTIVITE_ESTABLISHMENT_ADDRESS_FIELD_KEYS;

function ProvenanceField({
  fieldKey,
  label,
  value,
  onChange,
  type = "text",
  delayMs = 0,
  provenance,
  inputRef,
}: {
  fieldKey: ActiviteFieldKey;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  delayMs?: number;
  provenance?: ActiviteFieldProvenanceMap[ActiviteFieldKey];
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [focused, setFocused] = useState(false);
  const hasValue = Boolean(value.trim());
  const statusCopy = getActiviteFieldStatusCopy(provenance, hasValue, focused, fieldKey);
  const usesAttentionBackground =
    statusCopy?.tone === "missing" || statusCopy?.tone === "proposed";

  const borderColor = focused ? colors.border.focus : colors.border.subtle;

  const focusRing = focused ? colors.orange[100] : "transparent";

  return (
    <label
      className="block animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ animationDelay: `${delayMs}ms`, paddingBlock: spacing.scale[2] }}
      data-field-key={fieldKey}
      data-field-status={provenance?.status ?? "unknown"}
    >
      <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>{label}</span>
      <input
        ref={inputRef}
        type={type}
        value={value}
        placeholder=""
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="mt-2 w-full outline-none"
        style={{
          ...typography.body.desktop,
          color: colors.text.primary,
          backgroundColor: usesAttentionBackground ? colors.orange[50] : colors.surface.inset,
          border: `1px solid ${borderColor}`,
          borderRadius: radius.md,
          padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
          boxShadow: focusRing !== "transparent" ? `0 0 0 3px ${focusRing}` : "none",
          transition: motions.hover.card,
        }}
      />
      {statusCopy ? (
        <div className="mt-1.5 space-y-0.5">
          <p
            style={
              statusCopy.tone === "missing"
                ? {
                    fontFamily: typography.fontFamily.sans,
                    fontSize: typography.fontSize.xs,
                    lineHeight: typography.lineHeight.ui,
                    letterSpacing: typography.letterSpacing.label,
                    fontWeight: typography.fontWeight.medium,
                    color: colors.text.accent,
                  }
                : {
                    ...typography.caption.desktop,
                    color:
                      statusCopy.tone === "proposed"
                        ? colors.text.accent
                        : colors.text.muted,
                  }
            }
          >
            {statusCopy.primary}
          </p>
          {statusCopy.secondary ? (
            <p
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize["2xs"],
                lineHeight: typography.lineHeight.compact,
                letterSpacing: typography.letterSpacing.label,
                fontWeight: typography.fontWeight.regular,
                color: colors.text.muted,
                opacity: 0.7,
              }}
            >
              {statusCopy.secondary}
            </p>
          ) : null}
        </div>
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

type ActiviteProfileFieldsProps = {
  values: ActiviteFormValues;
  onChange: (values: ActiviteFormValues) => void;
  fieldProvenance?: ActiviteFieldProvenanceMap;
  showIncompleteWarning?: boolean;
  onConfirm: () => void;
  onConfirmEstablishmentProposal?: () => void;
  confirmDisabled?: boolean;
  cardStyle?: CSSProperties;
  visibleSections?: number;
  showConfirm?: boolean;
};

export function ActiviteProfileFields({
  values,
  onChange,
  fieldProvenance = {},
  showIncompleteWarning,
  onConfirm,
  onConfirmEstablishmentProposal,
  confirmDisabled,
  cardStyle,
  visibleSections = 4,
  showConfirm = true,
}: ActiviteProfileFieldsProps) {
  const establishmentAddressInputRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<ActiviteFormValues>) => {
    onChange({ ...values, ...patch });
  };

  const showEstablishmentProposalActions = useMemo(
    () => hasProposedEstablishmentAddressGroup(fieldProvenance),
    [fieldProvenance],
  );

  const showPersonalAddressHelper = useMemo(
    () => hasExtractedInpiAddressInGroup(fieldProvenance, PERSONAL_ADDRESS_KEYS),
    [fieldProvenance],
  );

  const showEstablishmentAddressHelper = useMemo(
    () => hasExtractedInpiAddressInGroup(fieldProvenance, ESTABLISHMENT_ADDRESS_KEYS),
    [fieldProvenance],
  );

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

          <ProvenanceField
            fieldKey="lastName"
            label="Nom"
            value={values.lastName ?? ""}
            onChange={(lastName) => update({ lastName })}
            provenance={fieldProvenance.lastName}
            delayMs={60}
          />
          <ProvenanceField
            fieldKey="firstName"
            label="Prénom"
            value={values.firstName ?? ""}
            onChange={(firstName) => update({ firstName })}
            provenance={fieldProvenance.firstName}
            delayMs={120}
          />
          <ProvenanceField
            fieldKey="siren"
            label="SIREN"
            value={values.siren ?? ""}
            onChange={(siren) => update({ siren })}
            provenance={fieldProvenance.siren}
            delayMs={180}
          />
          <ProvenanceField
            fieldKey="email"
            label="Email"
            type="email"
            value={values.email ?? ""}
            onChange={(email) => update({ email })}
            provenance={fieldProvenance.email}
            delayMs={240}
          />
          <ProvenanceField
            fieldKey="telephone"
            label="Téléphone"
            type="tel"
            value={values.telephone ?? ""}
            onChange={(telephone) => update({ telephone })}
            provenance={fieldProvenance.telephone}
            delayMs={300}
          />
        </>
      ) : null}

      {visibleSections >= 3 ? (
        <>
          <SectionTitle
            helper={showPersonalAddressHelper ? ADDRESS_HELPER : undefined}
          >
            Adresse personnelle
          </SectionTitle>

          <ProvenanceField
            fieldKey="personalAddress"
            label="Adresse"
            value={values.personalAddress ?? ""}
            onChange={(personalAddress) => update({ personalAddress })}
            provenance={fieldProvenance.personalAddress}
            delayMs={60}
          />
          <ProvenanceField
            fieldKey="personalCity"
            label="Ville"
            value={values.personalCity ?? ""}
            onChange={(personalCity) => update({ personalCity })}
            provenance={fieldProvenance.personalCity}
            delayMs={120}
          />
          <ProvenanceField
            fieldKey="personalPostalCode"
            label="Code postal"
            value={values.personalPostalCode ?? ""}
            onChange={(personalPostalCode) => update({ personalPostalCode })}
            provenance={fieldProvenance.personalPostalCode}
            delayMs={180}
          />
        </>
      ) : null}

      {visibleSections >= 4 ? (
        <>
          <SectionTitle
            helper={showEstablishmentAddressHelper ? ADDRESS_HELPER : undefined}
          >
            {ACTIVITE_ESTABLISHMENT_ADDRESS_LABEL}
          </SectionTitle>

          <ProvenanceField
            fieldKey="establishmentAddress"
            label="Adresse"
            value={values.establishmentAddress ?? ""}
            onChange={(establishmentAddress) => update({ establishmentAddress })}
            provenance={fieldProvenance.establishmentAddress}
            inputRef={establishmentAddressInputRef}
            delayMs={60}
          />
          <ProvenanceField
            fieldKey="establishmentCity"
            label="Ville"
            value={values.establishmentCity ?? ""}
            onChange={(establishmentCity) => update({ establishmentCity })}
            provenance={fieldProvenance.establishmentCity}
            delayMs={120}
          />
          <ProvenanceField
            fieldKey="establishmentPostalCode"
            label="Code postal"
            value={values.establishmentPostalCode ?? ""}
            onChange={(establishmentPostalCode) => update({ establishmentPostalCode })}
            provenance={fieldProvenance.establishmentPostalCode}
            delayMs={180}
          />

          {showEstablishmentProposalActions ? (
            <div
              className="mt-4 flex flex-wrap items-center gap-3 animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
              data-establishment-proposal-actions
            >
              <Button
                variant="secondary"
                onClick={() => onConfirmEstablishmentProposal?.()}
              >
                Confirmer
              </Button>
              <button
                type="button"
                onClick={() => establishmentAddressInputRef.current?.focus()}
                style={{
                  ...typography.caption.desktop,
                  color: colors.text.muted,
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                Modifier
              </button>
            </div>
          ) : null}

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
      <div className="text-center">
        <h2
          className="text-2xl sm:text-3xl"
          style={{
            fontFamily: typography.fontFamily.display,
            fontWeight: typography.fontWeight.regular,
            color: colors.text.primary,
          }}
        >
          {CARD_TITLE}
        </h2>
        <p
          className="mx-auto mt-3 max-w-2xl"
          style={{ ...typography.body.desktop, color: colors.text.secondary }}
        >
          {CARD_SUBTITLE}
        </p>
      </div>
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
