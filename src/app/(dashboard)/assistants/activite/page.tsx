"use client";

import { F009ActiviteAssistantPanel } from "@/components/lmnp/assistants/F009ActiviteAssistantPanel";
import { InpiCompanionPanel } from "@/components/lmnp/inpi-companion/InpiCompanionPanel";
import { shouldShowInpiCompanion } from "@/components/lmnp/inpi-companion/should-show-inpi-companion";
import { useLmnp } from "@/lib/lmnp/store";

export default function ActiviteAssistantPage() {
  const { dossierInpiStatus } = useLmnp();

  return (
    <>
      <F009ActiviteAssistantPanel />
      {shouldShowInpiCompanion(dossierInpiStatus?.status) ? <InpiCompanionPanel /> : null}
    </>
  );
}
