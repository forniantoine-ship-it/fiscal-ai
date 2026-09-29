"use client";

import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";
import type { V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";

/** Words that name the "home" an assistant returns to. Legacy wording is kept everywhere outside the V3 shell. */
export type ShellVocabulary = { dashboard: string; backToDashboard: string };

const LEGACY_VOCABULARY: ShellVocabulary = { dashboard: "Tableau de bord", backToDashboard: "Retour au tableau de bord" };
const V3_VOCABULARY: ShellVocabulary = { dashboard: "Mon dossier", backToDashboard: "Retour à mon dossier" };

export function shellVocabulary(scope: Pick<V3CorrectionScope, "shell"> | null | undefined): ShellVocabulary {
  return scope?.shell === "v3" ? V3_VOCABULARY : LEGACY_VOCABULARY;
}

export function useShellVocabulary(): ShellVocabulary {
  return shellVocabulary(useV3CorrectionScope());
}
