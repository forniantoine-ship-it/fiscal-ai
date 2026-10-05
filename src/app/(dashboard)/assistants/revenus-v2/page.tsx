"use client";

import { F013V2ManualPanel } from "@/components/lmnp/assistants/F013V2ManualPanel";
import { useLmnp } from "@/lib/lmnp/store";

/** F013 v2 — saisie manuelle. Inerte sans NEXT_PUBLIC_F013_V2_MANUAL=1 ; non liée à la navigation de production. */
export default function RevenusV2AssistantPage() {
  const { workspace } = useLmnp();
  return <F013V2ManualPanel key={workspace.fiscalYear.id} />;
}
