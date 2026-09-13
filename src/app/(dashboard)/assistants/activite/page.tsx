"use client";

import { F009ActiviteAssistantPanel } from "@/components/lmnp/assistants/F009ActiviteAssistantPanel";
import { InpiCompanionPanel } from "@/components/lmnp/inpi-companion/InpiCompanionPanel";
import { shouldShowInpiCompanion } from "@/components/lmnp/inpi-companion/should-show-inpi-companion";
import { useLmnp } from "@/lib/lmnp/store";

export default function ActiviteAssistantPage() {
  const { workspace, dossierInpiStatus } = useLmnp();

  return (
    <>
      <F009ActiviteAssistantPanel key={workspace.fiscalYear.id} />
      {shouldShowInpiCompanion(dossierInpiStatus?.status) ? <section id="activite-inpi-companion" aria-label="Compagnon INPI"><InpiCompanionPanel /></section> : null}
    </>
  );
}
