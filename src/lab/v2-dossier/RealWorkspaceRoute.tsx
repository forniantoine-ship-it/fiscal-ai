"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { V2Prototype } from "./V2Prototype";
import { V3RealPrototype } from "@/lab/v3-dossier/V3RealPrototype";
import { loadRealDocuments, resolveRealDocumentForOpen, type RealDocumentLoad } from "./real-documents";
import { sameCorrectionScope, scopeFromRealWorkspace, type ScopeQuery } from "./correction-scope";
import { fetchServerPaymentStatus, type ServerPaymentStatus } from "@/lib/lmnp/services/payment/entitlement-client";
import styles from "./prototype.module.css";

type RouteState = { status: "loading" } | RealDocumentLoad;

/** Placeholder before the server read resolves — "unknown", never "paid" or "not_started" by default. */
const PAYMENT_NOT_LOADED: ServerPaymentStatus = { state: "unknown", source: "server", reason: "not_loaded" };

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

export function RealWorkspaceRoute({ expectedReturn = { kind: "none" }, requestedDossierId, requestedPropertyId, shell }: {
  expectedReturn?: ScopeQuery;
  /** MB-MULTI-UX-1 — bien actif demandé par l'URL (jamais une autorité : revérifié contre le dossier chargé). */
  requestedPropertyId?: string;
  requestedDossierId?: string | null;
  /** R15 — "v3" mounts the V3 real shell on the exact same loading, scope and security path. Absent = V2 (unchanged). */
  shell?: "v3";
}) {
  const [state, setState] = useState<RouteState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [payment, setPayment] = useState<ServerPaymentStatus>(PAYMENT_NOT_LOADED);

  useEffect(() => {
    let active = true;
    let request = 0;
    async function load(userId: string | null) {
      const current = ++request;
      setState({ status: "loading" });
      setOpenError(null);
      setPayment(PAYMENT_NOT_LOADED);
      if (expectedReturn.kind === "invalid" || requestedDossierId === null ||
          (expectedReturn.kind === "scope" && requestedDossierId && requestedDossierId !== expectedReturn.scope.dossierId)) {
        setState({ status: "year_unavailable", reason: "mismatch" });
        return;
      }
      const dossierId = requestedDossierId ?? (expectedReturn.kind === "scope" ? expectedReturn.scope.dossierId : undefined);
      const result = await loadRealDocuments(userId, undefined, dossierId);
      const checked = expectedReturn.kind === "scope" &&
        !sameCorrectionScope(
          expectedReturn.scope,
          scopeFromRealWorkspace(result, expectedReturn.scope.property.kind === "required" ? expectedReturn.scope.property.propertyId : undefined),
        )
          ? { status: "year_unavailable" as const, reason: "mismatch" as const }
          : result;
      if (active && current === request) setState(checked);
      // Payment is scoped by (dossierId, fiscal_year) only — multi-property never
      // blocks this read (R13.2 §5); it only ever blocks finalizeHref (R13.1/R12.1A).
      if (checked.status === "ready") {
        const status = await fetchServerPaymentStatus(checked.dossierId, checked.fiscalYear);
        if (active && current === request) setPayment(status);
      }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void load(session?.user?.id ?? null);
    });
    return () => { active = false; request += 1; subscription.unsubscribe(); };
  }, [expectedReturn, requestedDossierId]);

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

  if (state.status === "ready" && shell === "v3") {
    const scope = scopeFromRealWorkspace(state, requestedPropertyId);
    // The shell marker only selects where a completed F011 correction returns to; it carries no authority.
    return <div data-workspace-source={state.source}><V3RealPrototype workspace={state.workspace} scope={scope ? { ...scope, shell: "v3" } : null} documents={state.documents} /></div>;
  }
  if (state.status === "ready") {
    return <div data-workspace-source={state.source}><V2Prototype source={{ mode: "real", workspace: state.workspace }} correctionScope={scopeFromRealWorkspace(state, requestedPropertyId)} payment={payment} realDocuments={state.documents} onOpenRealDocument={openDocument} busyDocumentId={busyId} documentOpenError={openError} /></div>;
  }
  return <div className={styles.root}><main className={styles.main}>
    <div className={styles.emptyCard} role={state.status === "error" ? "alert" : "status"}>
      <h1>{state.status === "loading" ? "Chargement de votre dossier…" : "Dossier réel indisponible"}</h1>
      {state.status === "loading" ? null : <p>{state.status === "year_unavailable" ? YEAR_MESSAGES[state.reason] : MESSAGES[state.status]}</p>}
    </div>
  </main></div>;
}
