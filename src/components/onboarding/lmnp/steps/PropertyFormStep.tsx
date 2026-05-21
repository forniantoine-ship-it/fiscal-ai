"use client";

import type { OcrExtractedField, PropertyFormData } from "../types";

interface PropertyFormStepProps {
  data: PropertyFormData;
  ocrFields: OcrExtractedField[];
  onChange: (data: PropertyFormData) => void;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-500 transition-colors focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/25";

export function PropertyFormStep({ data, ocrFields, onChange }: PropertyFormStepProps) {
  const update = (key: keyof PropertyFormData, value: string) => {
    onChange({ ...data, [key]: value });
  };

  const applyOcrRent = () => {
    const rent = ocrFields.find((f) => f.label.includes("Loyers"));
    if (rent) update("annualRent", rent.value.replace(/[^\d,]/g, "").replace(",", "."));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
          Informations du bien locatif
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Complétez les données de votre logement meublé. Les champs pré-remplis proviennent de
          l&apos;analyse OCR.
        </p>
      </div>

      {ocrFields.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
          <p className="text-xs text-accent/90">
            {ocrFields.length} montants détectés par OCR — appliquez-les ou corrigez-les ci-dessous.
          </p>
          <button
            type="button"
            onClick={applyOcrRent}
            className="shrink-0 rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent ring-1 ring-accent/25 hover:bg-accent-muted"
          >
            Appliquer les loyers OCR
          </button>
        </div>
      )}

      <section className="glass space-y-4 rounded-2xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
          Localisation
        </h3>
        <Field label="Adresse du bien">
          <input
            type="text"
            className={inputClass}
            placeholder="12 rue de la Paix"
            value={data.address}
            onChange={(e) => update("address", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code postal">
            <input
              type="text"
              className={inputClass}
              placeholder="75002"
              value={data.postalCode}
              onChange={(e) => update("postalCode", e.target.value)}
            />
          </Field>
          <Field label="Ville">
            <input
              type="text"
              className={inputClass}
              placeholder="Paris"
              value={data.city}
              onChange={(e) => update("city", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="glass space-y-4 rounded-2xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
          Acquisition & surface
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date d'acquisition" hint="Format JJ/MM/AAAA">
            <input
              type="date"
              className={inputClass}
              value={data.acquisitionDate}
              onChange={(e) => update("acquisitionDate", e.target.value)}
            />
          </Field>
          <Field label="Prix d'acquisition (€)">
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              placeholder="285 000"
              value={data.acquisitionPrice}
              onChange={(e) => update("acquisitionPrice", e.target.value)}
            />
          </Field>
          <Field label="Surface (m²)">
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              placeholder="42"
              value={data.surfaceM2}
              onChange={(e) => update("surfaceM2", e.target.value)}
            />
          </Field>
          <Field label="Valeur du mobilier (€)" hint="Amortissable sur 5 à 7 ans">
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              placeholder="12 500"
              value={data.furnitureValue}
              onChange={(e) => update("furnitureValue", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="glass space-y-4 rounded-2xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
          Revenus & charges (année 2025)
        </h3>
        <Field label="Régime fiscal">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  id: "reel" as const,
                  title: "Régime réel",
                  desc: "Charges réelles + amortissements",
                },
                {
                  id: "micro-bic" as const,
                  title: "Micro-BIC",
                  desc: "Abattement 50 % (plafond 77 700 €)",
                },
              ] as const
            ).map((regime) => (
              <button
                key={regime.id}
                type="button"
                onClick={() => update("regime", regime.id)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  data.regime === regime.id
                    ? "border-accent/35 bg-accent/10 ring-1 ring-accent/25"
                    : "border-stone-200 bg-stone-100/80 hover:border-stone-300"
                }`}
              >
                <p className="text-sm font-semibold text-stone-900">{regime.title}</p>
                <p className="mt-1 text-xs text-stone-500">{regime.desc}</p>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Loyers annuels (€)">
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              placeholder="18 240"
              value={data.annualRent}
              onChange={(e) => update("annualRent", e.target.value)}
            />
          </Field>
          <Field label="Taxe foncière (€)">
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              placeholder="1 420"
              value={data.propertyTax}
              onChange={(e) => update("propertyTax", e.target.value)}
            />
          </Field>
          <Field label="Intérêts d'emprunt (€)">
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              placeholder="4 680"
              value={data.loanInterest}
              onChange={(e) => update("loanInterest", e.target.value)}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}
