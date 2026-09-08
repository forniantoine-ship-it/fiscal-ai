"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";
import { DeclarationReadyView } from "@/components/lmnp/declaration/DeclarationReadyView";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";

export default function DeclarationsPage() {
  const router = useRouter();
  const { workspace, isReady } = useLmnp();
  const paid = Boolean(workspace.fiscalYear.paidAt);

  // P1 — Découplage paiement / génération (SIREN/SIRET manquant, cf.
  // payment-readiness.ts) : `generated` n'est plus une condition d'accès à
  // cette route, seul `paid` l'est. DeclarationReadyView (inchangé) gère
  // déjà correctement `paid && !generated` par construction (early return
  // tant que fiscalResult/liasseResult sont absents, cf. audit READ-ONLY).
  useEffect(() => {
    if (!isReady) return;
    if (!paid) {
      router.replace(LMNP_ROUTES.validation);
    }
  }, [isReady, paid, router]);

  if (!isReady || !paid) {
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
