/**
 * INT-3 — QUESTIONS métier de qualification article 39 C (modèle pur, sans UI) et conversion réponse → fait → writer.
 *
 * Principe (mission § 6) : une question n'est posée que si (1) la donnée source existe, (2) sa nature n'est pas assez
 * déterminée, (3) la réponse peut modifier la classification, (4) elle n'est pas déjà connue ailleurs. Le client fournit un
 * FAIT en langage courant ; il ne choisit JAMAIS B, ACTIVITY, OTHER_PRODUCT ou EXCLUDED. Une qualification fraîche n'est
 * pas redemandée ; une qualification périmée (source modifiée) l'est.
 *
 *  - PNO documentaire ambigu : OUI → PNO · NON → autre assurance (jamais ACTIVITY) · JE NE SAIS PAS → UNKNOWN.
 *  - Frais d'agence ambigus : nature réelle (vocabulaire INT-2).
 *  - CFE : seulement si un avis CFE est déclaré (source) et non répondu / périmé.
 *  - Frais bancaires : financement du logement / compte de l'activité / je ne sais pas ; prêt rattaché seulement s'il est
 *    identifiable (un seul prêt) ou explicitement choisi — jamais choisi automatiquement parmi plusieurs.
 *  - Suivi : « déjà compris dans les frais de mon prêt ? » seulement si le montant coïncide avec un frais F011.
 */
import { toCents } from "@/runtime/capabilities/f006/cents";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";
import type { Article39cScope } from "./contribution";
import { f012LineFingerprint } from "./from-f012";
import { fingerprintCfeNotice, type BankFeeNatureFact, type ChargeNatureFact } from "./qualification-facts";
import { parseQualificationStore, scopeKey, selectQualifications, type CfeDiversLinkage } from "./qualification-store";
import {
  removeActivityCharge,
  writeActivityCharge,
  writeCfeAnswer,
  writeCfeNotice,
  writeChargeNatureAnswer,
  type Article39cQualificationAction,
  type CfeAnswer,
} from "./qualification-writers";
import { resolveF012LinesForBien, resolveWorkspaceIdentity } from "./workspace-sources";

export type Article39cQuestionKind =
  | "PNO_CONFIRMATION"
  | "AGENCY_FEE_NATURE"
  | "CFE_BASE"
  | "BANK_FEE_PURPOSE"
  | "BANK_FEE_ALREADY_IN_LOAN"
  | "CFE_DIVERS_LINK"
  | "ACTIVITY_CHARGE_DUPLICATE";

/** Ligne de charges diverses (d'un bien) susceptible d'être la même dépense qu'une CFE ou qu'une charge globale. */
export type Article39cCandidateLine = { readonly propertyId: string; readonly lineId: string; readonly description: string };

export type Article39cQuestionOption = { readonly value: string; readonly label: string };

export type Article39cQuestion = {
  readonly questionId: string;
  readonly kind: Article39cQuestionKind;
  readonly scope: Article39cScope;
  readonly fiscalYear: number;
  /** Ligne F012 ou identifiant d'avis CFE concerné. */
  readonly subjectId: string;
  readonly amountCents: number;
  readonly prompt: string;
  readonly options: readonly Article39cQuestionOption[];
  /** Empreinte COURANTE de la source : la réponse y est rattachée. */
  readonly sourceFingerprint: string;
  /** Frais bancaires : prêts identifiables du bien (jamais choisis automatiquement s'ils sont plusieurs). */
  readonly candidateLoanIds?: readonly string[];
  /** CFE ↔ divers / charge globale ↔ charge de bien : lignes candidates (jamais choisies automatiquement s'il y en a plusieurs). */
  readonly candidateLines?: readonly Article39cCandidateLine[];
  readonly evidenceRefs?: readonly string[];
};

const YES_NO_UNKNOWN: readonly Article39cQuestionOption[] = [
  { value: "YES", label: "Oui" },
  { value: "NO", label: "Non" },
  { value: "UNKNOWN", label: "Je ne sais pas" },
];

