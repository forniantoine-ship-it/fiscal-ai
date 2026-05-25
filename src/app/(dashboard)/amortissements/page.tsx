import { TabPlaceholder } from "@/components/lmnp/shared/TabPlaceholder";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

export default function AmortissementsPage() {
  return (
    <TabPlaceholder
      eyebrow="Amortissements"
      title="Immobilisations & amortissements"
      description="Votre tableau d'amortissement et les dotations calculées seront disponibles ici après validation du dossier."
      ctaHref={LMNP_ROUTES.documents}
      ctaLabel="Importer mes documents"
    />
  );
}
