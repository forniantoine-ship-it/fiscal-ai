/**
 * Couche PDF Cerfa officielle — point d'entrée public.
 *
 * Chaîne : Fiscal Engine → RFS → Fiscal mapper (inchangés) → CerfaCase[]
 *   → `generateCerfaLiassePdf()` (registre + génération + gate, ce module)
 *   → PDF final immuable, rattachable à une `DeclarationVersion` via
 *     `createGeneratedLiassePdf()`.
 */
export { generateCerfaLiassePdf } from "./generator/render-cerfa-liasse";
export {
  generateCerfa2033BFromRfs,
  CERFA_2033B_FORM_ID,
  CERFA_2033B_MILLESIME,
} from "./generate-cerfa-2033b";
export type { Cerfa2033BGenerationResult, Cerfa2033BGenerationSuccess } from "./generate-cerfa-2033b";
export {
  generateCerfa2033AFromRfs,
  CERFA_2033A_FORM_ID,
  CERFA_2033A_MILLESIME,
} from "./generate-cerfa-2033a";
export type { Cerfa2033AGenerationResult, Cerfa2033AGenerationSuccess } from "./generate-cerfa-2033a";
export type { FormInput } from "./gate/generation-gate";
export { runStructuralAndMappingGate, checkOverflow } from "./gate/generation-gate";
export { createGeneratedLiassePdf } from "./versioning";
export type { GeneratedLiassePdf, EdiStatus } from "./versioning";
export { resolveAssetManifestEntry, CERFA_ASSET_MANIFEST_2026 } from "./asset-manifest";
export { resolveVisualMapping } from "./registry";
export { isExcludedCase, CERFA_EXCLUDED_CASES_2026 } from "./excluded-cases";
export type { CerfaExcludedCase, ExclusionClassification } from "./excluded-cases";
export {
  CERFA_2033B_SCOPE_2026,
  CERFA_2033B_REGISTRY_CASE_IDS,
  scopeStatusFor2033BCase,
} from "./scope/2033-b-2026";
export type { Cerfa2033BScopeEntry, CerfaCaseScopeStatus } from "./scope/2033-b-2026";
export {
  CERFA_2033A_REGISTRY_CASE_IDS,
  CERFA_2033A_FORBIDDEN_CASE_IDS,
  CERFA_2033A_SLICE_COLUMNS,
  isAuthorized2033ASliceCase,
} from "./scope/2033-a-2026";
export type { Cerfa2033ARegistryCaseId, Cerfa2033AColumn } from "./scope/2033-a-2026";
export * from "./types";
