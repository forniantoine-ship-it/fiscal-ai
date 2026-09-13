"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { F009_QUESTIONS, hasF009Decisions, isQuestionStep, nextMissingQuestion } from "@/runtime/assistants/f009-activite/assistant";
import type { F009Action, F009DocumentFieldKey, F009QuestionStep, F009State } from "@/runtime/assistants/f009-activite/types";

export type F009ViewProps = {
  state: F009State;
  year: number;
  busy: boolean;
  error?: string;
  explanation?: string;
  documents: Array<{ id: string; fileName: string }>;
  onAction: (action: F009Action) => void;
  onFile: (file: File) => void;
  onExistingDocument: (id: string) => void;
  onCompanion: () => void;
  companionLabel?: string;
};
const LABELS: Record<F009DocumentFieldKey, string> = {
  siret: "SIRET", dateDebutActivite: "Début d’activité", lastName: "Nom", firstName: "Prénom", email: "Email", telephone: "Téléphone", personalAddress: "Adresse personnelle", establishmentAddress: "Adresse de l’activité",
};
const QUESTIONS: F009QuestionStep[] = ["identifier", "identity", "address", "activity_date", "service_date"];
const SHORT_LABELS: Record<F009QuestionStep, string> = { identifier: "SIRET / SIREN", identity: "Nom et prénom", address: "Adresse de l’activité", activity_date: "Début d’activité", service_date: "Disponibilité à la location" };
function dateLabel(value?: string): string | undefined {
  if (!value) return undefined;
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}
function Summary({ state }: { state: F009State }) {
  const rows = [
    [state.siret ? "SIRET" : "SIREN", state.siret ?? state.siren],
    ["Nom et prénom", [state.firstName, state.lastName].filter(Boolean).join(" ")],
    [state.establishmentAddress ? "Adresse de l’activité" : "Adresse personnelle utilisée en repli", state.establishmentAddress ?? state.personalAddress],
    ["Début d’activité", dateLabel(state.dateDebutActivite)],
    ["Disponible à la location depuis le", dateLabel(state.dateMiseEnService)],
  ].filter(([, value]) => Boolean(value));
  return <dl className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white px-5">
    {rows.map(([label, value]) => <div key={label} className="py-4 sm:grid sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-stone-500">{label}</dt><dd className="mt-1 break-words font-medium text-stone-900 sm:mt-0">{value}</dd>
    </div>)}
    {!rows.length && <div className="py-5 text-stone-500">Aucune information renseignée pour le moment.</div>}
  </dl>;
}
function Title({ children, help }: { children: ReactNode; help?: string }) {
  return <div className="mb-6"><h2 className="text-2xl font-semibold tracking-tight text-stone-900">{children}</h2>{help && <p className="mt-3 max-w-xl leading-relaxed text-stone-600">{help}</p>}</div>;
}
function Question({ state, onAction, busy }: Pick<F009ViewProps, "state" | "onAction" | "busy">) {
  if (!isQuestionStep(state.step)) return null;
  const step = state.step;
  const initial: Record<string, string> = step === "identity" ? { lastName: state.lastName ?? "", firstName: state.firstName ?? "" }
    : step === "identifier" ? { identifier: state.siret ?? state.siren ?? "" }
    : step === "address" ? { address: state.establishmentAddress ?? state.personalAddress ?? "" }
    : { date: (step === "activity_date" ? state.dateDebutActivite : state.dateMiseEnService) ?? "" };
  const values = state.inputs?.[step] ?? initial;
  const fields = step === "identity" ? [["lastName", "Nom"], ["firstName", "Prénom"]]
    : step === "identifier" ? [["identifier", "SIRET ou SIREN"]]
    : step === "address" ? [["address", "Adresse complète de l’activité"]] : [["date", SHORT_LABELS[step]]];
  return <>
    <Title help={F009_QUESTIONS[step].help}>{F009_QUESTIONS[step].title}</Title>
    <form onSubmit={(event) => { event.preventDefault(); onAction({ type: "answer", values }); }} className="space-y-5">
      {fields.map(([key, label]) => <label key={key} className="block text-sm font-medium text-stone-700">
        {label}
        {step === "address" ? <textarea className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" value={values[key] ?? ""} onChange={(event) => onAction({ type: "stage_input", values: { ...values, [key]: event.target.value } })} placeholder="Numéro et voie, code postal, ville" />
          : <input className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" type={key === "date" ? "date" : "text"} inputMode={step === "identifier" ? "numeric" : undefined} autoComplete={key === "lastName" ? "family-name" : key === "firstName" ? "given-name" : undefined} value={values[key] ?? ""} onChange={(event) => onAction({ type: "stage_input", values: { ...values, [key]: event.target.value } })} />}
      </label>)}
      <Button type="submit" disabled={busy}> {state.editing ? "Enregistrer la modification" : "Continuer"} </Button>
    </form>
    {(step === "identifier" || step === "service_date") && !state.editing && <Button className="mt-4" variant="ghost" disabled={busy} onClick={() => onAction({ type: "defer" })}>Je compléterai plus tard</Button>}
  </>;
}
export function F009ActiviteView({ state, year, busy, error, explanation, documents, onAction, onFile, onExistingDocument, onCompanion, companionLabel }: F009ViewProps) {
  const picker = useRef<HTMLInputElement>(null);
  const missing = nextMissingQuestion(state);
  const conflicts = Object.entries(state.conflicts ?? {}).filter(([field]) => field !== "establishmentAddress" || !state.conflicts?.siret).filter((entry): entry is [F009DocumentFieldKey, NonNullable<F009State["conflicts"]>[F009DocumentFieldKey] & object] => Boolean(entry[1]));
  const openUpload = () => picker.current?.click();
  const completed = state.step === "complete";
  return <main className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6 sm:px-0" aria-busy={busy}>
    <header className="mb-7 flex items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">Votre dossier · Activité</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Votre activité de location meublée</h1></div>
      <span className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-stone-600">{year}</span>
    </header>
    <input ref={picker} type="file" accept=".pdf,image/*" className="hidden" aria-label="Justificatif d’immatriculation" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
    <Card className="!p-6 sm:!p-8">
      {(state.step !== "situation" || Boolean(state.history?.length)) && <div className="mb-6"><Button variant="ghost" disabled={busy && state.step !== "analyzing"} onClick={() => onAction({ type: "go_back" })}>← Retour</Button></div>}
      {(error || state.error) && <p role="alert" className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">{error ?? state.error}</p>}
      {state.step === "situation" && <>
        <Title help="Vous avez effectué votre formalité sur le Guichet unique INPI / RNE et obtenu un numéro SIRET.">Votre activité de location meublée est-elle déjà immatriculée ?</Title>
        <div className="grid gap-3">{([["yes", "Oui"], ["no", "Non, pas encore"], ["unknown", "Je ne sais pas"]] as const).map(([value, label]) => <Button key={value} variant={value === "yes" ? "primary" : "secondary"} disabled={busy} onClick={() => onAction({ type: "select_registration", value })}>{label}</Button>)}</div>
      </>}
      {state.step === "document" && <>
        <Title help="Fiscal AI récupérera automatiquement les informations utiles pour éviter de vous les demander une par une.">{documents.length ? "Un justificatif est déjà dans votre dossier" : "Ajoutez votre justificatif d’immatriculation"}</Title>
        {documents.length > 0 && <div className="mb-5 space-y-3">{documents.map((document) => <div key={document.id} className="rounded-xl border border-stone-200 p-4"><p className="mb-3 break-words text-sm text-stone-700">{document.fileName}</p><Button disabled={busy} onClick={() => onExistingDocument(document.id)}>Utiliser ce document</Button></div>)}</div>}
        <p className="mb-5 text-sm leading-relaxed text-stone-500">Extrait RNE ou synthèse de dépôt du Guichet unique, en PDF ou en image lisible. Pour les autres justificatifs, seules les informations effectivement reconnues seront proposées.</p>
        <div className="flex flex-wrap gap-3"><Button disabled={busy} variant={documents.length ? "secondary" : "primary"} onClick={openUpload}>{documents.length ? "Ajouter un autre document" : "Ajouter mon document"}</Button><Button variant="secondary" disabled={busy} onClick={() => onAction({ type: "manual" })}>Renseigner manuellement</Button></div>
      </>}
      {state.step === "pending_registration" && <>
        <Title help={state.registration === "no" ? "Votre activité doit être déclarée via le Guichet unique. Vous pouvez continuer à préparer votre dossier Fiscal AI et finaliser cette formalité ensuite." : "Vous pouvez vérifier si vous avez reçu un justificatif d’immatriculation ou un numéro SIRET. En attendant, vous pouvez continuer à préparer votre dossier."}>{state.registration === "no" ? "Préparez votre dossier à votre rythme" : "Faisons le point sans vous bloquer"}</Title>
        <p className="mb-6 text-stone-600">Le Compagnon INPI vous accompagnera étape par étape. Vous réaliserez et signerez vous-même votre formalité sur le Guichet unique.</p>
        <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => onAction({ type: "defer" })}>Continuer mon dossier</Button><Button variant="secondary" disabled={busy} onClick={() => onAction({ type: "select_registration", value: "yes" })}>J’ai un justificatif ou un numéro</Button></div>
      </>}
      {state.step === "analyzing" && <div role="status" aria-live="polite"><Title help="Nous lisons le document et recherchons les informations utiles. Vous pourrez les contrôler avant de les utiliser.">Lecture de votre justificatif…</Title><div className="h-1 rounded-full bg-orange-100" /><p className="mt-5 text-sm text-stone-500">Vous pouvez revenir à l’étape précédente. Le document restera dans votre dossier.</p></div>}
      {state.step === "analysis_failed" && <>
        <Title help={state.analysisFailureCause === "network" ? "La connexion a interrompu la lecture du document." : state.analysisFailureCause === "unrecognized" ? "Aucune information utile n’a été reconnue dans ce justificatif. Cela ne signifie pas que votre document est incorrect." : "Le document n’a pas pu être lu. Essayez une version plus lisible ou renseignez les informations manuellement."}>La lecture n’a pas abouti</Title>
        <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => onAction({ type: "retry" })}>Reprendre l’analyse</Button><Button variant="secondary" disabled={busy} onClick={openUpload}>Remplacer le document</Button><Button variant="ghost" disabled={busy} onClick={() => onAction({ type: "continue_manually" })}>Renseigner manuellement</Button></div>
      </>}
      {isQuestionStep(state.step) && <Question state={state} busy={busy} onAction={onAction} />}
      {state.step === "edit" && <><Title help="Choisissez l’information à modifier. Les autres informations restent conservées.">Modifier les informations</Title><div className="grid gap-3">{QUESTIONS.map((step) => <Button key={step} variant="secondary" disabled={busy} onClick={() => onAction({ type: "edit_question", step })}>{SHORT_LABELS[step]}</Button>)}</div></>}
      {state.step === "review" && <>
        <Title help="Vérifiez les informations qui seront utilisées dans votre dossier. Vous pouvez les modifier.">Voici les informations de votre activité</Title>
        <Summary state={state} />
        {conflicts.map(([field, conflict]) => <div key={field} className="mt-5 rounded-2xl border border-orange-300 bg-orange-50 p-5">
          <p className="font-semibold text-orange-950">{LABELS[field]} · Information différente</p>
          <p className="mt-3 text-sm text-stone-600">Information enregistrée</p><p className="break-words font-medium">{conflict.confirmedValue}</p>
          <p className="mt-3 text-sm text-stone-600">Information trouvée dans le document</p><p className="break-words font-medium">{conflict.newValue}</p>
          {field === "siret" && <p className="mt-2 text-sm text-stone-600">L’adresse associée à l’établissement choisi sera utilisée : {state.review?.siretCandidates.find((candidate) => candidate.siret === conflict.newValue)?.address ?? "à contrôler dans la synthèse"}.</p>}
          <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => onAction({ type: "resolve_conflict", field, value: conflict.confirmedValue })}>Conserver l’information actuelle</Button><Button disabled={busy} onClick={() => onAction({ type: "resolve_conflict", field, value: conflict.newValue })}>Utiliser celle du document</Button></div>
        </div>)}
        {state.review?.siretAmbiguous && <div className="mt-5 rounded-xl border border-orange-200 p-5"><h3 className="font-semibold">Quel établissement concerne votre activité ?</h3><div className="mt-3 grid gap-3">{state.review.siretCandidates.map((candidate) => <Button key={candidate.siret} variant="secondary" disabled={busy} onClick={() => onAction({ type: "select_establishment", siret: candidate.siret })}><span className="whitespace-normal text-left">{candidate.siret} · {candidate.establishmentType}<br />{candidate.address}</span></Button>)}</div></div>}
        {state.review?.datesAmbiguous && <div className="mt-5 rounded-xl border border-orange-200 p-5"><h3 className="font-semibold">Plusieurs dates de début d’activité ont été trouvées</h3><div className="mt-3 flex flex-wrap gap-3">{(state.review.activityStartDateCandidates ?? []).map((date) => <Button key={date} variant="secondary" disabled={busy} onClick={() => onAction({ type: "correct_field", field: "dateDebutActivite", value: date })}>{dateLabel(date)}</Button>)}</div></div>}
        {missing && <p className="mt-5 text-sm text-stone-600">Après cette vérification, nous vous demanderons uniquement les informations encore nécessaires.</p>}
        {explanation && <details className="mt-5 rounded-xl bg-stone-50 p-4"><summary className="cursor-pointer text-sm font-medium">Comprendre l’impact sur mon exercice</summary><p className="mt-3 text-sm leading-relaxed text-stone-600">{explanation}</p></details>}
        <div className="mt-6 flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={() => onAction({ type: "edit" })}>Modifier</Button><Button disabled={busy || hasF009Decisions(state)} onClick={() => onAction({ type: "review_all" })}>Tout est correct</Button></div>
      </>}
      {completed && <>
        <span className={`mb-4 inline-flex rounded-full px-3 py-1 text-sm font-medium ${state.deferred || missing ? "bg-orange-50 text-orange-900" : "bg-green-50 text-green-900"}`}>{!state.siret ? "À finaliser — SIRET en attente" : missing ? "À compléter" : "Informations validées"}</span>
        <Title help="Vos informations sont conservées dans votre dossier Fiscal AI. Cette validation ne réalise aucune formalité administrative.">{missing ? "Votre dossier peut continuer" : "Les informations de votre activité sont validées dans votre dossier"}</Title>
        <Summary state={state} />
        {(!state.siret || state.registration !== "yes") && <div className="mt-6 rounded-2xl bg-orange-50 p-5"><h3 className="font-semibold">Finalisons votre immatriculation</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">Fiscal AI vous accompagne pendant que vous réalisez et signez votre formalité sur le Guichet unique.</p><div className="mt-4"><Button disabled={busy} onClick={onCompanion}>{companionLabel ?? "Commencer avec le Compagnon INPI"}</Button></div></div>}
        <div className="mt-6 flex flex-wrap gap-3"><a className="inline-flex min-h-11 items-center rounded-full bg-orange-600 px-5 py-3 font-medium text-white hover:bg-orange-700" href="/assistants/logement">Continuer vers Logement</a><Button variant="secondary" disabled={busy} onClick={() => onAction({ type: "edit" })}>Modifier mes réponses</Button></div>
        {state.deferred && <div className="mt-4"><Button variant="ghost" disabled={busy} onClick={() => onAction({ type: "select_registration", value: "yes" })}>J’ai obtenu mon SIRET ou mon justificatif</Button></div>}
      </>}
      {isQuestionStep(state.step) && <div className="mt-6 border-t border-stone-100 pt-4"><Button variant="ghost" disabled={busy} onClick={openUpload}>Utiliser un justificatif à la place</Button></div>}
    </Card>
  </main>;
}
