"use client";

import { useState } from "react";
import type { DocumentType, LmnpDocument } from "@/lib/lmnp/types";
import type { FieldKey } from "@/lib/lmnp/types/field-keys";
import { FIELD_REGISTRY } from "@/lib/lmnp/types/field-keys";
import { moneyFromInput, textValue } from "@/lib/lmnp/types/values";
import { useLmnp } from "@/lib/lmnp/store";
import { Button } from "@/design-system/components/Button";
import { Input, Select } from "@/design-system/components/Input";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

const SUGGESTED_FIELDS: Partial<Record<DocumentType, FieldKey[]>> = {
  lease_contract: ["income.annualRent", "property.address"],
  rent_receipt: ["income.annualRent"],
  rent_bank_statement: ["income.annualRent"],
  property_tax: ["expense.propertyTax", "property.address"],
  insurance_invoice: ["expense.insurance"],
  condo_charges: ["expense.condo"],
  works_invoice: ["expense.worksDeductible"],
  furniture_invoice: ["amort.furnitureAnnual"],
  loan_interest_certificate: ["loan.annualInterest"],
  loan_schedule: ["loan.annualInterest"],
  notary_deed: ["amort.buildingAnnual", "property.address"],
};

interface ManualExtractionFallbackProps {
  document: LmnpDocument;
  warnings?: string[];
}

export function ManualExtractionFallback({ document, warnings = [] }: ManualExtractionFallbackProps) {
  const { dispatch } = useLmnp();
  const suggested = SUGGESTED_FIELDS[document.documentType] ?? ["expense.other"];
  const [selectedField, setSelectedField] = useState<FieldKey>(suggested[0]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  const handleAdd = () => {
    setError(null);

    let value;
    if (selectedField === "property.address") {
      if (!input.trim()) {
        setError("Saisissez une adresse.");
        return;
      }
      value = textValue(input.trim());
    } else {
      value = moneyFromInput(input);
      if (!value) {
        setError("Montant invalide — ex. 1 234,56");
        return;
      }
    }

    dispatch({
      type: "ADD_MANUAL_EXTRACTION",
      documentId: document.id,
      fieldKey: selectedField,
      value,
    });
    setInput("");
    setAddedCount((c) => c + 1);
  };

  return (
    <div
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${colors.warning.border}`,
        backgroundColor: colors.warning.surface,
        padding: spacing.scale[5],
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center"
          style={{
            borderRadius: radius.lg,
            backgroundColor: colors.surface.primary,
            color: colors.warning.DEFAULT,
            border: `1px solid ${colors.warning.border}`,
          }}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h4 style={{ ...typography.body.desktop, color: colors.warning.DEFAULT, fontWeight: typography.fontWeight.medium }}>
            Saisie manuelle recommandée
          </h4>
          <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            {warnings[0] ??
              "Aucun montant fiable n'a pu être extrait automatiquement. Mieux vaut saisir vous-même que d'importer une valeur incorrecte."}
          </p>
        </div>
      </div>

      {warnings.length > 1 ? (
        <ul
          className="mt-3 space-y-1"
          style={{
            borderRadius: radius.md,
            backgroundColor: colors.surface.inset,
            padding: spacing.scale[3],
            ...typography.caption.desktop,
            color: colors.text.muted,
          }}
        >
          {warnings.slice(1).map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 space-y-3">
        <label className="block">
          <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>Champ à renseigner</span>
          <Select
            value={selectedField}
            onChange={(event) => {
              setSelectedField(event.target.value as FieldKey);
              setInput("");
              setError(null);
            }}
            className="mt-2"
          >
            {suggested.map((key) => (
              <option key={key} value={key}>
                {FIELD_REGISTRY[key].label}
              </option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
            {selectedField === "property.address" ? "Adresse" : "Montant (€)"}
          </span>
          <Input
            type="text"
            inputMode={selectedField === "property.address" ? "text" : "decimal"}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => event.key === "Enter" && handleAdd()}
            placeholder={selectedField === "property.address" ? "12 rue Example, 69001 Lyon" : "0,00"}
            className="mt-2"
          />
        </label>

        {error ? (
          <p style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>{error}</p>
        ) : null}

        <Button onClick={handleAdd} variant="secondary" className="w-full">
          Ajouter pour validation
        </Button>

        {addedCount > 0 ? (
          <p className="text-center" style={{ ...typography.caption.desktop, color: colors.text.accent }}>
            {addedCount} champ{addedCount > 1 ? "s" : ""} ajouté{addedCount > 1 ? "s" : ""} — confirmez ci-dessus
          </p>
        ) : null}
      </div>
    </div>
  );
}