export const AGENCY_FEE_OPTIONS: readonly Article39cQuestionOption[] = [
  { value: "PROPERTY_MANAGEMENT", label: "La gestion courante de mon logement" },
  { value: "LETTING", label: "La recherche d'un locataire et la mise en location" },
  { value: "INVENTORY", label: "Les états des lieux" },
  { value: "ADVERTISING", label: "Les annonces et la publicité" },
  { value: "OTHER", label: "Autre chose" },
  { value: "UNKNOWN", label: "Je ne sais pas" },
];

export const CFE_OPTIONS: readonly Article39cQuestionOption[] = [
  { value: "MINIMUM_BASE", label: "Base minimum" },
  { value: "RENTAL_VALUE_BASE", label: "Valeur locative" },
  { value: "DONT_KNOW", label: "Je ne sais pas" },
];

export const BANK_FEE_OPTIONS: readonly Article39cQuestionOption[] = [
  { value: "FINANCING", label: "Le financement de ce logement" },
  { value: "ACTIVITY_ACCOUNT", label: "Le compte utilisé pour mon activité de location meublée" },
  { value: "UNKNOWN", label: "Je ne sais pas" },
];

export const BANK_FEE_ALREADY_IN_LOAN_OPTIONS: readonly Article39cQuestionOption[] = [
  { value: "ALREADY_IN_LOAN", label: "Oui, ce frais est déjà compris dans les frais de mon prêt" },
  { value: "DISTINCT", label: "Non, c'est un autre frais" },
  { value: "UNKNOWN", label: "Je ne sais pas" },
];

export const SAME_EXPENSE_OPTIONS: readonly Article39cQuestionOption[] = [
  { value: "SAME", label: "Oui, c'est la même dépense" },
  { value: "DISTINCT", label: "Non, ce sont deux dépenses différentes" },
  { value: "UNKNOWN", label: "Je ne sais pas" },
];

const questionId = (kind: Article39cQuestionKind, scope: Article39cScope, subjectId: string, fiscalYear: number) =>
  `${kind}|${scopeKey(scope)}|${subjectId}|${fiscalYear}`;

