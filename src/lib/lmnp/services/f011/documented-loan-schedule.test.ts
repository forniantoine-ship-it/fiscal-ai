/**
 * R1 — emprunts : l'échéancier documentaire (tableau d'amortissement importé) est la source prioritaire
 * (KS F-011 « Niveau 2 — Disponibilité du tableau d'amortissement (par prêt) » : tableau complet → import →
 * extraction ; tableau perdu → reconstruction depuis 4 inputs). Oracles passant par les CALLERS DE PRODUCTION :
 *  - Tunnel A : `formValuesToFinancing` → `mapCreditFinancingToFinancementCharges` (= CreditDocumentStep.handleConfirm)
 *    → `runDeclarationGeneration` → 2033-B 294 / 2033-A 156 ;
 *  - Tunnel B : `F011FinancementAssistant` piloté par import documentaire (`mapCreditExtractionToF011Prefill`).
 *
 * Chaque scénario documentaire est construit pour que DOCUMENT ≠ RECONSTRUCTION THÉORIQUE.
 *
 * Run: npx tsx --test src/lib/lmnp/services/f011/documented-loan-schedule.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateLoanSchedule } from "@/runtime/capabilities/f011/generate-loan-schedule";
import { computeFinancementExercice } from "@/runtime/capabilities/f011/compute-financement-exercice";
import { F011FinancementAssistant } from "@/runtime/assistants/f011-financement/assistant";
import { emptyLoanFormValues, formValuesToFinancing, type CreditFormValues } from "@/lib/lmnp/services/credit-profile";
import type { CreditFinancingData, DeclarationDraft, LoanInstallment } from "@/lib/lmnp/types";
import { mapCreditExtractionToF011Prefill } from "./credit-bridge";
import { excludedLoanIdsFromFinancing, mapCreditFinancingToFinancementCharges } from "./credit-financing-to-financement-charges";
import { documentaryInstallmentsForCreditFinancing } from "./f011-documentary-installments";
import { runDeclarationGeneration } from "../declaration/run-declaration-generation";
import { spatialRowsToVisibleLoanInstallments } from "../credit-installment-visibility";
import { resolveDocumentaryEcheances } from "@/runtime/capabilities/f011/resolve-documentary-echeances";
import { ALICE_YEAR, aliceDraft } from "../declaration/alice-test-draft";

const EX = ALICE_YEAR; // 2025
const MES = "2025-01-01"; // aucune pré-exploitation : 294 = financement de l'exercice
const CAPITAL = 100000;
const TAUX = 0.02;
const DUREE = 240;
const FIRST = "2025-01-05";
const ASSURANCE_MENSUELLE = 15;
const round2 = (n: number) => Math.round(n * 100) / 100;

function toInstallment(row: { date: string; mensualite: number; interets: number; capital: number; capitalRestantDu: number }): LoanInstallment {
  return {
    date: row.date,
    totalPayment: round2(row.mensualite + ASSURANCE_MENSUELLE),
    principal: row.capital,
    interest: row.interets,
    insurance: ASSURANCE_MENSUELLE,
    fees: 0,
    remainingCapital: row.capitalRestantDu,
  };
}

/** Remboursement anticipé partiel de 30 000 € avec l'échéance de juin 2025, durée conservée. */
function earlyRepaymentTable(): LoanInstallment[] {
  const initial = generateLoanSchedule({ capitalInitial: CAPITAL, tauxNominal: TAUX, dureeMois: DUREE, datePremiereMensualite: FIRST }).echeances;
  const head = initial.slice(0, 6).map(toInstallment);
  const june = head[5]!;
  head[5] = { ...june, principal: round2(june.principal + 30000), totalPayment: round2(june.totalPayment + 30000), remainingCapital: round2(june.remainingCapital! - 30000) };
  const tail = generateLoanSchedule({ capitalInitial: head[5].remainingCapital!, tauxNominal: TAUX, dureeMois: DUREE - 6, datePremiereMensualite: "2025-07-05" }).echeances.map(toInstallment);
  return [...head, ...tail];
}

