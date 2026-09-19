"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDossier } from "@/lib/lmnp/dossier/DossierProvider";
import { fetchPaymentEntitlement } from "@/lib/lmnp/services/payment/entitlement-client";
import { useLmnp } from "@/lib/lmnp/store";

export type ServerPaymentState = "loading" | "paid" | "unpaid" | "error";

/**
 * Payment V1 — l'entitlement serveur est l'autorité ; `fiscalYear.paidAt` local
 * n'en est que le miroir. Ce hook relit la ligne serveur (RLS propriétaire) au
 * chargement, puis synchronise le miroir dans les DEUX sens : payé sur un autre
 * appareil → miroir payé ; miroir local falsifié → miroir remis à non payé.
 * Une erreur de lecture n'accorde jamais rien.
 */
export function useServerPaymentSync(fiscalYear: number) {
  const { dispatch } = useLmnp();
  const { currentDossierId, isReady } = useDossier();
  const [state, setState] = useState<ServerPaymentState>("loading");
  const ranFor = useRef<string | null>(null);

  const refetch = useCallback(async (): Promise<ServerPaymentState> => {
    if (!currentDossierId) return "error";
    try {
      const entitlement = await fetchPaymentEntitlement(fiscalYear, { dossierId: currentDossierId });
      dispatch({ type: "JOURNEY_SYNC_PAID_FROM_SERVER", paidAt: entitlement.paid ? (entitlement.paidAt ?? new Date().toISOString()) : undefined });
      const next: ServerPaymentState = entitlement.paid ? "paid" : "unpaid";
      setState(next);
      return next;
    } catch {
      setState("error");
      return "error";
    }
  }, [currentDossierId, dispatch, fiscalYear]);

  useEffect(() => {
    if (!isReady || !currentDossierId) return;
    const key = `${currentDossierId}:${fiscalYear}`;
    if (ranFor.current === key) return;
    ranFor.current = key;
    void refetch();
  }, [currentDossierId, fiscalYear, isReady, refetch]);

  return { state, refetch };
}
