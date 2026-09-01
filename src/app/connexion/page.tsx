import { redirect } from "next/navigation";

import { LMNP_ROUTES } from "@/lib/lmnp/routes";

export default function ConnexionPage() {
  redirect(LMNP_ROUTES.login);
}
