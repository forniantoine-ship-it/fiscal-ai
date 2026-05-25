import { TabPlaceholder } from "@/components/lmnp/shared/TabPlaceholder";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

export default function DepensesPage() {
  return (
    <TabPlaceholder
      eyebrow="Charges"
      title="Dépenses et charges"
      description="Taxe foncière, assurance, travaux et autres charges seront regroupés ici une fois vos pièces confirmées."
      ctaHref={LMNP_ROUTES.declarations}
      ctaLabel="Valider mes montants"
    />
  );
}