/** Questions encore pertinentes pour un workspace rechargé (aucune question inutile). */
export function pendingArticle39cQuestions(input: { workspace: PersistedWorkspace; expectedDossierId: string }): Article39cQuestion[] {
  const { workspace } = input;
  const fiscalYear = workspace.fiscalYear.year;
  const identity = resolveWorkspaceIdentity(workspace, input.expectedDossierId);
  if (!identity.ok) return [];
  const out: Article39cQuestion[] = [];
  const activityCfe = selectQualifications(parseQualificationStore(workspace.declarationDraft?.article39cActivityQualifications), { level: "ACTIVITY" }, fiscalYear);
  const diversTwins = (lignes: readonly LigneCharge[], propertyId: string, amountCents: number): Article39cCandidateLine[] =>
    lignes
      .filter((l) => l.categorie === "divers" && l.exclusionReason !== "f011_overlap" && l.deductibilite === "deductible" && toCents(l.montantDeductible) + toCents(l.montantPreExploitation) === amountCents)
      .map((l) => ({ propertyId, lineId: l.id, description: l.description }));
  const accountingTwins = (lignes: readonly LigneCharge[], propertyId: string, amountCents: number): Article39cCandidateLine[] =>
    lignes.filter((l) => l.categorie === "honoraires_comptable" && l.exclusionReason !== "f011_overlap" && toCents(l.montantDeductible) + toCents(l.montantPreExploitation) === amountCents).map((l) => ({ propertyId, lineId: l.id, description: l.description }));
  const activityLinkCandidates = new Map<string, Article39cCandidateLine[]>();
  const activityChargeCandidates = new Map<string, Article39cCandidateLine[]>();

  for (const propertyId of identity.propertyIds) {
    const bien = identity.biens[propertyId];
    if (bien === undefined) continue;
    const scope: Article39cScope = { level: "PROPERTY", propertyId };
    const selected = selectQualifications(parseQualificationStore(bien.article39cQualifications), scope, fiscalYear);
    const prets = bien.financementCharges?.prets ?? [];
    const lines = resolveF012LinesForBien({ bien, fiscalYear, scope });

    if (lines.ok) {
      const answerOf = (kind: ChargeNatureFact["kind"], lineId: string) => selected.natureFacts.find((f) => f.kind === kind && f.lineId === lineId);
      const fingerprintOf = (lineId: string): string | undefined => {
        const ligne = lines.charges.lignes.find((l) => l.id === lineId);
        return ligne === undefined ? undefined : f012LineFingerprint(ligne, { owner: scope, fiscalYear, sources: lines.lineSources[lineId] });
      };
      const amountOf = (lineId: string): number => {
        const ligne = lines.charges.lignes.find((l) => l.id === lineId);
        return ligne === undefined ? 0 : toCents(ligne.montantDeductible) + toCents(ligne.montantPreExploitation);
      };

      // Natures dérivées de la SOURCE : on ne demande que ce qui reste inconnu.
      for (const derived of lines.derivedNatureFacts) {
        if (derived.nature !== "UNKNOWN") continue;
        const answered = answerOf(derived.kind, derived.lineId);
        if (answered !== undefined && answered.sourceFingerprint === derived.sourceFingerprint) continue; // fraîche : pas redemandée
        const amountCents = amountOf(derived.lineId);
        if (amountCents <= 0) continue;
        if (derived.kind === "INSURANCE_NATURE") {
          out.push({
            questionId: questionId("PNO_CONFIRMATION", scope, derived.lineId, fiscalYear),
            kind: "PNO_CONFIRMATION",
            scope,
            fiscalYear,
            subjectId: derived.lineId,
            amountCents,
            prompt: "Cette assurance correspond-elle à l'assurance propriétaire non occupant (PNO) du logement ?",
            options: YES_NO_UNKNOWN,
            sourceFingerprint: derived.sourceFingerprint,
          });
        } else if (derived.kind === "MANAGEMENT_NATURE") {
          out.push({
            questionId: questionId("AGENCY_FEE_NATURE", scope, derived.lineId, fiscalYear),
            kind: "AGENCY_FEE_NATURE",
            scope,
            fiscalYear,
            subjectId: derived.lineId,
            amountCents,
            prompt: "À quoi correspondent principalement ces frais d'agence ?",
            options: AGENCY_FEE_OPTIONS,
            sourceFingerprint: derived.sourceFingerprint,
          });
        }
      }

      // Frais bancaires : uniquement s'il en existe.
      for (const ligne of lines.charges.lignes) {
        if (ligne.categorie !== "frais_bancaires") continue;
        const amountCents = amountOf(ligne.id);
        const fingerprint = fingerprintOf(ligne.id);
        if (amountCents <= 0 || fingerprint === undefined) continue;
        const answered = answerOf("BANK_FEE", ligne.id) as BankFeeNatureFact | undefined;
        const fresh = answered !== undefined && answered.sourceFingerprint === fingerprint;
        if (!fresh) {
          out.push({
            questionId: questionId("BANK_FEE_PURPOSE", scope, ligne.id, fiscalYear),
            kind: "BANK_FEE_PURPOSE",
            scope,
            fiscalYear,
            subjectId: ligne.id,
            amountCents,
            prompt: "Ces frais bancaires concernent-ils le financement de ce logement ou le compte utilisé pour votre activité de location meublée ?",
            options: BANK_FEE_OPTIONS,
            sourceFingerprint: fingerprint,
            candidateLoanIds: prets.map((p) => p.pretId),
          });
        } else if (answered.nature === "PROPERTY_FINANCING" && answered.loanId !== undefined && answered.financingFeeKind === undefined && answered.alreadyCountedByF011 !== true) {
          const pret = prets.find((p) => p.pretId === answered.loanId);
          const inLoan = pret !== undefined && (toCents(pret.fraisDossierDeductibles) === amountCents || toCents(pret.garantieDeductible) === amountCents);
          if (inLoan) {
            out.push({
              questionId: questionId("BANK_FEE_ALREADY_IN_LOAN", scope, ligne.id, fiscalYear),
              kind: "BANK_FEE_ALREADY_IN_LOAN",
              scope,
              fiscalYear,
              subjectId: ligne.id,
              amountCents,
              prompt: "Ces frais sont-ils déjà compris dans les frais de votre prêt (frais de dossier, garantie) ?",
              options: BANK_FEE_ALREADY_IN_LOAN_OPTIONS,
              sourceFingerprint: fingerprint,
              candidateLoanIds: [answered.loanId],
            });
          }
        }
      }
    }

    for (const record of selected.cfe) {
      out.push(...cfeQuestions(record, scope, fiscalYear));
      if (lines.ok && record.diversLinkage === undefined) {
        const candidates = diversTwins(lines.charges.lignes as readonly LigneCharge[], propertyId, record.notice.amountCents);
        if (candidates.length > 0) out.push(linkQuestion(record, scope, fiscalYear, candidates));
      }
    }
    if (lines.ok) {
      for (const record of activityCfe.cfe) {
        if (record.diversLinkage !== undefined) continue;
        const candidates = diversTwins(lines.charges.lignes as readonly LigneCharge[], propertyId, record.notice.amountCents);
        if (candidates.length > 0) activityLinkCandidates.set(record.recordId, [...(activityLinkCandidates.get(record.recordId) ?? []), ...candidates]);
      }
      for (const record of activityCfe.activityCharges) {
        if (record.charge.nature === "OTHER" || record.charge.distinctFromPropertyCharges !== undefined) continue;
        const candidates = accountingTwins(lines.charges.lignes as readonly LigneCharge[], propertyId, record.charge.amountCents);
        if (candidates.length > 0) activityChargeCandidates.set(record.recordId, [...(activityChargeCandidates.get(record.recordId) ?? []), ...candidates]);
      }
    }
  }

  for (const record of activityCfe.cfe) {
    out.push(...cfeQuestions(record, { level: "ACTIVITY" }, fiscalYear));
    const candidates = activityLinkCandidates.get(record.recordId);
    if (candidates !== undefined && record.diversLinkage === undefined) out.push(linkQuestion(record, { level: "ACTIVITY" }, fiscalYear, candidates));
  }
  for (const record of activityCfe.activityCharges) {
    const candidates = activityChargeCandidates.get(record.recordId);
    if (candidates === undefined) continue;
    out.push({
      questionId: questionId("ACTIVITY_CHARGE_DUPLICATE", { level: "ACTIVITY" }, record.charge.sourceId, fiscalYear),
      kind: "ACTIVITY_CHARGE_DUPLICATE",
      scope: { level: "ACTIVITY" },
      fiscalYear,
      subjectId: record.charge.sourceId,
      amountCents: record.charge.amountCents,
      prompt: "Cette dépense correspond-elle à des frais de comptabilité que vous avez déjà saisis dans les charges d'un logement ?",
      options: SAME_EXPENSE_OPTIONS,
      sourceFingerprint: `activity-charge:${record.charge.sourceId}:${record.charge.amountCents}`,
      candidateLines: candidates,
    });
  }
  return out.sort((a, b) => (a.questionId < b.questionId ? -1 : 1));
}