/** Différé d'amortissement de 6 mois (intérêts seuls) puis amortissement sur 234 mois. */
function deferralTable(): LoanInstallment[] {
  const interestOnly = round2((CAPITAL * TAUX) / 12);
  const deferred: LoanInstallment[] = ["01", "02", "03", "04", "05", "06"].map((m) => ({
    date: `2025-${m}-05`,
    totalPayment: round2(interestOnly + ASSURANCE_MENSUELLE),
    principal: 0,
    interest: interestOnly,
    insurance: ASSURANCE_MENSUELLE,
    fees: 0,
    comment: "Différé / intercalaire",
    remainingCapital: CAPITAL,
  }));
  const amortizing = generateLoanSchedule({ capitalInitial: CAPITAL, tauxNominal: TAUX, dureeMois: DUREE - 6, datePremiereMensualite: "2025-07-05" }).echeances.map(toInstallment);
  return [...deferred, ...amortizing];
}

function docTruth(table: LoanInstallment[]) {
  const inYear = table.filter((r) => r.date.startsWith(`${EX}-`));
  return {
    interest: round2(inYear.reduce((a, r) => a + r.interest, 0)),
    insurance: round2(inYear.reduce((a, r) => a + r.insurance, 0)),
    principal: round2(inYear.reduce((a, r) => a + r.principal, 0)),
    crd: inYear.at(-1)!.remainingCapital!,
  };
}

/** Formulaire Tunnel A tel que pré-rempli par l'extraction puis confirmé (valeurs UI : assurance MENSUELLE). */
function creditForm(table: LoanInstallment[], firstPaymentDate: string, extra: Partial<CreditFormValues["loans"][number]> = {}, loanCount = 1): CreditFormValues {
  const loan = {
    ...emptyLoanFormValues(),
    bank: "Banque R1",
    loanType: "Prêt amortissable",
    borrowedAmount: String(CAPITAL),
    rate: "2",
    durationMonths: String(DUREE),
    insurance: String(ASSURANCE_MENSUELLE),
    loanApplicationFees: "800",
    loanGuaranteeFees: "1200",
    souscritCetExercice: true,
    firstPaymentDate,
    ...extra,
  };
  return {
    loans: Array.from({ length: loanCount }, () => ({ ...loan })),
    summary: { annualInterest: "1", annualInsurance: "180", remainingCapital: "1" },
    installments: table,
  };
}

/** = CreditDocumentStep.handleConfirm (dispatches CONFIRM_CREDIT_FINANCING + DECLARATION_PATCH_DRAFT). */
function confirmTunnelA(form: CreditFormValues): DeclarationDraft {
  const financing = formValuesToFinancing(form, EX);
  const { financementCharges, excludedLoanIds } = mapCreditFinancingToFinancementCharges({
    financing,
    exerciceFiscal: EX,
    dateMiseEnService: MES,
  });
  return aliceDraft(undefined, {
    creditFinancing: financing,
    creditConfirmedAt: "2026-03-01T10:00:00.000Z",
    financementCharges: { ...financementCharges, excludedLoanIds },
  }, MES);
}

function declare(draft: DeclarationDraft) {
  return runDeclarationGeneration(draft, EX);
}

function cases(draft: DeclarationDraft) {
  const g = declare(draft);
  assert.equal(g.status, "generated", g.status === "blocked" ? JSON.stringify(g.anomalies) : "");
  if (g.status !== "generated") throw new Error("unreachable");
  return {
    c294: g.liasseRfs.form2033B.cases.find((c) => c.caseId === "294")?.value as number | undefined,
    c242: g.liasseRfs.form2033B.cases.find((c) => c.caseId === "242")?.value as number | undefined,
    c156: g.liasseRfs.form2033A.cases.find((c) => c.caseId === "156")?.value as number | undefined,
    financement: draft.financementCharges!,
  };
}

function fallbackCases() {
  return cases(confirmTunnelA(creditForm([], FIRST)));
}

/** Reconstruction théorique depuis les 4 inputs (comportement pré-R1 de tous les chemins). */
function reconstruction(firstPaymentDate: string) {
  return computeFinancementExercice({
    exerciceFiscal: EX,
    dateMiseEnService: MES,
    prets: [{ pretId: "x", typePret: "amortissable", capitalInitial: CAPITAL, tauxNominal: TAUX, dureeMois: DUREE, datePremiereMensualite: firstPaymentDate, assuranceAnnuelle: ASSURANCE_MENSUELLE * 12 }],
  }).charges.prets[0]!;
}

