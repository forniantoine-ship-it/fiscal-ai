import type { Subject } from "@/lab/advisor-scene/types";

/**
 * Trois sujets volontairement abstraits — pas de vocabulaire LMNP — pour que
 * le prototype minimal valide le mécanisme lui-même, indépendamment de tout
 * habillage métier (ADR-009 v2.0, "aucun branchement métier").
 */
export const prototypeSubjects: Subject[] = [
  { id: "sujet-a", label: "Sujet A", lifecycle: "undiscovered" },
  { id: "sujet-b", label: "Sujet B", lifecycle: "undiscovered" },
  { id: "sujet-c", label: "Sujet C", lifecycle: "undiscovered" },
];
