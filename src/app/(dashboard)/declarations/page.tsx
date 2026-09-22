"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";
import { DeclarationReadyView } from "@/components/lmnp/declaration/DeclarationReadyView";
import { useServerPaymentSync } from "@/components/lmnp/payment/useServerPaymentSync";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import {
  resolveExternalOpeningProofFromFiscalYear,
  resolvePriorHistoryEligibility,
} from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { useLmnp } from "@/lib/lmnp/store";

export default function DeclarationsPage() {
  const router = useRouter();
  const { workspace, isReady } = useLmnp();
  // Payment V1 — l'accès repose sur l'entitlement SERVEUR (webhook Stripe), pas
  // sur `fiscalYear.paidAt` local (simple miroir, falsifiable). La livraison
  // (PDF) est de toute façon refusée côté serveur sans paiement.
  const serverPayment = useServerPaymentSync(workspace.fiscalYear.year);
  const paid = serverPayment.state === "paid";
  // P0 launch safety — même résolveur + même preuve Opening que l'écran de
  // validation (Lot 5.3) : un exercice EXTERNAL_HISTORY sans Opening usable
  // ne donne jamais accès aux livrables.
  const priorHistoryEligible = resolvePriorHistoryEligibility(
    workspace.fiscalYear,
    resolveExternalOpeningProofFromFiscalYear(workspace.fiscalYear),
  ).eligible;

  // P1 — Découplage paiement / génération (SIREN/SIRET manquant, cf.
  // payment-readiness.ts) : `generated` n'est plus une condition d'accès à
  // cette route, seul `paid` l'est. DeclarationReadyView (inchangé) gère
  // déjà correctement `paid && !generated` par construction (early return
  // tant que fiscalResult/liasseResult sont absents, cf. audit READ-ONLY).
  useEffect(() => {
    if (!isReady || serverPayment.state === "loading" || serverPayment.state === "error") return;
    if (!paid || !priorHistoryEligible) {
      router.replace(LMNP_ROUTES.validation);
    }
  }, [isReady, paid, priorHistoryEligible, router, serverPayment.state]);

  if (isReady && serverPayment.state === "error") {
    return (
      <div className="text-center">
        <p className="text-stone-500">Nous n&apos;avons pas pu vérifier votre paiement. Vérifiez votre connexion.</p>
        <button
          type="button"
          className="mt-3 underline"
          style={{ ...typography.caption.desktop, color: colors.text.accent }}
          onClick={() => void serverPayment.refetch()}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!isReady || !paid || !priorHistoryEligible) {
    return <p className="text-center text-stone-500">Chargement…</p>;
  }

  return (
    <>
      <DeclarationReadyView />
      <p className="mx-auto -mt-4 w-full max-w-4xl pb-16 text-center">
        <Link
          href={LMNP_ROUTES.declarationsHistorique}
          style={{ ...typography.caption.desktop, color: colors.text.muted }}
        >
          Voir mes exercices précédents
        </Link>
      </p>
    </>
  );
}