function linkQuestion(
  record: ReturnType<typeof selectQualifications>["cfe"][number],
  scope: Article39cScope,
  fiscalYear: number,
  candidates: readonly Article39cCandidateLine[],
): Article39cQuestion {
  return {
    questionId: questionId("CFE_DIVERS_LINK", scope, record.notice.sourceId, fiscalYear),
    kind: "CFE_DIVERS_LINK",
    scope,
    fiscalYear,
    subjectId: record.notice.sourceId,
    amountCents: record.notice.amountCents,
    prompt: "Cette dépense correspond-elle à la CFE que vous venez de renseigner ?",
    options: SAME_EXPENSE_OPTIONS,
    sourceFingerprint: fingerprintCfeNotice(record.notice),
    candidateLines: candidates,
    ...(record.notice.evidenceRefs !== undefined ? { evidenceRefs: record.notice.evidenceRefs } : {}),
  };
}

function cfeQuestions(
  record: ReturnType<typeof selectQualifications>["cfe"][number],
  scope: Article39cScope,
  fiscalYear: number,
): Article39cQuestion[] {
  const current = fingerprintCfeNotice(record.notice);
  if (record.fact !== undefined && record.fact.sourceFingerprint === current) return []; // fraîche
  return [
    {
      questionId: questionId("CFE_BASE", scope, record.notice.sourceId, fiscalYear),
      kind: "CFE_BASE",
      scope,
      fiscalYear,
      subjectId: record.notice.sourceId,
      amountCents: record.notice.amountCents,
      prompt: "Votre avis de CFE est-il calculé sur une base minimum ou sur la valeur locative d'un établissement ?",
      options: CFE_OPTIONS,
      sourceFingerprint: current,
      ...(record.notice.evidenceRefs !== undefined ? { evidenceRefs: record.notice.evidenceRefs } : {}),
    },
  ];
}

