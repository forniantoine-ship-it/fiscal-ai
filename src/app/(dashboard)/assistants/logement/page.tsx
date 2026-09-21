"use client";

import { F010LogementAssistantPanel } from "@/components/lmnp/assistants/F010LogementAssistantPanel";
import { useLmnp } from "@/lib/lmnp/store";

export default function LogementAssistantPage() {
  const { workspace } = useLmnp();
  return <F010LogementAssistantPanel key={workspace.fiscalYear.id} />;
}
