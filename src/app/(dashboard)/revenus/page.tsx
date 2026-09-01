import { redirect } from "next/navigation";

import { documentJourneyRoute } from "@/lib/lmnp/routes";

export default function RevenusPage() {
  redirect(documentJourneyRoute("revenus"));
}
