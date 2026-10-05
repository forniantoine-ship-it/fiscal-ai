/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 — parcours utilisateur RÉELS (questions 39 C → writers → reducer → snapshot sérialisé → reload). Entrées uniquement.
 */
import assert from "node:assert/strict";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { DOSSIER, roundtrip } from "@/lib/lmnp/services/article-39c/article-39c-test-fixtures";
import { buildArticle39cAnswerAction, pendingArticle39cQuestions, type Article39cQuestion } from "@/lib/lmnp/services/article-39c/questions";
import { buildCfeNoticeDeclaration } from "@/lib/lmnp/services/article-39c/qualification-ui-model";
import type { Article39cQualificationAction } from "@/lib/lmnp/services/article-39c/qualification-writers";

export const AT = "2026-12-01T00:00:00.000Z";

export async function dispatch(workspace: PersistedWorkspace, action: Article39cQualificationAction | undefined): Promise<PersistedWorkspace> {
  assert.ok(action, "une action était attendue");
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const reducer = (await import("@/lib/lmnp/store/reducer")).lmnpReducer;
  const next = reducer({ ...workspace, fileRegistry: new Map() } as any, action as any) as unknown as Record<string, unknown>;
  const { fileRegistry: _ignored, ...persistable } = next;
  void _ignored;
  return roundtrip(persistable as unknown as PersistedWorkspace).reloaded;
}

export const questions = (ws: PersistedWorkspace) => pendingArticle39cQuestions({ workspace: ws, expectedDossierId: DOSSIER });
export const ofKind = (ws: PersistedWorkspace, kind: Article39cQuestion["kind"]) => questions(ws).filter((q) => q.kind === kind);

export async function answer(ws: PersistedWorkspace, kind: Article39cQuestion["kind"], value: string, extra: { loanId?: string; propertyId?: string } = {}): Promise<PersistedWorkspace> {
  const { propertyId, ...rest } = extra;
  const question = ofKind(ws, kind).find((q) => propertyId === undefined || (q.scope.level === "PROPERTY" && q.scope.propertyId === propertyId));
  assert.ok(question, `question ${kind} attendue`);
  const res = buildArticle39cAnswerAction({ draft: ws.declarationDraft, question: question!, answer: value, answeredAt: AT, ...rest });
  assert.ok(res.ok, JSON.stringify(res));
  return res.action === undefined ? ws : dispatch(ws, res.action);
}

export async function declareCfe(ws: PersistedWorkspace, amountText: string, year = 2026): Promise<PersistedWorkspace> {
  const res = buildCfeNoticeDeclaration({ draft: ws.declarationDraft, fiscalYear: year, amountText, answeredAt: AT });
  assert.ok(res.ok);
  return dispatch(ws, res.action);
}
