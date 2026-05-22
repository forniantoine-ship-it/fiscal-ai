"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  nextDocumentStepId,
  documentJourneyStepHref,
} from "@/lib/lmnp/constants/document-journey";
import { buildInpiDetection, type InpiProfile } from "@/lib/lmnp/services/inpi-profile";
import {
  inpiJourneyHref,
  isDocumentJourneyStarted,
} from "@/lib/lmnp/engine/document-journey-progress";
import { useLmnp } from "@/lib/lmnp/store";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { FormField, TextInput, PrimaryButton } from "@/components/lmnp/design-system";

function toWorkspace(ws: ReturnType<typeof useLmnp>["workspace"]): PersistedWorkspace {
  return {
    fiscalYear: ws.fiscalYear,
    properties: ws.properties,
    documents: ws.documents,
    extractions: ws.extractions,
    validationItems: ws.validationItems,
    ledgerEntries: ws.ledgerEntries,
    declarationDraft: ws.declarationDraft,
  };
}

export function InpiValidationStep() {
  const router = useRouter();
  const { workspace, dispatch } = useLmnp();
  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const uploadHref = `${base}/piece/inpi`;
  const ws = toWorkspace(workspace);

  const inpiDoc = workspace.documents.find(
    (d) => d.id === workspace.declarationDraft?.inpiDocumentId,
  );

  const detection = inpiDoc
    ? buildInpiDetection(workspace, inpiDoc)
    : { profile: {}, checks: [] };

  const [form, setForm] = useState<InpiProfile>(() => detection.profile);

  useEffect(() => {
    if (!isDocumentJourneyStarted(ws)) {
      router.replace(base);
      return;
    }
    if (workspace.declarationDraft?.inpiConfirmedAt) {
      router.replace(inpiJourneyHref(workspace.fiscalYear.id, ws));
      return;
    }
    if (!inpiDoc || (inpiDoc.status !== "analyzed" && inpiDoc.status !== "failed")) {
      router.replace(uploadHref);
    }
  }, [
    ws,
    workspace.declarationDraft?.inpiConfirmedAt,
    inpiDoc,
    router,
    base,
    uploadHref,
  ]);

  useEffect(() => {
    if (inpiDoc?.status === "analyzed") {
      const det = buildInpiDetection(workspace, inpiDoc);
      setForm(det.profile);
    }
  }, [inpiDoc?.id, inpiDoc?.status, workspace.extractions]);

  const confirmAndContinue = () => {
    dispatch({
      type: "CONFIRM_INPI_PROFILE",
      profile: {
        siren: form.siren,
        siret: form.siret,
        firstName: form.firstName,
        lastName: form.lastName,
        address: form.address,
        city: form.city,
        postalCode: form.postalCode,
      },
      documentId: workspace.declarationDraft?.inpiDocumentId,
    });
    const next = nextDocumentStepId("inpi");
    router.push(
      next ? documentJourneyStepHref(workspace.fiscalYear.id, next) : base,
    );
  };

  if (!inpiDoc || inpiDoc.status !== "analyzed") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-stone-500">
        Chargement…
      </div>
    );
  }

  const det = buildInpiDetection(workspace, inpiDoc);

  return (
    <div className="mx-auto max-w-lg animate-fade-in px-4 py-12 sm:py-16">
      <p className="text-[11px] text-stone-400">Étape 2 · Vérification IA</p>
      <h1
        className="mt-4 text-[1.65rem] font-normal leading-snug text-stone-800 sm:text-[1.75rem]"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Vérifiez les informations extraites
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-stone-500">
        L’IA a lu votre document INPI. Corrigez si besoin, puis confirmez pour continuer.
      </p>

      <ul className="mt-10 space-y-3">
        {det.checks.map((c) => (
          <li key={c.id} className="flex items-center gap-3 text-[14px] text-stone-600">
            <span className={c.ok ? "text-accent" : "text-stone-300"}>
              {c.ok ? "✓" : "·"}
            </span>
            {c.label}
          </li>
        ))}
      </ul>

      <div className="mt-10 space-y-5">
        <FormField label="Nom">
          <TextInput
            value={form.lastName ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
          />
        </FormField>
        <FormField label="Prénom">
          <TextInput
            value={form.firstName ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
          />
        </FormField>
        <FormField label="SIREN">
          <TextInput
            value={form.siren ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, siren: e.target.value }))}
            inputMode="numeric"
          />
        </FormField>
        <FormField label="SIRET">
          <TextInput
            value={form.siret ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, siret: e.target.value }))}
            inputMode="numeric"
          />
        </FormField>
        <FormField label="Adresse">
          <TextInput
            value={form.address ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Code postal">
            <TextInput
              value={form.postalCode ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
            />
          </FormField>
          <FormField label="Ville">
            <TextInput
              value={form.city ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </FormField>
        </div>
        <div className="pt-6">
          <PrimaryButton onClick={confirmAndContinue}>Confirmer et continuer</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