export type AnswerResult =
  | { ok: true; action: Article39cQualificationAction | undefined }
  | { ok: false; reason: "UNKNOWN_ANSWER" | "UNKNOWN_LOAN" | "UNKNOWN_LINE" | "LINE_REQUIRED" | "MISSING_PRIOR_ANSWER" };

/**
 * Réponse du client → fait de qualification → action reducer. `undefined` = rien à écrire (réponse identique ou « je ne
 * sais pas » de suivi). Un choix de prêt parmi plusieurs est un fait explicite (`loanId`) : jamais déduit.
 */
export function buildArticle39cAnswerAction(input: {
  draft: DeclarationDraft | undefined;
  question: Article39cQuestion;
  answer: string;
  answeredAt: string;
  /** Frais bancaires : prêt choisi explicitement par le client (obligatoire s'il y a plusieurs prêts, sinon non attribué). */
  loanId?: string;
  /** CFE ↔ divers : ligne choisie explicitement (obligatoire s'il y a plusieurs candidates). */
  lineChoice?: { propertyId: string; lineId: string };
}): AnswerResult {
  const { question, answer } = input;
  if (!question.options.some((o) => o.value === answer)) return { ok: false, reason: "UNKNOWN_ANSWER" };
  const base = { scope: question.scope, fiscalYear: question.fiscalYear, answeredAt: input.answeredAt };
  const common = { lineId: question.subjectId, provenance: "declaration" as const, sourceFingerprint: question.sourceFingerprint };

  switch (question.kind) {
    case "PNO_CONFIRMATION": {
      const nature = answer === "YES" ? "PNO" : answer === "NO" ? "OTHER" : "UNKNOWN";
      return { ok: true, action: writeChargeNatureAnswer(input.draft, { ...base, fact: { kind: "INSURANCE_NATURE", nature, ...common } }) };
    }
    case "AGENCY_FEE_NATURE":
      return {
        ok: true,
        action: writeChargeNatureAnswer(input.draft, {
          ...base,
          fact: { kind: "MANAGEMENT_NATURE", nature: answer as "PROPERTY_MANAGEMENT" | "LETTING" | "INVENTORY" | "ADVERTISING" | "OTHER" | "UNKNOWN", ...common },
        }),
      };
    case "CFE_BASE": {
      const evidence = question.evidenceRefs;
      return {
        ok: true,
        action: writeCfeAnswer(input.draft, {
          scope: question.scope,
          notice: { sourceId: question.subjectId, fiscalYear: question.fiscalYear, amountCents: question.amountCents, ...(evidence !== undefined ? { evidenceRefs: evidence } : {}) },
          answer: answer as CfeAnswer,
          provenance: "declaration",
          answeredAt: input.answeredAt,
        }),
      };
    }
    case "BANK_FEE_PURPOSE": {
      if (answer === "FINANCING") {
        const candidates = question.candidateLoanIds ?? [];
        if (input.loanId !== undefined && !candidates.includes(input.loanId)) return { ok: false, reason: "UNKNOWN_LOAN" };
        // Prêt identifiable = un seul candidat, ou choix explicite ; plusieurs candidats sans choix : aucun prêt attribué.
        const loanId = input.loanId ?? (candidates.length === 1 ? candidates[0] : undefined);
        return { ok: true, action: writeChargeNatureAnswer(input.draft, { ...base, fact: { kind: "BANK_FEE", nature: "PROPERTY_FINANCING", ...(loanId !== undefined ? { loanId } : {}), ...common } }) };
      }
      const nature = answer === "ACTIVITY_ACCOUNT" ? "ACTIVITY_ACCOUNT" : "UNKNOWN";
      return { ok: true, action: writeChargeNatureAnswer(input.draft, { ...base, fact: { kind: "BANK_FEE", nature, ...common } }) };
    }
    case "CFE_DIVERS_LINK": {
      const notice = { sourceId: question.subjectId, fiscalYear: question.fiscalYear, amountCents: question.amountCents, ...(question.evidenceRefs !== undefined ? { evidenceRefs: question.evidenceRefs } : {}) };
      const link = (diversLinkage: CfeDiversLinkage) => ({ ok: true as const, action: writeCfeNotice(input.draft, { scope: question.scope, notice, answeredAt: input.answeredAt, diversLinkage }) });
      if (answer === "DISTINCT") return link({ kind: "DECLARED_DISTINCT" });
      if (answer === "UNKNOWN") return link({ kind: "UNKNOWN" });
      const candidates = question.candidateLines ?? [];
      const chosen = input.lineChoice ?? (candidates.length === 1 ? candidates[0] : undefined);
      if (chosen === undefined) return { ok: false, reason: "LINE_REQUIRED" };
      if (!candidates.some((c) => c.propertyId === chosen.propertyId && c.lineId === chosen.lineId)) return { ok: false, reason: "UNKNOWN_LINE" };
      return link({ kind: "LINKED", lineId: chosen.lineId, ...(question.scope.level === "ACTIVITY" ? { propertyId: chosen.propertyId } : {}) });
    }
    case "ACTIVITY_CHARGE_DUPLICATE": {
      if (answer === "UNKNOWN") return { ok: true, action: undefined };
      const record = parseQualificationStore(input.draft?.article39cActivityQualifications)?.records.find((r) => r.recordKind === "ACTIVITY_CHARGE" && r.charge.sourceId === question.subjectId && r.fiscalYear === question.fiscalYear);
      if (record === undefined || record.recordKind !== "ACTIVITY_CHARGE") return { ok: false, reason: "MISSING_PRIOR_ANSWER" };
      // Même dépense : elle reste comptée là où elle l'est déjà (charge de logement, jamais répartie) ; la copie globale est retirée.
      if (answer === "SAME") return { ok: true, action: removeActivityCharge(input.draft, record.recordId) };
      return { ok: true, action: writeActivityCharge(input.draft, { charge: { ...record.charge, distinctFromPropertyCharges: true }, answeredAt: input.answeredAt }) };
    }
    case "BANK_FEE_ALREADY_IN_LOAN": {
      if (answer === "UNKNOWN") return { ok: true, action: undefined };
      const prior = currentBankFact(input.draft, question);
      if (prior === undefined) return { ok: false, reason: "MISSING_PRIOR_ANSWER" };
      const fact: BankFeeNatureFact = answer === "ALREADY_IN_LOAN" ? { ...prior, alreadyCountedByF011: true } : { ...prior, financingFeeKind: "OTHER" };
      return { ok: true, action: writeChargeNatureAnswer(input.draft, { ...base, fact }) };
    }
  }
}

function currentBankFact(draft: DeclarationDraft | undefined, question: Article39cQuestion): BankFeeNatureFact | undefined {
  const raw =
    question.scope.level === "PROPERTY"
      ? draft?.biens !== undefined
        ? draft.biens[question.scope.propertyId]?.article39cQualifications
        : draft?.article39cQualifications
      : draft?.article39cActivityQualifications;
  const store = parseQualificationStore(raw);
  const record = store?.records.find((r) => r.recordKind === "CHARGE_NATURE" && r.fact.kind === "BANK_FEE" && r.fact.lineId === question.subjectId && r.fiscalYear === question.fiscalYear);
  return record?.recordKind === "CHARGE_NATURE" ? (record.fact as BankFeeNatureFact) : undefined;
}
