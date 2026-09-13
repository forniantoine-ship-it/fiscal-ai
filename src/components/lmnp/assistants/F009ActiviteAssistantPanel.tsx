"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { useLmnp } from "@/lib/lmnp/store";
import { supabase } from "@/lib/supabase";
import { uploadFilesForUser } from "@/lib/uploadDocument";
import { isInpiDocument } from "@/lib/lmnp/services/inpi-profile";
import { runActiviteDocumentPipeline } from "@/lib/lmnp/services/activite-document-pipeline";
import { DocumentOcrFailedError } from "@/lib/lmnp/services/activite-gpt-pipeline";
import { groundActiviteFactExtraction } from "@/lib/documents/facts/grounding-engine";
import { projectDocumentFactsToF009 } from "@/lib/documents/facts/f009-fact-projection";
import { F009ActiviteAssistant, f009DraftPatch, nextMissingQuestion } from "@/runtime/assistants/f009-activite/assistant";
import type { F009Action } from "@/runtime/assistants/f009-activite/types";
import { F009ActiviteView } from "./F009ActiviteView";

export function F009ActiviteAssistantPanel() {
  const services = useLmnp();
  const { workspace, dossierInpiStatus } = services;
  const servicesRef = useRef(services);
  useLayoutEffect(() => { servicesRef.current = services; });
  const assistant = useMemo(() => new F009ActiviteAssistant({ dossierId: workspace.fiscalYear.id, fiscalYear: workspace.fiscalYear.year, route: "/assistants/activite" }), [workspace.fiscalYear.id, workspace.fiscalYear.year]);
  const [state, setState] = useState(() => {
    const initial = assistant.start(workspace.declarationDraft, dossierInpiStatus?.status).state;
    const missing = nextMissingQuestion(initial);
    if (!workspace.declarationDraft?.activiteAssistantState && initial.step === "review" && missing && missing !== "service_date" && workspace.documents.some((doc) => isInpiDocument(doc, workspace.declarationDraft?.inpiDocumentId))) {
      return { ...initial, step: "document" as const };
    }
    return initial;
  });
  const stateRef = useRef(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const run = useCallback(async (action: F009Action) => {
    const isInput = action.type === "stage_input";
    if (!isInput) { setBusy(true); setError(undefined); }
    try {
      const previous = stateRef.current;
      const result = await assistant.handle(previous, action);
      stateRef.current = result.state;
      setState(result.state);
      const { dispatch, flushWorkspace, updateInpiStatus, workspace: latest, dossierInpiStatus: status } = servicesRef.current;
      const patch = f009DraftPatch(result.state, new Date().toISOString(), result.completed);
      if (result.completed) {
        patch.completedSteps = [...new Set([...(latest.declarationDraft?.completedSteps ?? []), "activite-assistant"])];
      }
      // Merely going back never destroys a validation. Applying an actual edit
      // invalidates the completion signal until the next global review.
      if (action.type === "answer" || action.type === "resolve_conflict" || action.type === "correct_field" || action.type === "analysis_success" || action.type === "siret_obtained") {
        if (!result.state.error) patch.inpiConfirmedAt = undefined;
      }
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch });
      // Parity with the old persistCompletion(): completing F009 also confirms the
      // fiscal regime (structurally "réel" only, no question reintroduced here) so
      // regimeConfirmedAt/dossier-status progression aren't silently left unset.
      if (result.completed) dispatch({ type: "CONFIRM_REGIME", regime: "reel" });
      if (!isInput) await flushWorkspace({ declarationDraft: patch });
      if (action.type === "select_registration" && action.value === "no" && (!status || status.status === "not_started")) await updateInpiStatus("not_started", "declared");
      if (result.completed && result.state.registration === "yes" && result.state.siret && status?.status !== "regularization_required") await updateInpiStatus("registered", "declared");
    } catch {
      setError("La sauvegarde n’a pas abouti. Vos informations restent affichées ; réessayez avant de quitter la page.");
    } finally { if (!isInput && mounted.current) setBusy(false); }
  }, [assistant]);

  // The companion owns its administrative status and writes an obtained SIRET
  // independently. F009 reacts to that explicit dossier update, without merging engines.
  useEffect(() => {
    const siret = workspace.declarationDraft?.siret;
    if (siret && dossierInpiStatus?.status === "registered" && stateRef.current.deferred && stateRef.current.siret !== siret) void run({ type: "siret_obtained", siret });
  }, [workspace.declarationDraft?.siret, dossierInpiStatus?.status, run]);

  useEffect(() => {
    if (state.step !== "analyzing" || !state.analyzingDocumentId) return;
    let cancelled = false;
    const documentId = state.analyzingDocumentId;
    const analyze = async () => {
      const { workspace: current, getFile, dispatch } = servicesRef.current;
      const document = current.documents.find((entry) => entry.id === documentId);
      try {
        if (!document) throw new Error("missing_document");
        const pipeline = await runActiviteDocumentPipeline({ document, getFile, fiscalYear: current.fiscalYear.year });
        if (cancelled) return;
        const grounded = groundActiviteFactExtraction(pipeline.rawText, pipeline.extraction.data, documentId);
        const projection = projectDocumentFactsToF009(grounded.extraction);
        const usable = [projection.siret, projection.siren, projection.activityStartDate, projection.lastName, projection.firstName, projection.personalAddress, projection.establishmentAddress].some(Boolean) || projection.siretAmbiguous || projection.datesAmbiguous;
        if (!usable) {
          dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "failed" });
          await run({ type: "analysis_failed", cause: "unrecognized" });
          return;
        }
        dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "analyzed" });
        dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { inpiDocumentId: documentId } });
        await run({ type: "analysis_success", projection });
      } catch (cause) {
        if (cancelled) return;
        dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "failed" });
        await run({ type: "analysis_failed", cause: cause instanceof DocumentOcrFailedError ? "ocr_failed" : cause instanceof TypeError ? "network" : "ocr_failed" });
      }
    };
    void analyze();
    return () => { cancelled = true; };
  }, [state.step, state.analyzingDocumentId, run]);

  const upload = async (file: File) => {
    setBusy(true); setError(undefined);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Connectez-vous pour ajouter un document.");
      const result = await uploadFilesForUser([file], user.id);
      if (!result.documentIds[0]) throw new Error("L’import a échoué. Réessayez ou renseignez les informations manuellement.");
      const documentId = result.documentIds[0];
      servicesRef.current.dispatch({ type: "UPLOAD_DOCUMENTS", files: [{ file, category: "autre", documentId, isSupabaseDocumentId: true }] });
      servicesRef.current.dispatch({ type: "REGISTER_FILE", documentId, file });
      await run({ type: "upload_document", documentId });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "L’import du document a échoué."); }
    finally { setBusy(false); }
  };
  const useExisting = (documentId: string) => {
    const current = stateRef.current;
    if (current.analyzingDocumentId === documentId && current.review) void run({ type: "analysis_success", projection: current.review });
    else void run({ type: "upload_document", documentId });
  };
  const openCompanion = async () => {
    setBusy(true); setError(undefined);
    try {
      const { updateInpiStatus, dossierInpiStatus: status, flushWorkspace } = servicesRef.current;
      await flushWorkspace();
      if (!status || status.status === "not_started") await updateInpiStatus("preparing", "declared");
      requestAnimationFrame(() => document.getElementById("activite-inpi-companion")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch { setError("L’accompagnement n’a pas pu être ouvert. Réessayez."); }
    finally { setBusy(false); }
  };
  const documents = workspace.documents.filter((document) => isInpiDocument(document, workspace.declarationDraft?.inpiDocumentId));
  return <F009ActiviteView state={state} year={workspace.fiscalYear.year} busy={busy} error={error} explanation={assistant.explanation(state)} documents={documents} onAction={(action) => void run(action)} onFile={(file) => void upload(file)} onExistingDocument={useExisting} onCompanion={() => void openCompanion()} companionLabel={dossierInpiStatus && dossierInpiStatus.status !== "not_started" ? "Reprendre avec le Compagnon INPI" : undefined} />;
}
