"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { DeclarationReadyView } from "@/components/lmnp/declaration/DeclarationReadyView";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";

export default function DeclarationsPage() {
  const router = useRouter();
  const { workspace, isReady } = useLmnp();
  const paid = Boolean(workspace.fiscalYear.paidAt);
  const generated = Boolean(workspace.fiscalYear.declarationGeneratedAt);

  useEffect(() => {
    if (!isReady) return;
    if (!paid || !generated) {
      router.replace(LMNP_ROUTES.validation);
    }
  }, [isReady, paid, generated, router]);

  if (!isReady || !paid || !generated) {
    return <p className="text-center text-stone-500">Chargement…</p>;
  }

  return <DeclarationReadyView />;
}