describe("R1 — Tunnel A (CreditDocumentStep.handleConfirm) : le tableau documentaire est prioritaire", () => {
  it("TEST 2/3/4/5/6 — remboursement anticipé : intérêts, 294, CRD, 156 suivent le document ; assurance/frais/garantie inchangés", () => {
    const table = earlyRepaymentTable();
    const doc = docTruth(table);
    const recon = reconstruction(FIRST);
    assert.notEqual(recon.interetsEmpruntExercice, doc.interest, "précondition : document ≠ reconstruction (intérêts)");
    assert.notEqual(recon.capitalRestantDu31_12, doc.crd, "précondition : document ≠ reconstruction (CRD)");

    const { c294, c242, c156, financement } = cases(confirmTunnelA(creditForm(table, FIRST)));
    const pret = financement.prets[0]!;
    assert.equal(pret.interetsEmpruntExercice, doc.interest, `intérêts = document (${doc.interest}), jamais la reconstruction (${recon.interetsEmpruntExercice})`);
    assert.equal(pret.capitalRestantDu31_12, doc.crd, `CRD = document (${doc.crd}), jamais la reconstruction (${recon.capitalRestantDu31_12})`);
    assert.equal(pret.capitalRembourseExercice, doc.principal);
    // TEST 5 — assurance : 12 × 15 = 180, une seule fois (jamais tableau + montant du formulaire).
    assert.equal(pret.assuranceEmpruntExercice, 180);
    assert.equal(financement.totalAssurance, 180);
    // TEST 6 — frais de dossier / garantie : transport inchangé, déduits une seule fois.
    assert.equal(pret.fraisDossierDeductibles, 800);
    assert.equal(pret.garantieDeductible, 1200);
    // TEST 3 — 294 (mapping HEAD : intérêts + assurance + garantie ; frais de dossier en 242, inchangé par R1).
    assert.equal(c294, round2(doc.interest + 180 + 1200), "2033-B 294 suit l'intérêt documentaire");
    assert.equal(c242, fallbackCases().c242, "242 (frais de dossier) strictement inchangé par la source des intérêts");
    // TEST 4 — 156 = CRD documentaire.
    assert.equal(c156, doc.crd, "2033-A 156 suit le CRD documentaire");
  });

  it("différé d'amortissement : les intérêts du différé ne disparaissent pas au profit d'une reconstruction démarrant à la 1re échéance amortissable", () => {
    const table = deferralTable();
    const doc = docTruth(table);
    // Le pré-remplissage Tunnel A fixe firstPaymentDate = première échéance AMORTISSABLE (findFirstAmortizingInstallment).
    const recon = reconstruction("2025-07-05");
    assert.notEqual(recon.interetsEmpruntExercice, doc.interest, "précondition : document ≠ reconstruction");
    const { c294, c156, financement } = cases(confirmTunnelA(creditForm(table, "2025-07-05")));
    assert.equal(financement.prets[0]!.interetsEmpruntExercice, doc.interest);
    assert.equal(c294, round2(doc.interest + 180 + 1200));
    assert.equal(c156, doc.crd);
  });

  it("TEST 1 — aucun tableau importé : reconstruction existante inchangée (fallback)", () => {
    const recon = reconstruction(FIRST);
    const { c294, c156, financement } = fallbackCases();
    const pret = financement.prets[0]!;
    assert.equal(pret.interetsEmpruntExercice, recon.interetsEmpruntExercice);
    assert.equal(pret.capitalRestantDu31_12, recon.capitalRestantDu31_12);
    assert.equal(pret.assuranceEmpruntExercice, recon.assuranceEmpruntExercice);
    assert.equal(pret.fraisDossierDeductibles, 800);
    assert.equal(pret.garantieDeductible, 1200);
    assert.equal(c294, round2(recon.interetsEmpruntExercice + recon.assuranceEmpruntExercice + 1200));
    assert.equal(c156, recon.capitalRestantDu31_12);
  });

  it("TEST 5 bis — tableau sans colonne assurance + assurance externe saisie : l'assurance saisie reste comptée (jamais perdue)", () => {
    const table = earlyRepaymentTable().map((r) => ({ ...r, insurance: 0, totalPayment: round2(r.totalPayment - ASSURANCE_MENSUELLE) }));
    const { financement } = cases(confirmTunnelA(creditForm(table, FIRST)));
    assert.equal(financement.prets[0]!.interetsEmpruntExercice, docTruth(table).interest);
    assert.equal(financement.prets[0]!.assuranceEmpruntExercice, 180);
  });
});

