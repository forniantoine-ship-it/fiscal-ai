"use client";

import { F011FinancementAssistantPanel } from "@/components/lmnp/assistants/F011FinancementAssistantPanel";
import { useLmnp } from "@/lib/lmnp/store";

export default function FinancementAssistantPage() {
  const { workspace } = useLmnp();
  return <F011FinancementAssistantPanel key={workspace.fiscalYear.id} />;
}
