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
    <div className={isDashboard ? "relative min-h-screen" : undefined}>
      <AppHeader />
      {showAlerts && !isDashboard && <AlertStrip />}
      <div className="mx-auto flex max-w-7xl">
        {!isDashboard && <JourneySidebar />}
        <main
          className={`min-w-0 flex-1 ${isDashboard ? "flex justify-center" : "px-4 py-8 sm:px-8"}`}
        >
          <JourneyGuard>{children}</JourneyGuard>
        </main>
      </div>
    </div>
  );
}
