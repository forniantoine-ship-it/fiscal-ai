"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";
import { planAddProperty, PROPERTY_LABEL_MAX_LENGTH, resolveAddPropertyEligibility, type AddPropertyRefusal } from "@/lib/lmnp/dossier/add-property-plan";
import { isMultiPropertyWorkspace, type MultiPropertyCapabilities } from "@/lib/lmnp/dossier/multi-property-activation";
import { describeMultiPropertyDomainReasons } from "@/lib/lmnp/dossier/multi-property-domain-messages";
import { recordMultiPropertyAttestation, type MultiPropertyAttestationAnswer, type MultiPropertyAttestationKind } from "@/lib/lmnp/dossier/multi-property-attestations";
import { resolveMultiPropertyDomainReadiness } from "@/lib/lmnp/dossier/multi-property-readiness";
import { deriveProductionScope, PRODUCTION_VALIDATION_HREF } from "@/lib/lmnp/dossier/production-dossier-scope";
import { useLmnp } from "@/lib/lmnp/store";
import { resolveAddPropertyOutcome, toConfirmedSave } from "./add-property-return";
import { DomainReadinessList } from "./DomainReadinessList";
import { MultiPropertyAttestationsForm } from "./MultiPropertyAttestationsForm";
import { buildPropertySelectorItems } from "./property-selector-model";

const REFUSALS: Partial<Record<AddPropertyRefusal, string>> = {
  edition_not_enabled: "L’ajout de plusieurs biens n’est pas encore disponible.",
  domain_unsupported: "Votre dossier ne peut pas passer en plusieurs biens : voir les raisons ci-dessous.",
  invalid_label: `Donnez un nom au bien (${PROPERTY_LABEL_MAX_LENGTH} caractères maximum).`,
  fiscal_year_locked: "Cet exercice n’est plus modifiable.",
  pending_service_date_change: "Terminez d’abord la modification de la date de mise en service en cours.",
};

/**
 * MB-MULTI-UX-1 — écran « Mes biens » (propriété d'ACTIVITÉ) : liste des biens, ajout d'un bien, attestations d'activité et points
 * à traiter. DORMANT : « Ajouter un bien » n'existe que si la capacité d'ÉDITION multi est ouverte (jamais en production).
 * L'ajout réutilise l'unique transition ADD_PROPERTY ; le bien créé devient le bien actif (retour au dossier sur ce bien, après
 * enregistrement confirmé côté serveur).
 */
