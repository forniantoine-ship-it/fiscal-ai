import type {
  Declaration,
  DeclarationVersion,
  FiscalEngineOutput,
  LiasseEngineOutput,
} from "@/lib/lmnp/types/domain";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { LiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";

export interface AppendDeclarationVersionInput {
  fiscalYearId: string;
  existingDeclaration: Declaration | undefined;
  existingVersions: DeclarationVersion[] | undefined;
  /**
   * Les 4 artefacts, tous issus d'un seul et même appel à
   * runDeclarationGeneration() côté appelant — jamais de fiscalResultFromDraft().
   */
  fiscalResult: FiscalEngineOutput;
  liasseResult: LiasseEngineOutput;
  rfs: FiscalRepresentation;
  liasseRfs: LiasseFromRfs;
  now: string;
  newId?: () => string;
}

export interface AppendDeclarationVersionResult {
  declaration: Declaration;
  declarationVersions: DeclarationVersion[];
}

/**
 * P0 — DeclarationVersion, Level 2. Fonction pure, append-only : ajoute
 * exactement une nouvelle version à l'historique existant, sans jamais
 * modifier ou retirer les versions déjà présentes. `versionNumber` est
 * robuste à l'état existant (max des versions existantes + 1, jamais réutilisé).
 */
export function appendDeclarationVersion(
  input: AppendDeclarationVersionInput,
): AppendDeclarationVersionResult {
  const existingVersions = input.existingVersions ?? [];
  const newId = input.newId ?? (() => crypto.randomUUID());

  const versionNumber =
    existingVersions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;

  const declarationId = input.existingDeclaration?.id ?? newId();

  const newVersion: DeclarationVersion = {
    id: newId(),
    declarationId,
    versionNumber,
    generatedAt: input.now,
    fiscalResult: input.fiscalResult,
    liasseResult: input.liasseResult,
    rfs: input.rfs,
    liasseRfs: input.liasseRfs,
  };

  const declaration: Declaration = {
    id: declarationId,
    fiscalYearId: input.fiscalYearId,
    currentVersionId: newVersion.id,
    createdAt: input.existingDeclaration?.createdAt ?? input.now,
  };

  return {
    declaration,
    // Append-only : nouveau tableau, les versions existantes ne sont ni
    // mutées ni retirées.
    declarationVersions: [...existingVersions, newVersion],
  };
}
