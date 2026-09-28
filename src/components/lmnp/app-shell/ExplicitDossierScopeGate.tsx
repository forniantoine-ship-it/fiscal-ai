"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { readExplicitDossierId } from "@/lib/lmnp/dossier/explicit-dossier-id";
import { fetchOwnedDossierById, type LmnpDossier } from "@/lib/lmnp/dossier/supabase-dossier";
import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";

export function ExplicitDossierScopeGate({ children }: {
  children: (dossier: LmnpDossier | null) => ReactNode;
}) {
  const params = useSearchParams().toString();
  const correction = useV3CorrectionScope();
  const requested = useMemo(() => readExplicitDossierId(new URLSearchParams(params)), [params]);
  const id = requested ?? correction?.dossierId;
  const [state, setState] = useState<{
    id: string; status: "checking" | "allowed" | "refused"; dossier?: LmnpDossier;
  }>({ id: "", status: "checking" });

  useEffect(() => {
    if (!id || requested === null) return;
    let active = true;
    async function verify() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw new Error("auth_unavailable");
        const result = await fetchOwnedDossierById(data.user.id, id!);
        if (active) setState(result.status === "ok"
          ? { id: id!, status: "allowed", dossier: result.dossier }
          : { id: id!, status: "refused" });
      } catch {
        if (active) setState({ id: id!, status: "refused" });
      }
    }
    void verify();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      if (active) setState({ id: id!, status: "checking" });
      queueMicrotask(() => { if (active) void verify(); });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [id, requested]);

  if (requested === null || (correction && id !== correction.dossierId)) {
    return <div role="alert">Ce dossier ne peut pas être ouvert.</div>;
  }
  if (!id) return <>{children(null)}</>;
  if (state.id !== id || state.status === "checking") {
    return <div role="status">Vérification du dossier…</div>;
  }
  if (state.status !== "allowed" || !state.dossier) {
    return <div role="alert">Ce dossier ne peut pas être ouvert.</div>;
  }
  return <>{children(state.dossier)}</>;
}
