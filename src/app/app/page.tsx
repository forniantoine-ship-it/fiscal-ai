"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";

export default function AppRootPage() {
  const router = useRouter();
  const { workspace, isReady } = useLmnp();

  useEffect(() => {
    if (!isReady) return;
    router.replace(`/app/exercices/${workspace.fiscalYear.id}`);
  }, [isReady, router, workspace.fiscalYear.id]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent text-sm text-stone-500">
      Redirection…
    </div>
  );
}
