import { TabPlaceholder } from "@/components/lmnp/shared/TabPlaceholder";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

export default function RevenusPage() {
  return (
    <TabPlaceholder
      eyebrow="Revenus"
      title="Recettes locatives"
      description="Les loyers et autres recettes validés apparaîtront ici après confirmation de vos documents."
      ctaHref={LMNP_ROUTES.declarations}
      ctaLabel="Valider mes montants"
    />
  );
}
