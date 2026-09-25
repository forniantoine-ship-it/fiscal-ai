import type { DomainId, PointKind } from "./model";
import type { IconName } from "./ui";

export const DOMAINS: Record<DomainId, { title: string; tech: string; assistant: string; lead: string }> = {
  logement: {
    title: "Votre logement",
    tech: "acquisition",
    assistant: "Assistant Logement (F-010)",
    lead: "Ce que vous avez acheté, quand, et à quel prix.",
  },
  financement: {
    title: "Votre prêt",
    tech: "financement",
    assistant: "Assistant Financement (F-011)",
    lead: "Seuls les intérêts et l’assurance de votre prêt réduisent votre résultat.",
  },
  loyers: {
    title: "Vos loyers",
    tech: "recettes",
    assistant: "Assistant Revenus (F-013)",
    lead: "Tout ce que vous avez encaissé pour ce logement pendant l’année.",
  },
  depenses: {
    title: "Vos dépenses",
    tech: "charges",
    assistant: "Assistant Charges (F-012)",
    lead: "Ce que vous avez payé pour ce logement et qui réduit votre résultat.",
  },
  amortissements: {
    title: "L’usure du logement et des meubles",
    tech: "amortissements",
    assistant: "Assistant Amortissements (F-014)",
    lead: "Chaque année, une partie de la valeur du logement et des meubles est déduite, comme s’ils s’usaient.",
  },
  historique: {
    title: "Ce qui se reporte d’une année à l’autre",
    tech: "historique et reports",
    assistant: "Reprise comptable",
    lead: "Ce qui n’a pas pu être déduit une année n’est pas perdu : il est mis de côté pour les suivantes.",
  },
};

export const KIND_META: Record<PointKind, { label: string; icon: IconName; tone: "warn" | "accent" | "neutral" }> = {
  contradiction: { label: "Deux documents ne disent pas la même chose", icon: "split", tone: "warn" },
  missing: { label: "Une information manque dans vos documents", icon: "question", tone: "warn" },
  decision: { label: "Un choix vous appartient", icon: "choice", tone: "accent" },
  optional: { label: "Facultatif — peut vous faire économiser", icon: "plus", tone: "neutral" },
};
