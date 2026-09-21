"use client";

import { F013RevenusAssistantPanel } from "@/components/lmnp/assistants/F013RevenusAssistantPanel";
import { useLmnp } from "@/lib/lmnp/store";

export default function RevenusAssistantPage() {
  const { workspace } = useLmnp();
  return <F013RevenusAssistantPanel key={workspace.fiscalYear.id} />;
}
