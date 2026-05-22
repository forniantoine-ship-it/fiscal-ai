"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";

export default function ExerciceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const { workspace, isReady } = useLmnp();
  const id = params.id as string;

  useEffect(() => {
    if (!isReady) return;
    if (workspace.fiscalYear.id !== id) {
      router.replace(`/app/exercices/${workspace.fiscalYear.id}`);
    }
  }, [id, isReady, router, workspace.fiscalYear.id]);

  return <>{children}</>;
}