describe("R1 — tableau présent mais inexploitable ou non attribuable : jamais de substitution silencieuse (fail-closed)", () => {
  function assertBlocked(form: CreditFormValues, label: string) {
    const draft = confirmTunnelA(form);
    assert.ok(excludedLoanIdsFromFinancing(draft.creditFinancing, EX).length > 0, `${label} : prêt(s) signalé(s) au gate`);
    const g = declare(draft);
    assert.equal(g.status, "blocked", `${label} : la déclaration ne doit pas être générée sur une reconstruction`);
    if (g.status === "blocked") {
      assert.ok(g.anomalies.some((a) => a.field === "financementCharges.excludedLoanIds"), `${label} : anomalie de gate prêt`);
    }
  }

  it("TEST 7 — deux prêts + un échéancier global non attribuable : aucun prêt ne reçoit le tableau, blocage", () => {
    const form = creditForm(earlyRepaymentTable(), FIRST, {}, 2);
    const financing = formValuesToFinancing(form, EX);
    const { financementCharges } = mapCreditFinancingToFinancementCharges({ financing, exerciceFiscal: EX, dateMiseEnService: MES });
    const doc = docTruth(form.installments!);
    assert.ok(
      financementCharges.prets.every((p) => p.interetsEmpruntExercice !== doc.interest),
      "le tableau n'est jamais affecté (ni au premier prêt, ni dupliqué)",
    );
    assertBlocked(form, "multi-prêts");
  });

  it("ATTAQUE 2 — tableau tronqué en cours d'exercice (CRD non nul) : blocage, jamais 3 mois d'intérêts déclarés", () => {
    assertBlocked(creditForm(earlyRepaymentTable().slice(0, 3), FIRST), "tronqué");
  });

  it("ATTAQUE 2 bis — mois manquant dans l'exercice : blocage", () => {
    const table = earlyRepaymentTable();
    assertBlocked(creditForm([...table.slice(0, 3), ...table.slice(4)], FIRST), "trou");
  });

  it("ATTAQUE 7 — CRD non documenté sur le tableau : blocage (156 jamais inventé)", () => {
    const table = earlyRepaymentTable().map((r) => ({ ...r, remainingCapital: undefined }));
    assertBlocked(creditForm(table, FIRST), "sans CRD");
  });

  it("tableau commençant après le début d'exercice sans être l'origine du prêt : blocage (tableau partiel)", () => {
    assertBlocked(creditForm(earlyRepaymentTable().slice(3), FIRST), "partiel");
  });
});

