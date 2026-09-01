import { redirect } from "next/navigation";

import { LMNP_ROUTES } from "@/lib/lmnp/routes";

export default function ActivitePage() {
  redirect(LMNP_ROUTES.activite);
}
