"use client";

import { useState } from "react";
import type { DocumentType, LmnpDocument } from "@/lib/lmnp/types";
import type { FieldKey } from "@/lib/lmnp/types/field-keys";
import { FIELD_REGISTRY } from "@/lib/lmnp/types/field-keys";
import { moneyFromInput, textValue } from "@/lib/lmnp/types/values";
import { useLmnp } from "@/lib/lmnp/store";

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
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-amber-200">Saisie manuelle recommandée</h4>
          <p className="mt-1 text-xs text-stone-500">
            {warnings[0] ??
              "Aucun montant fiable n'a pu être extrait automatiquement. Mieux vaut saisir vous-même que d'importer une valeur incorrecte."}
          </p>
        </div>
      </div>

      {warnings.length > 1 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-500">
          {warnings.slice(1).map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-stone-600">
          Champ à renseigner
          <select
            value={selectedField}
            onChange={(e) => {
              setSelectedField(e.target.value as FieldKey);
              setInput("");
              setError(null);
            }}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500/40"
          >
            {suggested.map((key) => (
              <option key={key} value={key} className="bg-white">
                {FIELD_REGISTRY[key].label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-stone-600">
          {selectedField === "property.address" ? "Adresse" : "Montant (€)"}
          <input
            type="text"
            inputMode={selectedField === "property.address" ? "text" : "decimal"}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={selectedField === "property.address" ? "12 rue Example, 69001 Lyon" : "0,00"}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500/40"
          />
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="button"
          onClick={handleAdd}
          className="w-full rounded-full bg-amber-500/15 py-2.5 text-sm font-medium text-amber-300 ring-1 ring-amber-500/30 hover:bg-amber-500/25"
        >
          Ajouter pour validation
        </button>

        {addedCount > 0 && (
          <p className="text-center text-xs text-accent/90">
            {addedCount} champ{addedCount > 1 ? "s" : ""} ajouté{addedCount > 1 ? "s" : ""} — confirmez ci-dessus
          </p>
        )}
      </div>
    </div>
  );
}
