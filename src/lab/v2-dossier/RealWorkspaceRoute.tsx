"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { V2Prototype } from "./V2Prototype";
import { loadRealWorkspace, type RealWorkspaceLoad } from "./real-workspace";
import styles from "./prototype.module.css";

type RouteState = { status: "loading" } | RealWorkspaceLoad;

const MESSAGES = {
  no_dossier: "Aucun dossier réel n’est disponible pour ce compte.",
  error: "Impossible de charger votre dossier pour le moment.",
} as const;

const YEAR_MESSAGES = {
  not_selected: "Aucun exercice actif n’est défini pour ce dossier.",
  snapshot_missing: "Le dossier ne possède pas de snapshot pour son exercice actif.",
  closed: "L’exercice indiqué comme actif est déjà clôturé.",
  mismatch: "Les données de l’exercice actif ne correspondent pas au dossier.",
} as const;

export function RealWorkspaceRoute() {
  const [state, setState] = useState<RouteState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    let request = 0;
    async function load(userId: string | null) {
      const current = ++request;
      setState({ status: "loading" });
      const result = await loadRealWorkspace(userId);
      if (active && current === request) setState(result);
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void load(session?.user?.id ?? null);
    });
    return () => { active = false; request += 1; subscription.unsubscribe(); };
  }, []);

  if (state.status === "ready") {
    return <div data-workspace-source={state.source}><V2Prototype source={{ mode: "real", workspace: state.workspace }} /></div>;
  }
  return <div className={styles.root}><main className={styles.main}>
    <div className={styles.emptyCard} role={state.status === "error" ? "alert" : "status"}>
      <h1>{state.status === "loading" ? "Chargement de votre dossier…" : "Dossier réel indisponible"}</h1>
      {state.status === "loading" ? null : <p>{state.status === "year_unavailable" ? YEAR_MESSAGES[state.reason] : MESSAGES[state.status]}</p>}
    </div>
  </main></div>;
}