describe("R1 — Tunnel B (assistant F-011) : même contrat", () => {
  const ctx = { dossierId: "r1", fiscalYear: EX, route: "/assistants/financement" };

  async function runAssistant(
    table: LoanInstallment[] | undefined,
    insurance: { assuranceType: "bancaire" | "externe"; assuranceAnnuelle?: number } = { assuranceType: "bancaire", assuranceAnnuelle: ASSURANCE_MENSUELLE * 12 },
  ) {
    const assistant = new F011FinancementAssistant(ctx, { dateMiseEnService: MES });
    const prefill = mapCreditExtractionToF011Prefill(
      {
        amortization: { loanAmount: CAPITAL, loanDurationMonths: DUREE, firstPaymentDate: FIRST, ...(table ? { installments: table } : {}) },
        loanOffer: { loanType: "Prêt amortissable", interestRate: 2 },
      },
      "doc-r1",
      "2026-03-01T10:00:00.000Z",
    );
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-r1" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-r1", prefill });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_insurance");
    turn = await assistant.handle(turn.state, { type: "set_insurance", ...insurance });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "caution", commissionCaution: 1200 });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: true, fraisDossier: 800 });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    const preview = turn.messages.map((m) => m.content).join("\n");
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    return Object.assign(turn.state, { preview });
  }

  /** Persistance réelle du panel (persistCompletion) réduite à ce que lit le gate : prêts + échéancier transporté. */
  function persistedFinancing(state: Awaited<ReturnType<typeof runAssistant>>): CreditFinancingData {
    return {
      loans: state.loans.map((loan) => ({ id: loan.pretId, bank: "Prêt", loanType: loan.typePret, borrowedAmount: loan.capitalInitial, rate: loan.tauxNominal * 100, durationMonths: loan.dureeMois, monthlyPayment: 0, insurance: loan.assuranceAnnuelle ?? 0, ...(loan.assuranceType ? { assuranceType: loan.assuranceType } : {}), fees: 0, loanApplicationFees: loan.fraisDossier, souscritCetExercice: loan.souscritCetExercice, startDate: loan.datePremiereMensualite, firstPaymentDate: loan.datePremiereMensualite, remainingCapital: 0 })),
      summary: { fiscalYearLabel: String(EX), annualInterest: 0, annualInsurance: 0, remainingCapital: 0 },
      installments: documentaryInstallmentsForCreditFinancing(state.loans),
    };
  }

  it("ATTAQUE 2 (assistant) — tableau tronqué : montants annoncés comme reconstitués, anomalie bloquante, gate F-006 bloque", async () => {
    const state = await runAssistant(earlyRepaymentTable().slice(0, 3));
    assert.match(state.preview, /tableau d'amortissement importé n'est pas exploitable/);
    assert.ok(state.result!.anomalies.some((a) => a.severity === "error" && a.field === "financementCharges.excludedLoanIds"));
    assert.deepEqual(excludedLoanIdsFromFinancing(persistedFinancing(state), EX), [state.loans[0]!.pretId]);
  });

  it("ATTAQUE 6 (assistant) — assurance déclarée externe alors que le tableau porte une assurance bancaire : jamais additionnées, blocage", async () => {
    const state = await runAssistant(earlyRepaymentTable(), { assuranceType: "externe", assuranceAnnuelle: 300 });
    assert.match(state.preview, /assurance déclarée externe/);
    assert.ok(state.result!.anomalies.some((a) => a.field === "financementCharges.excludedLoanIds"));
    assert.deepEqual(excludedLoanIdsFromFinancing(persistedFinancing(state), EX), [state.loans[0]!.pretId], "le gate F-006 reproduit le blocage annoncé");
  });

  it("TEST 7 (assistant) — deux prêts dont un avec tableau : jamais silencieux, le financement persisté est bloquant", async () => {
    const assistant = new F011FinancementAssistant(ctx, { dateMiseEnService: MES });
    const table = earlyRepaymentTable();
    const prefill = mapCreditExtractionToF011Prefill(
      { amortization: { loanAmount: CAPITAL, loanDurationMonths: DUREE, firstPaymentDate: FIRST, installments: table }, loanOffer: { loanType: "Prêt amortissable", interestRate: 2 } },
      "doc-a",
      "2026-03-01T10:00:00.000Z",
    );
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 2 });
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-a" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-a", prefill });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    for (const action of [
      { type: "set_insurance", assuranceType: "bancaire" },
      { type: "set_guarantee", typeGarantie: "aucune" },
      { type: "set_fees", souscritCetExercice: false },
      { type: "set_ira", remboursementAnticipe: false },
      { type: "confirm_loan" },
      { type: "choose_loan_source", source: "manual" },
      { type: "set_loan_type", typePret: "amortissable" },
      { type: "submit_loan_terms", capitalInitial: 20000, tauxNominal: 0.01, dureeMois: 120, datePremiereMensualite: FIRST },
      { type: "set_insurance", assuranceType: "bancaire" },
      { type: "set_guarantee", typeGarantie: "aucune" },
      { type: "set_fees", souscritCetExercice: false },
      { type: "set_ira", remboursementAnticipe: false },
      { type: "confirm_loan" },
    ] as const) {
      turn = await assistant.handle(turn.state, action as never);
    }
    assert.equal(turn.state.loans.length, 2);
    assert.equal(turn.state.result?.charges.prets[0]?.interetsEmpruntExercice, docTruth(table).interest, "dans l'assistant, le tableau est rattaché à SON prêt");
    assert.ok(turn.state.result!.anomalies.some((a) => a.field === "financementCharges.excludedLoanIds"), "annoncé, jamais silencieux");
    assert.equal(excludedLoanIdsFromFinancing(persistedFinancing(Object.assign(turn.state, { preview: "" })), EX).length, 2, "le dossier ne peut pas rattacher le tableau : bloqué");
  });

  it("TEST 9 — tableau importé dans l'assistant : intérêts, CRD, assurance, frais suivent le document", async () => {
    const table = earlyRepaymentTable();
    const doc = docTruth(table);
    const state = await runAssistant(table);
    const pret = state.result!.charges.prets[0]!;
    assert.equal(pret.interetsEmpruntExercice, doc.interest, "l'assistant ne reconstruit plus silencieusement");
    assert.equal(pret.capitalRestantDu31_12, doc.crd);
    assert.equal(pret.assuranceEmpruntExercice, 180, "assurance du tableau, jamais tableau + montant saisi");
    assert.equal(pret.fraisDossierDeductibles, 800);
    assert.equal(pret.garantieDeductible, 1200);
    // La persistance (panel) transporte l'échéancier vers le `creditFinancing` canonique : une reconfirmation
    // Tunnel A ultérieure applique le même contrat au lieu de reconstruire.
    const installments = documentaryInstallmentsForCreditFinancing(state.loans);
    assert.equal(installments.length, table.length);
    const financing: CreditFinancingData = {
      loans: [{ id: state.loans[0]!.pretId, bank: "Prêt 1", loanType: "amortissable", borrowedAmount: CAPITAL, rate: 2, durationMonths: DUREE, monthlyPayment: 0, insurance: 180, fees: 0, startDate: FIRST, firstPaymentDate: FIRST, remainingCapital: 0 }],
      summary: { fiscalYearLabel: String(EX), annualInterest: 0, annualInsurance: 0, remainingCapital: 0 },
      installments,
    };
    const replay = mapCreditFinancingToFinancementCharges({ financing, exerciceFiscal: EX, dateMiseEnService: MES });
    assert.equal(replay.financementCharges.prets[0]!.interetsEmpruntExercice, doc.interest, "Tunnel A après Tunnel B : même vérité documentaire");
  });

  it("TEST 1 (assistant) — sans tableau : reconstruction inchangée", async () => {
    const state = await runAssistant(undefined);
    const recon = reconstruction(FIRST);
    assert.equal(state.result!.charges.prets[0]!.interetsEmpruntExercice, recon.interetsEmpruntExercice);
    assert.equal(state.result!.charges.prets[0]!.capitalRestantDu31_12, recon.capitalRestantDu31_12);
    assert.deepEqual(documentaryInstallmentsForCreditFinancing(state.loans), []);
  });
});

