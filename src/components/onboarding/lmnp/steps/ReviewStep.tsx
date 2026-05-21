"use client";

import type { PropertyFormData, UploadedDocument } from "../types";
import { DOCUMENT_CATEGORIES } from "../types";

interface ReviewStepProps {
  documents: UploadedDocument[];
  property: PropertyFormData;
  onSubmit: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-stone-200 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-stone-500">{label}</span>
      <span className="text-sm font-medium text-stone-900">{value || "—"}</span>
    </div>
  );
}

export function ReviewStep({ documents, property, onSubmit }: ReviewStepProps) {
  const regimeLabel = property.regime === "reel" ? "Régime réel" : "Micro-BIC";
  const addressLine = [property.address, property.postalCode, property.city]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
          Récapitulatif de votre dossier LMNP
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Vérifiez les informations avant de générer votre liasse fiscale 2031 / 2033.
        </p>
      </div>

      <section className="glass rounded-2xl p-5">
        <h3 className="mb-2 text-sm font-semibold text-accent">Documents ({documents.length})</h3>
        {documents.length === 0 ? (
          <p className="text-sm text-stone-500">Aucun document téléversé</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((doc) => (
              <li key={doc.id} className="flex justify-between text-sm text-stone-700">
                <span className="truncate">{doc.name}</span>
                <span className="shrink-0 text-stone-500">
                  {DOCUMENT_CATEGORIES.find((c) => c.id === doc.category)?.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass rounded-2xl p-5">
        <h3 className="mb-2 text-sm font-semibold text-accent">Bien locatif</h3>
        <Row label="Adresse" value={addressLine} />
        <Row label="Acquisition" value={property.acquisitionDate} />
        <Row label="Prix d'acquisition" value={property.acquisitionPrice ? `${property.acquisitionPrice} €` : ""} />
        <Row label="Surface" value={property.surfaceM2 ? `${property.surfaceM2} m²` : ""} />
        <Row label="Régime" value={regimeLabel} />
        <Row label="Loyers annuels" value={property.annualRent ? `${property.annualRent} €` : ""} />
      </section>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-sm text-amber-200/90">
          <strong className="font-semibold">Estimation fiscale préliminaire</strong> — En régime réel,
          avec amortissement du bien et du mobilier, votre résultat BIC estimé pourrait être proche de
          zéro imposable, sous réserve de validation par un expert-comptable.
        </p>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-stone-900/5 transition-all hover:opacity-90 sm:w-auto"
      >
        Générer ma liasse LMNP 2025
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </button>
    </div>
  );
}
