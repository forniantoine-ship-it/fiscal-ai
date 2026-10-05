/**
 * INT-4 — MODÈLE PUR de l'interface de qualification 39 C (aucun React, aucune horloge, aucun effet).
 *
 * Principe : questions CONTEXTUELLES uniquement. Aucune page générique « Article 39 C » ; le client répond à des faits métier
 * (jamais B / ACTIVITY / OTHER_PRODUCT / EXCLUDED). Les cartes ne s'affichent que pour un dossier EXPLICITEMENT F013 v2
 * (le moteur exact exige F013 v2 : un dossier legacy ne reçoit aucune question inutile) et seulement quand les charges du
 * bien sont confirmées (F012 réconcilié = condition de lecture des lignes).
 */
import { toCents } from "@/runtime/capabilities/f006/cents";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { pendingArticle39cQuestions, type Article39cQuestion } from "./questions";
import { parseQualificationStore, selectQualifications, type ActivityChargeNature, type ActivityChargeQualificationRecord } from "./qualification-store";
import { writeActivityCharge, writeCfeNotice, type Article39cQualificationAction } from "./qualification-writers";
import { resolveWorkspaceIdentity } from "./workspace-sources";

/** Libellés métier des natures de charges globales (jamais de jargon fiscal). */
export const ACTIVITY_CHARGE_NATURE_LABELS: Readonly<Record<ActivityChargeNature, string>> = {
  ACCOUNTING_FEES: "Honoraires de mon expert-comptable",
  ACCOUNTING_OR_TAX_SOFTWARE: "Logiciel de comptabilité ou service de déclaration",
  OTHER: "Autre frais lié à mon activité de location",
};

/** Dossier explicitement F013 v2 pour l'exercice (au moins un bien porte un état v2 de CET exercice). */
export function isArticle39cQualificationApplicable(workspace: PersistedWorkspace, expectedDossierId: string): boolean {
  const identity = resolveWorkspaceIdentity(workspace, expectedDossierId);
  if (!identity.ok) return false;
  const year = workspace.fiscalYear.year;
  return identity.propertyIds.some((id) => identity.biens[id]?.rentReconciliationV2?.facts.fiscalYear === year);
}

export type Article39cCardsModel = {
  readonly applicable: boolean;
  readonly questions: readonly Article39cQuestion[];
  /** La charge globale d'activité n'a de sens qu'en multi-biens (en mono, la charge est celle du bien). */
  readonly showActivityCharges: boolean;
  readonly activityCharges: readonly ActivityChargeQualificationRecord[];
};

export function buildArticle39cCardsModel(input: { workspace: PersistedWorkspace; expectedDossierId: string }): Article39cCardsModel {
  const { workspace, expectedDossierId } = input;
  if (!isArticle39cQualificationApplicable(workspace, expectedDossierId)) return { applicable: false, questions: [], showActivityCharges: false, activityCharges: [] };
  const identity = resolveWorkspaceIdentity(workspace, expectedDossierId);
  const multi = identity.ok && identity.propertyIds.length > 1;
  const store = parseQualificationStore(workspace.declarationDraft?.article39cActivityQualifications);
  return {
    applicable: true,
    questions: pendingArticle39cQuestions({ workspace, expectedDossierId }),
    showActivityCharges: multi,
    activityCharges: selectQualifications(store, { level: "ACTIVITY" }, workspace.fiscalYear.year).activityCharges,
  };
}

/** « 1 234,56 » / « 1234.5 » → centimes ; tout le reste est refusé (jamais interprété, jamais zéro). */
export function parseEurosToCents(text: string): number | undefined {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = toCents(Number(normalized));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined;
}

export type DeclarationAction = { ok: true; action: Article39cQualificationAction | undefined } | { ok: false; reason: "INVALID_AMOUNT" | "DESCRIPTION_REQUIRED" };

/** Déclaration de l'avis de CFE (niveau activité : l'exploitant). Identité déterministe `cfe-<exercice>`. */
export function buildCfeNoticeDeclaration(input: {
  draft: DeclarationDraft | undefined;
  fiscalYear: number;
  amountText: string;
  documentId?: string;
  answeredAt: string;
}): DeclarationAction {
  const amountCents = parseEurosToCents(input.amountText);
  if (amountCents === undefined) return { ok: false, reason: "INVALID_AMOUNT" };
  return {
    ok: true,
    action: writeCfeNotice(input.draft, {
      scope: { level: "ACTIVITY" },
      notice: { sourceId: `cfe-${input.fiscalYear}`, fiscalYear: input.fiscalYear, amountCents, ...(input.documentId !== undefined && input.documentId !== "" ? { evidenceRefs: [input.documentId] } : {}) },
      answeredAt: input.answeredAt,
    }),
  };
}

/** Charge globale de l'activité : une par nature et par exercice (identité déterministe, jamais répartie entre biens). */
export function buildActivityChargeDeclaration(input: {
  draft: DeclarationDraft | undefined;
  fiscalYear: number;
  nature: ActivityChargeNature;
  amountText: string;
  description: string;
  documentId?: string;
  answeredAt: string;
}): DeclarationAction {
  const amountCents = parseEurosToCents(input.amountText);
  if (amountCents === undefined) return { ok: false, reason: "INVALID_AMOUNT" };
  const description = input.description.trim() === "" ? ACTIVITY_CHARGE_NATURE_LABELS[input.nature] : input.description.trim();
  if (input.nature === "OTHER" && input.description.trim() === "") return { ok: false, reason: "DESCRIPTION_REQUIRED" };
  return {
    ok: true,
    action: writeActivityCharge(input.draft, {
      charge: {
        sourceId: `activity-${input.nature.toLowerCase()}-${input.fiscalYear}`,
        fiscalYear: input.fiscalYear,
        nature: input.nature,
        amountCents,
        description,
        ...(input.documentId !== undefined && input.documentId !== "" ? { documentIds: [input.documentId] } : {}),
        provenance: "declaration",
      },
      answeredAt: input.answeredAt,
    }),
  };
}
