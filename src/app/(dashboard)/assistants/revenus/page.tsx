"use client";

import { F013RevenusAssistantPanel } from "@/components/lmnp/assistants/F013RevenusAssistantPanel";
import { F013V2ManualPanel, isF013V2ManualEnabled } from "@/components/lmnp/assistants/F013V2ManualPanel";
import { useLmnp } from "@/lib/lmnp/store";

export default function RevenusAssistantPage() {
  const { workspace } = useLmnp();
  if (isF013V2ManualEnabled()) {
    return <F013V2ManualPanel key={workspace.fiscalYear.id} productiveNavigation />;
  }
  return <F013RevenusAssistantPanel key={workspace.fiscalYear.id} />;
}
