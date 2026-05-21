"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/lmnp/app-shell/AppHeader";
import { AlertStrip } from "@/components/lmnp/app-shell/AlertStrip";
import { JourneyGuard } from "@/components/lmnp/journey/JourneyGuard";
import { JourneySidebar } from "@/components/lmnp/journey/JourneySidebar";
import { useLmnp } from "@/lib/lmnp/store";

export default function ExerciceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, isReady } = useLmnp();
  const id = params.id as string;

  useEffect(() => {
    if (!isReady) return;
    if (workspace.fiscalYear.id !== id) {
      router.replace(`/app/exercices/${workspace.fiscalYear.id}`);
    }
  }, [id, isReady, router, workspace.fiscalYear.id]);

  const showAlerts =
    workspace.blockingAlertCount > 0 &&
    ["dossier", "generate", "payment", "transmission"].includes(workspace.journey.currentStepId);

  const isDashboard =
    pathname === `/app/exercices/${id}` || pathname === `/app/exercices/${id}/`;

  return (
    <>
      <AppHeader />
      {showAlerts && <AlertStrip />}
      <div className="mx-auto flex max-w-7xl">
        <JourneySidebar />
        <main
          className={`min-w-0 flex-1 px-4 sm:px-8 ${isDashboard ? "py-10" : "py-8"}`}
        >
          <JourneyGuard>{children}</JourneyGuard>
        </main>
      </div>
    </>
  );
}
