"use client";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";
import type {
  BlockingDomain,
  StructuredBlockingReason,
} from "@/lib/lmnp/services/declaration/workspace-blocking-reasons";
import type { Property } from "@/lib/lmnp/types";

/**
 * R2C.3c2d — ligne de raison de blocage portée jusqu'à l'écran. Elle transporte le modèle sémantique de 3c2b TEL QUEL
 * (code, propertyId, domain, recoverable, known) : jamais réduit à un texte. Aucune URL : aucune navigation propre à un bien
 * n'existe aujourd'hui, donc aucun faux bouton « corriger » (une raison non résoluble reste visible).
 */
export type BlockingReasonRow = {
  key: string;
  code: string;
  propertyId?: string;
  /** Libellé fiable du bien (label, sinon adresse) ; jamais inventé : absent si le bien est inconnu de l'interface. */
  propertyLabel?: string;
  domain: BlockingDomain;
  field?: string;
  recoverable: boolean;
  known: boolean;
  message?: string;
};

export function buildBlockingReasonRows(
  reasons: readonly StructuredBlockingReason[],
  properties: readonly Pick<Property, "id" | "label" | "address">[],
): BlockingReasonRow[] {
  return reasons.map((reason, index) => {
    const property = reason.propertyId === undefined ? undefined : properties.find((item) => item.id === reason.propertyId);
    const propertyLabel = property ? property.label?.trim() || property.address?.trim() || undefined : undefined;
    return {
      key: `${reason.code}|${reason.propertyId ?? ""}|${reason.field ?? ""}|${index}`,
      code: reason.code,
      ...(reason.propertyId !== undefined ? { propertyId: reason.propertyId } : {}),
      ...(propertyLabel ? { propertyLabel } : {}),
      domain: reason.domain,
      ...(reason.field !== undefined ? { field: reason.field } : {}),
      recoverable: reason.recoverable,
      known: reason.known,
      ...(reason.message !== undefined ? { message: reason.message } : {}),
    };
  });
}

const DOMAIN_LABEL: Record<BlockingDomain, string> = {
  activite: "Activité",
  logement: "Logement",
  credit: "Crédit",
  charges: "Charges",
  revenus: "Revenus",
  amortissement: "Amortissements",
  workspace: "Dossier",
};

type ValidationMultiPropertyBlockProps = {
  cardStyle: React.CSSProperties;
  /** R2C.3c2d — raisons de blocage structurées (dossier multi reconnu, jamais activé). Absentes : rendu historique. */
  reasons?: readonly BlockingReasonRow[];
};

export function ValidationMultiPropertyBlock({ cardStyle, reasons }: ValidationMultiPropertyBlockProps) {
  return (
    <section
      className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ ...cardStyle, textAlign: "center" }}
    >
      <p
        className="mx-auto max-w-md"
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.lg,
          color: colors.text.primary,
        }}
      >
        Votre dossier nécessite un accompagnement personnalisé.
      </p>
      {reasons && reasons.length > 0 ? (
        <ul className="mx-auto mt-4 max-w-md text-left" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          {reasons.map((row) => (
            <li key={row.key} className="mt-1">
              {row.propertyLabel ?? row.propertyId ?? "Dossier"} — {DOMAIN_LABEL[row.domain]} — {row.code}
              {row.field ? ` (${row.field})` : ""}
              {row.recoverable ? " — à corriger" : " — non résoluble pour l'instant"}
              {row.message ? ` : ${row.message}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-6 flex justify-center">
        <Button variant="secondary" href="mailto:contact@fiscal-ai.fr?subject=Devis%20LMNP%20multi-biens">
          Demander un devis
        </Button>
      </div>
    </section>
  );
}
