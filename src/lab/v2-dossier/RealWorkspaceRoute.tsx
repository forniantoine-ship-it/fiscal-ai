"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { V2Prototype } from "./V2Prototype";
import { loadRealDocuments, resolveRealDocumentForOpen, type RealDocumentLoad } from "./real-documents";
import styles from "./prototype.module.css";

type RouteState = { status: "loading" } | RealDocumentLoad;

const MESSAGES = {
  no_dossier: "Aucun dossier réel n’est disponible pour ce compte.",
  error: "Impossible de charger votre dossier pour le moment.",
} as const;

const YEAR_MESSAGES = {
  not_selected: "Aucun exercice actif n’est défini pour ce dossier.",
  snapshot_missing: "Le dossier ne possède pas de snapshot pour son exercice actif.",
  closed: "L’exercice indiqué comme actif est déjà clôturé.",
  mismatch: "Les données de l’exercice actif ne correspondent pas au dossier.",
  ambiguous: "Nous ne pouvons pas déterminer automatiquement l’exercice à afficher.",
} as const;

export function RealWorkspaceRoute() {
  const [state, setState] = useState<RouteState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let request = 0;
    async function load(userId: string | null) {
      const current = ++request;
      setState({ status: "loading" });
      setOpenError(null);
      const result = await loadRealDocuments(userId);
      if (active && current === request) setState(result);
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void load(session?.user?.id ?? null);
    });
    return () => { active = false; request += 1; subscription.unsubscribe(); };
  }, []);

  async function openDocument(documentId: string) {
    setOpenError(null);
    if (state.status !== "ready") return;
    const row = resolveRealDocumentForOpen(state, documentId);
    if (!row) {
      setOpenError("Ce document ne peut pas être ouvert pour le moment.");
      return;
    }
    // Open the tab within the user gesture; no Storage access occurs until this click.
    const preview = window.open("about:blank", "_blank");
    if (!preview) {
      setOpenError("Autorisez l’ouverture d’un nouvel onglet pour consulter ce document.");
      return;
    }
    preview.opener = null;
    setBusyId(documentId);
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || user?.id !== state.userId) {
        preview.close();
        setOpenError("Votre session a changé. Rechargez le dossier pour ouvrir ce document.");
        return;
      }
      const { downloadDocumentFromStorage } = await import("@/lib/supabase/download-document");
      const bytes = await downloadDocumentFromStorage(row.file_path);
      const lower = row.file_name.toLowerCase();
      const mime = lower.endsWith(".pdf") ? "application/pdf" :
        /\.jpe?g$/.test(lower) ? "image/jpeg" :
        lower.endsWith(".png") ? "image/png" :
        lower.endsWith(".webp") ? "image/webp" : "application/octet-stream";
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      preview.location.replace(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
    } catch {
      preview.close();
      setOpenError("Le fichier est indisponible pour le moment.");
    } finally {
      setBusyId(null);
    }
  }

  if (state.status === "ready") {
    return <div data-workspace-source={state.source}><V2Prototype source={{ mode: "real", workspace: state.workspace }} realDocuments={state.documents} onOpenRealDocument={openDocument} busyDocumentId={busyId} documentOpenError={openError} /></div>;
  }
  return <div className={styles.root}><main className={styles.main}>
    <div className={styles.emptyCard} role={state.status === "error" ? "alert" : "status"}>
      <h1>{state.status === "loading" ? "Chargement de votre dossier…" : "Dossier réel indisponible"}</h1>
      {state.status === "loading" ? null : <p>{state.status === "year_unavailable" ? YEAR_MESSAGES[state.reason] : MESSAGES[state.status]}</p>}
    </div>
  </main></div>;
}