export function PropertiesManager({ capabilities }: { capabilities?: MultiPropertyCapabilities }) {
  const { workspace, dispatch, resolveDeliveryRevision } = useLmnp();
  const urlScope = useV3CorrectionScope();
  // Production : sans scope d'URL, le scope est dérivé du dossier DÉJÀ chargé (revérifié côté serveur par la porte d'entrée).
  const scope = useMemo(() => urlScope ?? deriveProductionScope(workspace), [urlScope, workspace]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [unsavedId, setUnsavedId] = useState<string | null>(null);
  const handled = useRef<string | null>(null);

  const multi = isMultiPropertyWorkspace(workspace);
  const eligibility = useMemo(() => resolveAddPropertyEligibility(workspace, { capabilities }), [workspace, capabilities]);
  const entryReasons = eligibility.status === "unsupported" ? describeMultiPropertyDomainReasons(eligibility.reasons, workspace.properties) : [];
  const items = useMemo(
    () => buildPropertySelectorItems({ properties: workspace.properties, propertyIds: workspace.fiscalYear.propertyIds, activePropertyId: undefined, scope, pathname: "/assistants/logement" }),
    [workspace.properties, workspace.fiscalYear.propertyIds, scope],
  );
  const readiness = useMemo(() => (multi ? resolveMultiPropertyDomainReadiness(workspace) : { status: "not_multi" as const }), [multi, workspace]);

  // L'issue est décidée par le SEUL résultat d'enregistrement serveur : jamais de succès affiché sans confirmation, jamais d'échec affiché
  // pour un bien réellement enregistré.
  async function finishAdd(newPropertyId: string) {
    const save = toConfirmedSave(await resolveDeliveryRevision());
    const outcome = resolveAddPropertyOutcome({ workspace, scope: urlScope, newPropertyId, save });
    if (outcome.kind === "unsaved") {
      setError("Le bien a été ajouté mais n’a pas pu être enregistré. Réessayez l’enregistrement avant de continuer.");
      setUnsavedId(newPropertyId);
      setPendingId(null);
      return;
    }
    setError(null);
    setUnsavedId(null);
    setPendingId(null);
    if (outcome.kind === "navigate") window.location.assign(outcome.href);
    else setNotice("Le bien a été ajouté et enregistré.");
  }

  // Après dispatch : attendre que le workspace porte le nouveau bien, puis confirmer l'enregistrement serveur.
  useEffect(() => {
    if (!pendingId || handled.current === pendingId || !workspace.properties.some((property) => property.id === pendingId)) return;
    handled.current = pendingId;
    void finishAdd(pendingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `finishAdd` lit le workspace courant ; l'effet est déclenché par `pendingId` / le workspace.
  }, [pendingId, workspace]);

  function addProperty() {
    setError(null);
    setNotice(null);
    const plan = planAddProperty(workspace, { label }, { capabilities });
    if (!plan.ok) {
      setError(REFUSALS[plan.reason] ?? "Le bien ne peut pas être ajouté pour le moment.");
      return;
    }
    dispatch({ type: "ADD_PROPERTY", property: plan.property });
    setPendingId(plan.activePropertyId);
  }

  function retrySave() {
    if (unsavedId) void finishAdd(unsavedId);
  }

  function answer(kind: MultiPropertyAttestationKind, value: MultiPropertyAttestationAnswer) {
    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: { multiPropertyAttestations: recordMultiPropertyAttestation(workspace.declarationDraft?.multiPropertyAttestations, kind, value, new Date().toISOString()) },
    });
  }

  const reasons = readiness.status === "unsupported" ? describeMultiPropertyDomainReasons(readiness.reasons, workspace.properties) : [];
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <header>
        <h1 className="text-xl font-medium">Mes biens</h1>
        <p className="mt-1 text-sm text-ink-muted">Chaque bien se renseigne séparément ; la déclaration porte sur l’ensemble de votre activité.</p>
      </header>

      <section aria-label="Liste des biens" className="rounded-lg border p-4">
        <ul role="list" className="flex flex-col gap-2 text-sm">
          {items.map((item) => (
            <li key={item.propertyId} className="flex items-center justify-between gap-3">
              <span>{item.label}</span>
              {multi && item.href ? <a className="underline" href={item.href}>Renseigner ce bien</a> : null}
            </li>
          ))}
        </ul>
      </section>

      {eligibility.status === "eligible" ? (
        <section aria-label="Ajouter un bien" className="flex flex-col gap-2 rounded-lg border p-4">
          <label className="text-sm font-medium" htmlFor="new-property-label">Nom du nouveau bien</label>
          <input id="new-property-label" className="rounded-md border px-3 py-2 text-sm" value={label} maxLength={PROPERTY_LABEL_MAX_LENGTH} onChange={(event) => setLabel(event.target.value)} />
          <button type="button" className="self-start rounded-md border px-4 py-2 text-sm font-medium" disabled={pendingId !== null || unsavedId !== null} onClick={addProperty}>Ajouter un bien</button>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          {unsavedId ? <button type="button" className="self-start rounded-md border px-4 py-2 text-sm font-medium" onClick={retrySave}>Réessayer l’enregistrement</button> : null}
          {notice ? <p role="status" className="text-sm">{notice}</p> : null}
        </section>
      ) : eligibility.status === "unsupported" ? (
        <section aria-label="Ajout d’un bien impossible" className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
          <p role="status">{REFUSALS.domain_unsupported}</p>
          <ul role="list" className="list-disc pl-5">
            {entryReasons.map((reason) => <li key={`${reason.code}-${reason.propertyId ?? ""}`}>{reason.message}</li>)}
          </ul>
        </section>
      ) : (
        <p role="status" className="rounded-lg border p-3 text-sm text-ink-muted">{REFUSALS.edition_not_enabled}</p>
      )}

      {multi ? <a href={PRODUCTION_VALIDATION_HREF} className="text-sm underline">Passer à la validation de mon dossier</a> : null}

      {multi ? (
        <>
          <MultiPropertyAttestationsForm attestations={workspace.declarationDraft?.multiPropertyAttestations} onAnswer={answer} />
          <DomainReadinessList reasons={reasons} supported={readiness.status === "supported"} />
        </>
      ) : null}
    </main>
  );
}
