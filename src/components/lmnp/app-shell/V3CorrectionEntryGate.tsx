"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { loadRealWorkspace } from "@/lab/v2-dossier/real-workspace";
import { readV3CorrectionQuery, sameCorrectionScope, scopeFromRealWorkspace } from "@/lab/v2-dossier/correction-scope";
import { V3CorrectionScopeContext } from "@/lab/v2-dossier/correction-context";

type GateState = { key: string; status: "checking" | "allowed" | "refused" };

/** Scoped V3 entry is checked before DashboardShell mounts LmnpProvider. */
export function V3CorrectionEntryGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const key = `${pathname}?${search}`;
  const query = useMemo(() => readV3CorrectionQuery(pathname, new URLSearchParams(search)), [pathname, search]);
  const [state, setState] = useState<GateState>({ key: "", status: "checking" });

  useEffect(() => {
    if (query.kind !== "scope") return;
    let active = true;
    const expectedScope = query.scope;
    async function verify() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw new Error("auth_unavailable");
        const resolved = await loadRealWorkspace(data.user.id);
        const allowed = sameCorrectionScope(expectedScope, scopeFromRealWorkspace(resolved));
        if (active) setState({ key, status: allowed ? "allowed" : "refused" });
      } catch {
        if (active) setState({ key, status: "refused" });
      }
    }
    void verify();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      if (active) setState({ key, status: "checking" });
      // Supabase auth callbacks must not await another auth call synchronously.
      queueMicrotask(() => { if (active) void verify(); });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [key, query]);

  if (query.kind === "none") return <>{children}</>;
  if (query.kind === "invalid") {
    return <div role="alert">Cette correction ne peut pas être ouverte pour ce dossier ou cet exercice.</div>;
  }
  if (state.key !== key || state.status === "checking") {
    return <div role="status">Vérification du dossier et de l’exercice…</div>;
  }
  if (state.status === "refused") {
    return <div role="alert">Cette correction ne peut pas être ouverte pour ce dossier ou cet exercice.</div>;
  }
  return <V3CorrectionScopeContext.Provider value={query.scope}>{children}</V3CorrectionScopeContext.Provider>;
}
