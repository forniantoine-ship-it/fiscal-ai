"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { GuidedStepLayout } from "@/components/lmnp/design-system/GuidedStepLayout";
import { FormField, SelectInput, TextInput } from "@/components/lmnp/design-system/FormField";
import {
  DECLARATION_FLOW,
  type DeclarationStepId,
  declarationStepHref,
  getDeclarationStep,
  nextDeclarationStepId,
  prevDeclarationStepId,
  declarationStepIndex,
} from "@/lib/lmnp/constants/declaration-flow";
import { useLmnp } from "@/lib/lmnp/store";

const VALID_IDS = new Set(DECLARATION_FLOW.map((s) => s.id));

export default function DeclarationStepPage() {
  const params = useParams();
  const router = useRouter();
  const { workspace, dispatch } = useLmnp();
  const fiscalYearId = params.id as string;
  const stepId = params.stepId as DeclarationStepId;
  const draft = workspace.declarationDraft ?? { completedSteps: [] };
  const property = workspace.properties[0];

  if (!VALID_IDS.has(stepId) || stepId === "documents") {
    router.replace(`/app/exercices/${fiscalYearId}`);
    return null;
  }

  const step = getDeclarationStep(stepId);
  const stepIndex = declarationStepIndex(stepId) + 1;
  const total = DECLARATION_FLOW.length;
  const base = `/app/exercices/${fiscalYearId}`;
  const prevId = prevDeclarationStepId(stepId);
  const nextId = nextDeclarationStepId(stepId);
  const backHref = prevId ? declarationStepHref(fiscalYearId, prevId) : base;
  const nextHref = nextId ? declarationStepHref(fiscalYearId, nextId) : base;

  const [siren, setSiren] = useState(draft.siren ?? "");
  const [firstName, setFirstName] = useState(draft.exploitantFirstName ?? "");
  const [lastName, setLastName] = useState(draft.exploitantLastName ?? "");
  const [address, setAddress] = useState(property?.address ?? "");
  const [city, setCity] = useState(property?.city ?? "");
  const [postal, setPostal] = useState(property?.postalCode ?? "");
  const [regimeSocial, setRegimeSocial] = useState(draft.regimeSocial ?? "");
  const [tva, setTva] = useState(draft.tvaRegime ?? "");

  const completeAndGo = (patch: Record<string, unknown>) => {
    dispatch({ type: "DECLARATION_PATCH_DRAFT", patch });
    dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId });
    router.push(nextHref);
  };

  const renderBody = () => {
    switch (stepId) {
      case "siren":
        return (
          <FormField label="Numéro SIREN" hint="9 chiffres de votre activité LMNP">
            <TextInput
              value={siren}
              onChange={(e) => setSiren(e.target.value)}
              placeholder="123 456 789"
              inputMode="numeric"
            />
          </FormField>
        );
      case "exploitant":
        return (
          <div className="space-y-6">
            <FormField label="Prénom">
              <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </FormField>
            <FormField label="Nom">
              <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </FormField>
          </div>
        );
      case "logement":
        return (
          <div className="space-y-6">
            <FormField label="Adresse">
              <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
            </FormField>
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField label="Code postal">
                <TextInput value={postal} onChange={(e) => setPostal(e.target.value)} />
              </FormField>
              <FormField label="Ville">
                <TextInput value={city} onChange={(e) => setCity(e.target.value)} />
              </FormField>
            </div>
          </div>
        );
      case "usages-personnels":
        return (
          <p className="text-[15px] leading-relaxed text-stone-500">
            Indiquez si une partie du logement est utilisée à titre personnel. Si non, confirmez
            simplement pour continuer.
          </p>
        );
      case "bareme-carburant":
        return (
          <p className="text-[15px] leading-relaxed text-stone-500">
            Les déplacements liés à la gestion locative peuvent relever du barème kilométrique. Si
            cela ne vous concerne pas, passez à l’étape suivante.
          </p>
        );
      case "regime-social":
        return (
          <FormField label="Régime social">
            <SelectInput value={regimeSocial} onChange={(e) => setRegimeSocial(e.target.value)}>
              <option value="">Choisir…</option>
              <option value="ssi">SSI</option>
              <option value="general">Régime général</option>
              <option value="tns">TNS</option>
            </SelectInput>
          </FormField>
        );
      case "tva":
        return (
          <FormField label="Régime TVA">
            <SelectInput value={tva} onChange={(e) => setTva(e.target.value)}>
              <option value="">Choisir…</option>
              <option value="franchise">Franchise en base</option>
              <option value="reel-simplifie">Réel simplifié</option>
              <option value="reel-normal">Réel normal</option>
            </SelectInput>
          </FormField>
        );
      case "signature":
        return (
          <p className="text-[15px] leading-relaxed text-stone-500">
            Votre liasse sera signée électroniquement après paiement. Un email vous guidera pour la
            signature sécurisée.
          </p>
        );
      default:
        return (
          <p className="text-stone-500">
            Cette étape s’ouvre dans l’écran dédié. Utilisez le bouton ci-dessous.
          </p>
        );
    }
  };

  const handleNext = () => {
    switch (stepId) {
      case "siren":
        completeAndGo({ siren: siren.trim() });
        break;
      case "exploitant":
        completeAndGo({
          exploitantFirstName: firstName.trim(),
          exploitantLastName: lastName.trim(),
        });
        break;
      case "logement":
        if (property) {
          dispatch({
            type: "UPDATE_PROPERTY",
            propertyId: property.id,
            patch: { address: address.trim(), city: city.trim(), postalCode: postal.trim() },
          });
        }
        completeAndGo({});
        break;
      case "usages-personnels":
        completeAndGo({ usagesPersonnelsConfirmed: true });
        break;
      case "bareme-carburant":
        completeAndGo({ baremeCarburantConfirmed: true });
        break;
      case "regime-social":
        completeAndGo({ regimeSocial });
        break;
      case "tva":
        completeAndGo({ tvaRegime: tva });
        break;
      case "signature":
        completeAndGo({ signedAt: new Date().toISOString() });
        break;
      default:
        router.push(nextHref);
    }
  };

  const canContinue =
    stepId === "usages-personnels" ||
    stepId === "bareme-carburant" ||
    stepId === "signature" ||
    (stepId === "siren" && siren.trim().length >= 9) ||
    (stepId === "exploitant" && firstName.trim() && lastName.trim()) ||
    (stepId === "logement" && address.trim() && city.trim()) ||
    (stepId === "regime-social" && regimeSocial) ||
    (stepId === "tva" && tva);

  return (
    <GuidedStepLayout
      stepIndex={stepIndex}
      totalSteps={total}
      title={step.title}
      subtitle={step.subtitle}
      backHref={backHref}
      onNext={handleNext}
      nextLabel="Continuer"
      nextDisabled={!canContinue}
      dashboardHref={base}
    >
      {renderBody()}
    </GuidedStepLayout>
  );
}
