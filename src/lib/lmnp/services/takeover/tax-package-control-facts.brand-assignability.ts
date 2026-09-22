/**
 * Lot 4D.1c — garde compile-time minimale (fichier INCLUS par tsc).
 *
 * tsconfig.json exclut les fichiers "*.test.ts" : les @ts-expect-error dans
 * les tests exécutés via tsx ne sont PAS typecheckés par le projet.
 * Ce fichier (hors pattern "*.test.ts") fournit une vérification automatisée
 * que "npx tsc --noEmit -p ." exerce réellement.
 *
 * Ne construit aucun fact runtime ; pure contrainte d'assignabilité.
 */

import type { CandidateValue } from "./candidate-value";
import type { TaxPackageControlFact } from "./tax-package-control-facts";

declare const _sampleValue: CandidateValue<number>;

// Literal sans brand Symbol — ne doit pas être assignable.
// @ts-expect-error TaxPackageControlFact requires factory seal brand (4D.1b/c)
const _literalBypass: TaxPackageControlFact = {
  kind: "total_gross",
  formType: "2033C",
  sourceCase: "576",
  periodPosition: "closing",
  formYear: 2026,
  fiscalYear: 2025,
  value: _sampleValue,
};

void _literalBypass;
