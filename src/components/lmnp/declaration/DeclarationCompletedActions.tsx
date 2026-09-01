"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SecondaryButton } from "@/components/lmnp/design-system";
import { useLmnp } from "@/lib/lmnp/store";

interface DeclarationCompletedActionsProps {
  dashboardHref: string;
  documentsHref: string;
}

export function DeclarationCompletedActions({
  dashboardHref,
  documentsHref,
}: DeclarationCompletedActionsProps) {
  const router = useRouter();
  const { dispatch, workspace } = useLmnp();
  const pendingNewRef = useRef(false);
  const prevIdRef = useRef(workspace.fiscalYear.id);

  useEffect(() => {
    if (pendingNewRef.current && workspace.fiscalYear.id !== prevIdRef.current) {
      router.push(`/app/exercices/${workspace.fiscalYear.id}`);
      pendingNewRef.current = false;
    }
    prevIdRef.current = workspace.fiscalYear.id;
  }, [workspace.fiscalYear.id, router]);

  const startNewDeclaration = () => {
    pendingNewRef.current = true;
    dispatch({ type: "CREATE_NEW_DECLARATION" });
  };

  return (
    <div className="mt-14 flex flex-col items-center gap-5">
      <SecondaryButton href={dashboardHref}>Retour au tableau de bord</SecondaryButton>
      <Link
        href={documentsHref}
        className="text-[12px] text-stone-500 transition-colors hover:text-stone-700"
      >
        Consulter mes documents
      </Link>
      <button
        type="button"
        onClick={startNewDeclaration}
        className="text-[12px] text-stone-400 underline decoration-stone-300/80 underline-offset-[3px] transition-colors hover:text-stone-600"
      >
        Déclarer un autre bien
      </button>
    </div>
  );
}
