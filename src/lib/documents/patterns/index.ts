import { FACTURE_MOBILIER_PATTERN } from "./facture-mobilier.pattern";
import { FACTURE_TRAVAUX_PATTERN } from "./facture-travaux.pattern";
import { INPI_PATTERN } from "./inpi.pattern";
import { OFFRE_PRET_PATTERN } from "./offre-pret.pattern";
import { P0I_PATTERN } from "./p0i.pattern";

export type { DocumentPattern, DocumentPatternSignal, PatternMatchDetail } from "./pattern.types";

export {
  FACTURE_MOBILIER_PATTERN,
  FACTURE_TRAVAUX_PATTERN,
  INPI_PATTERN,
  OFFRE_PRET_PATTERN,
  P0I_PATTERN,
};

export const ALL_DOCUMENT_PATTERNS = [
  INPI_PATTERN,
  P0I_PATTERN,
  OFFRE_PRET_PATTERN,
  FACTURE_TRAVAUX_PATTERN,
  FACTURE_MOBILIER_PATTERN,
] as const;