describe("R1 — contrat documentaire (resolveDocumentaryEcheances) : cas limites", () => {
  it("prêt soldé avant l'exercice (dernier CRD imprimé = 0) : exploitable, 0 € d'intérêts, CRD 0", () => {
    const table = earlyRepaymentTable().slice(0, 2).map((r, i) => ({ ...r, date: `2024-${i === 0 ? "11" : "12"}-05`, remainingCapital: i === 0 ? 50 : 0 }));
    const res = resolveDocumentaryEcheances({ rows: table, exerciceFiscal: EX });
    assert.equal(res.status, "exploitable");
    const charges = computeFinancementExercice({ exerciceFiscal: EX, dateMiseEnService: MES, prets: [{ pretId: "s", typePret: "amortissable", capitalInitial: CAPITAL, tauxNominal: TAUX, dureeMois: DUREE, datePremiereMensualite: "2024-11-05", echeances: res.status === "exploitable" ? res.echeances : undefined }] }).charges.prets[0]!;
    assert.equal(charges.interetsEmpruntExercice, 0);
    assert.equal(charges.capitalRestantDu31_12, 0);
  });

  it("ATTAQUE 4 — remboursement anticipé saisi comme 2e ligne du même mois : jamais additionné à l'aveugle (doublon possible), non exploitable", () => {
    const table = earlyRepaymentTable();
    const extra = { ...table[5]!, principal: 1000, interest: 0, insurance: 0 };
    const res = resolveDocumentaryEcheances({ rows: [...table, extra], exerciceFiscal: EX });
    assert.equal(res.status, "non_exploitable");
  });

  it("aucun tableau → absent (fallback reconstruction) ; montant négatif → non exploitable", () => {
    assert.equal(resolveDocumentaryEcheances({ rows: [], exerciceFiscal: EX }).status, "absent");
    const table = earlyRepaymentTable();
    table[2] = { ...table[2]!, interest: -1 };
    assert.equal(resolveDocumentaryEcheances({ rows: table, exerciceFiscal: EX }).status, "non_exploitable");
  });

  it("extraction spatiale : le CRD imprimé de chaque ligne est transporté jusqu'à LoanInstallment (jamais perdu)", () => {
    const { installments } = spatialRowsToVisibleLoanInstallments([
      { date: "2025-01-05", payment: 520, principal: 350, interest: 155, insurance: 15, remainingCapital: 99650 },
      { date: "2025-02-05", payment: 520, principal: 351, interest: 154, insurance: 15 },
    ]);
    assert.equal(installments[0]!.remainingCapital, 99650);
    assert.equal("remainingCapital" in installments[1]!, false, "CRD non lu : absent, jamais inventé");
  });
});
