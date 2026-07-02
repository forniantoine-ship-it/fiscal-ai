/**
 * Provenance d'un Field, exigée par le Knowledge System (F-009, F-010, RT-001).
 * Chaque valeur consommée par une Transformation doit tracer sa source.
 * Type partagé entre Assistants (F-009 → F-012).
 */
export type FieldSource =
  | "extracted"
  | "estimated"
  | "manual"
  | "derived"
  | "judgment"
  | "user_correction";
