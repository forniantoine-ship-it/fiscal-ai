import type { Subject } from "@/lab/advisor-scene/types";

/**
 * Sujets fictifs du laboratoire — jamais liés au dossier LMNP réel.
 * Six sujets, comme demandé, tous "undiscovered" au repos initial.
 */
export const baseSubjects: Subject[] = [
  { id: "activite", label: "Activité", lifecycle: "undiscovered" },
  { id: "logement", label: "Logement", lifecycle: "undiscovered" },
  { id: "credit", label: "Financement", lifecycle: "undiscovered" },
  { id: "revenus", label: "Revenus", lifecycle: "undiscovered" },
  { id: "charges", label: "Charges", lifecycle: "undiscovered" },
  { id: "validation", label: "Validation", lifecycle: "undiscovered" },
];

export function subjectLabel(id: string): string {
  return baseSubjects.find((s) => s.id === id)?.label ?? id;
}
