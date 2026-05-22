"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/lmnp/app-shell/AppShell";
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

  return <AppShell>{children}</AppShell>;
}
