"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { journeyAllowsRoute } from "@/lib/lmnp/engine/journey";
import { useLmnp } from "@/lib/lmnp/store";

export function JourneyGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { workspace, isReady } = useLmnp();
  const id = params.id as string;
  const base = `/app/exercices/${id}`;

  useEffect(() => {
    if (!isReady) return;
    const suffix = pathname.replace(base, "") || "";
    if (journeyAllowsRoute(suffix, workspace.journey)) return;

    const current = workspace.journey.steps.find(
      (s) => s.id === workspace.journey.currentStepId,
    );
    router.replace(current?.href ?? `${base}/documents`);
  }, [isReady, pathname, base, workspace.journey, router]);

  return <>{children}</>;
}
