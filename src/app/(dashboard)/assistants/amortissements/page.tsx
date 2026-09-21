"use client";

import { F014AmortissementsAssistantPanel } from "@/components/lmnp/assistants/F014AmortissementsAssistantPanel";
import { useLmnp } from "@/lib/lmnp/store";

export default function AmortissementsAssistantPage() {
  const { workspace } = useLmnp();
  return <F014AmortissementsAssistantPanel key={workspace.fiscalYear.id} />;
}
