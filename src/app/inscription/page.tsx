import { redirect } from "next/navigation";

import { LMNP_ROUTES } from "@/lib/lmnp/routes";

export default function InscriptionPage() {
  redirect(LMNP_ROUTES.signup);
}
