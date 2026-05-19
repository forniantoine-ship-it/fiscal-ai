"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/lmnp/app-shell/AppHeader";
import { AppSidebar } from "@/components/lmnp/app-shell/AppSidebar";
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

  return (
    <>
      <AppHeader />
      <div className="mx-auto flex max-w-7xl">
        <AppSidebar />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </>
  );
}
