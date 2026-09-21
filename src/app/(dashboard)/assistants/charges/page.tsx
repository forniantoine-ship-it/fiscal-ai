"use client";

import { F012ChargesAssistantPanel } from "@/components/lmnp/assistants/F012ChargesAssistantPanel";
import { useLmnp } from "@/lib/lmnp/store";

export default function ChargesAssistantPage() {
  const { workspace } = useLmnp();
  return <F012ChargesAssistantPanel key={workspace.fiscalYear.id} />;
}
