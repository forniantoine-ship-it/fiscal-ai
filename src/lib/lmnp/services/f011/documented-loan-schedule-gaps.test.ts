/**
 * R1.x — trois défauts résiduels démontrés par l'audit adverse (Astra) sur R1 (3d8454d), reproduits
 * par les CALLERS DE PRODUCTION :
 *  P0-A — un tableau tronqué au début prouvait sa propre complétude initiale (date de 1re échéance
 *         préremplie depuis sa propre 1re ligne) ;
 *  P0-B — la génération faisait confiance à des `financementCharges` persistées périmées / absentes
 *         alors que l'échéancier documentaire courant est exploitable ;
 *  P0-C — le type d'assurance (assistant F-011) disparaissait à la reconfirmation Tunnel A, levant
 *         silencieusement le blocage « assurance externe + assurance bancaire dans le tableau ».
 *
 * Run: npx tsx --test src/lib/lmnp/services/f011/documented-loan-schedule-gaps.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateLoanSchedule } from "@/runtime/capabilities/f011/generate-loan-schedule";
import { buildCreditAmortizationFromSpatial } from "@/lib/lmnp/parsers/spatial-amortization-primary";
import type { SpatialInstallment } from "@/lib/lmnp/parsers/spatial-amortization-core";
import { creditFromDraft, hydrateCreditFormFromSession } from "@/lib/lmnp/services/credit-gpt-ui-prefill";
import { emptyLoanFormValues, formValuesToFinancing, type CreditFormValues } from "@/lib/lmnp/services/credit-profile";
import type { CreditFinancingData, DeclarationDraft, LoanInstallment } from "@/lib/lmnp/types";
import { excludedLoanIdsFromFinancing, mapCreditFinancingToFinancementCharges } from "./credit-financing-to-financement-charges";
import { mapCreditExtractionToF011Prefill } from "./credit-bridge";
import { documentaryInstallmentsForCreditFinancing } from "./f011-documentary-installments";
import { F011FinancementAssistant } from "@/runtime/assistants/f011-financement/assistant";
import { runDeclarationGeneration } from "../declaration/run-declaration-generation";
import { ALICE_YEAR, aliceDraft } from "../declaration/alice-test-draft";

const EX = ALICE_YEAR; // 2025
const MES = "2025-01-01";
const round2 = (n: number) => Math.round(n * 100) / 100;
const month = (m: number) => `${EX}-${String(m).padStart(2, "0")}-05`;

/** = CreditDocumentStep.handleConfirm → draft persisté. */
function confirmTunnelA(form: CreditFormValues, extra: Partial<DeclarationDraft> = {}): DeclarationDraft {
  const financing = formValuesToFinancing(form, EX);
  const { financementCharges, excludedLoanIds } = mapCreditFinancingToFinancementCharges({ financing, exerciceFiscal: EX, dateMiseEnService: MES });
  return aliceDraft(undefined, {
    creditFinancing: financing,
    creditConfirmedAt: "2026-03-01T10:00:00.000Z",
    financementCharges: { ...financementCharges, excludedLoanIds },
    ...extra,
  }, MES);
}

function generate(draft: DeclarationDraft) {
  const g = runDeclarationGeneration(draft, EX);
  if (g.status !== "generated") return { status: g.status, anomalies: g.anomalies };
  return {
    status: g.status,
    c294: g.liasseRfs.form2033B.cases.find((c) => c.caseId === "294")?.value as number | undefined,
    c156: g.liasseRfs.form2033A.cases.find((c) => c.caseId === "156")?.value as number | undefined,
  };
}

// ── P0-A ────────────────────────────────────────────────────────────────────────────────────────
// Prêt de 12 000 € sur 12 mois 2025 : 1 000 € de capital + 100 € d'intérêts + 15 € d'assurance par mois.
function spatialRows(fromMonth: number): SpatialInstallment[] {
  return Array.from({ length: 13 - fromMonth }, (_, i) => {
    const m = fromMonth + i;
    return { rank: m, date: month(m), payment: 1115, principal: 1000, interest: 100, insurance: 15, remainingCapital: 12000 - 1000 * m };
  });
}

function spatialExtraction(rows: SpatialInstallment[]) {
  return buildCreditAmortizationFromSpatial(
    { success: true, confidenceScore: 95, installments: rows, detectedColumns: ["rank", "date", "payment", "principal", "interest", "insurance", "remainingCapital"], detectedInstallmentRows: rows.length },
    EX,
  );
}

/**
 * Chaîne réelle : parseur spatial → extraction → préremplissage Tunnel A (date/capital tirés du tableau),
 * avec, le cas échéant, une offre de prêt analysée comme document distinct (emplacement `loanOffer`).
 */
function tunnelAFromSpatial(rows: SpatialInstallment[], offerLoanAmount?: number): CreditFormValues {
  const session = {
    amortization: spatialExtraction(rows),
    ...(offerLoanAmount !== undefined ? { loanOffer: { loanAmount: offerLoanAmount, interestRate: 2, loanType: "Prêt amortissable" } } : {}),
  };
  return hydrateCreditFormFromSession({ session: session as never, revenueYear: EX }).nextValues;
}

/** Prêt de 9 000 € réellement démarré en avril : échéances n° 1 à 9 imprimées. */
function newLoanFromApril(): SpatialInstallment[] {
  return spatialRows(4).map((r, i) => ({ ...r, rank: i + 1, remainingCapital: 9000 - 1000 * (i + 1) }));
}

describe("P0-A — un tableau tronqué au début ne prouve jamais sa propre complétude initiale", () => {
  it("contrôle : tableau complet janvier–décembre → 294 = 12 × (100 + 15) = 1 380 €", () => {
    const r = generate(confirmTunnelA(tunnelAFromSpatial(spatialRows(1))));
    assert.equal(r.status, "generated", JSON.stringify(r));
    assert.equal(r.c294, 1380);
    assert.equal(r.c156, 0);
  });

  it("TEST 1 — janvier–mars retirés (1re ligne imprimée n° 4) : jamais 294 = 1 035 € silencieux → blocage", () => {
    const form = tunnelAFromSpatial(spatialRows(4));
    assert.equal(form.loans[0]!.firstPaymentDate, month(4), "précondition Astra : la date d'origine est tirée du tableau lui-même");
    const draft = confirmTunnelA(form);
    const r = generate(draft);
    assert.notEqual(r.c294, 1035, "345 € d'intérêts/assurance omis en silence");
    assert.equal(r.status, "blocked");
    assert.ok(r.anomalies?.some((a) => a.field === "financementCharges.excludedLoanIds"));
  });

  it("VER opt. 2 — prêt réellement démarré en avril (n° 1 imprimé) + offre distincte 9 000 € cohérente : accepté, 9 × 115 = 1 035 €", () => {
    const draft = confirmTunnelA(tunnelAFromSpatial(newLoanFromApril(), 9000));
    assert.equal(draft.creditFinancing!.loans[0]!.capitalInitialOffre, 9000, "preuve issue de l'emplacement offre");
    const r = generate(draft);
    assert.equal(r.status, "generated", JSON.stringify(r));
    assert.equal(r.c294, 1035);
    assert.equal(r.c156, 0);
    // La preuve survit à la sauvegarde / restauration / reconfirmation Tunnel A.
    const saved: DeclarationDraft = JSON.parse(JSON.stringify(draft));
    const reconfirmed = confirmTunnelA(creditFromDraft(saved, EX));
    assert.equal(reconfirmed.creditFinancing!.loans[0]!.capitalInitialOffre, 9000);
    assert.equal(generate(reconfirmed).status, "generated");
  });

  it("VER opt. 2 — n° 1 imprimé SANS preuve indépendante : bloqué (le capital prérempli depuis le tableau ne compte pas)", () => {
    const form = tunnelAFromSpatial(newLoanFromApril());
    assert.equal(form.loans[0]!.borrowedAmount, "8000", "précondition : le capital du formulaire est tiré du tableau (1er CRD)");
    const r = generate(confirmTunnelA(form));
    assert.equal(r.status, "blocked");
    // Même si l'utilisateur corrige le capital du formulaire au « bon » montant : ce n'est pas un document distinct.
    const corrected = { ...form, loans: [{ ...form.loans[0]!, borrowedAmount: "9000" }] };
    assert.equal(generate(confirmTunnelA(corrected)).status, "blocked");
  });

  it("VER opt. 2 — tableau renuméroté n° 1 après renégociation, offre d'origine 12 000 € contradictoire : bloqué", () => {
    // Mêmes lignes qu'un prêt neuf de 9 000 €, mais l'offre d'origine prouve un capital de 12 000 € :
    // janvier–mars (ancien tableau) manquent → jamais 1 035 € silencieux.
    const r = generate(confirmTunnelA(tunnelAFromSpatial(newLoanFromApril(), 12000)));
    assert.equal(r.status, "blocked");
    assert.notEqual(r.c294, 1035);
  });

  it("rang non imprimé et tableau commençant en cours d'exercice : origine non démontrable → blocage", () => {
    const rows = spatialRows(4).map((r, i) => ({ ...r, rank: undefined, remainingCapital: 9000 - 1000 * (i + 1) }));
    assert.equal(generate(confirmTunnelA(tunnelAFromSpatial(rows))).status, "blocked");
  });
});

// ── P0-B ────────────────────────────────────────────────────────────────────────────────────────
// Oracle remboursement anticipé (R1) : 100 000 € / 2 % / 240 mois, 1re échéance 05/01/2025, +30 000 € en juin,
// assurance 15 €/mois, garantie 1 200 € souscrite dans l'exercice.
const ASSURANCE = 15;
function toInstallment(row: { date: string; mensualite: number; interets: number; capital: number; capitalRestantDu: number }): LoanInstallment {
  return { date: row.date, totalPayment: round2(row.mensualite + ASSURANCE), principal: row.capital, interest: row.interets, insurance: ASSURANCE, fees: 0, remainingCapital: row.capitalRestantDu };
}
function earlyRepaymentTable(): LoanInstallment[] {
  const initial = generateLoanSchedule({ capitalInitial: 100000, tauxNominal: 0.02, dureeMois: 240, datePremiereMensualite: "2025-01-05" }).echeances;
  const head = initial.slice(0, 6).map(toInstallment);
  const june = head[5]!;
  head[5] = { ...june, principal: round2(june.principal + 30000), totalPayment: round2(june.totalPayment + 30000), remainingCapital: round2(june.remainingCapital! - 30000) };
  const tail = generateLoanSchedule({ capitalInitial: head[5].remainingCapital!, tauxNominal: 0.02, dureeMois: 234, datePremiereMensualite: "2025-07-05" }).echeances.map(toInstallment);
  return [...head, ...tail];
}
function earlyRepaymentForm(installments: LoanInstallment[]): CreditFormValues {
  return {
    loans: [{ ...emptyLoanFormValues(), bank: "Banque R1", loanType: "Prêt amortissable", borrowedAmount: "100000", rate: "2", durationMonths: "240", insurance: String(ASSURANCE), loanGuaranteeFees: "1200", souscritCetExercice: true, firstPaymentDate: "2025-01-05" }],
    summary: { annualInterest: "1", annualInsurance: "180", remainingCapital: "1" },
    installments,
  };
}

describe("P0-B — la génération ne fait jamais confiance à des charges périmées ou absentes face au document courant", () => {
  const table = earlyRepaymentTable();
  const inYear = table.filter((r) => r.date.startsWith(`${EX}-`));
  const DOC_INTEREST = round2(inYear.reduce((a, r) => a + r.interest, 0));
  const DOC_CRD = inYear.at(-1)!.remainingCapital!;

  it("fixture : intérêts documentaires 1 665,11 €, CRD documentaire 66 524,13 € (lus sur les lignes)", () => {
    assert.equal(DOC_INTEREST, 1665.11);
    assert.equal(DOC_CRD, 66524.13);
  });

  it("TEST 5 — nominal : 294 = 1 665,11 + 180 + 1 200 = 3 045,11 € ; 156 = 66 524,13 €", () => {
    const r = generate(confirmTunnelA(earlyRepaymentForm(table)));
    assert.equal(r.status, "generated", JSON.stringify(r));
    assert.equal(r.c294, 3045.11);
    assert.equal(r.c156, 66524.13);
  });

  it("reconfirmation (charges recalculées depuis le document courant) : la génération reprend, 3 045,11 / 66 524,13", () => {
    const r = generate(confirmTunnelA(earlyRepaymentForm(table)));
    assert.equal(r.status, "generated");
    assert.equal(r.c294, 3045.11);
    assert.equal(r.c156, 66524.13);
  });

  it("TEST 2 — document courant + charges théoriques périmées (1 962,49 / 95 891,93) : jamais publiées", () => {
    const staleFinancing = formValuesToFinancing(earlyRepaymentForm([]), EX);
    const stale = mapCreditFinancingToFinancementCharges({ financing: staleFinancing, exerciceFiscal: EX, dateMiseEnService: MES }).financementCharges;
    assert.equal(stale.prets[0]!.interetsEmpruntExercice, 1962.49, "précondition : charges théoriques");
    assert.equal(stale.prets[0]!.capitalRestantDu31_12, 95891.93);
    const draft = confirmTunnelA(earlyRepaymentForm(table), { financementCharges: stale });
    const r = generate(draft);
    assert.notEqual(r.c294, 3342.49, "294 théorique périmé");
    assert.notEqual(r.c156, 95891.93, "156 théorique périmé");
    assert.equal(r.status, "blocked", "cohérence non démontrée → blocage (jamais de publication)");
    assert.ok(r.anomalies?.some((a) => a.field === "financementCharges.excludedLoanIds"));
  });

  it("TEST 3 — document courant + financementCharges absentes : jamais 294 = 0 / 156 absent", () => {
    const draft = confirmTunnelA(earlyRepaymentForm(table), { financementCharges: undefined });
    const r = generate(draft);
    assert.notEqual(r.c294, 0);
    assert.equal(r.status, "blocked", "cohérence non démontrée → blocage (jamais de publication)");
    assert.ok(r.anomalies?.some((a) => a.field === "financementCharges.excludedLoanIds"));
  });

  it("TEST 6 — sans document : charges théoriques persistées = vérité, génération inchangée", () => {
    const r = generate(confirmTunnelA(earlyRepaymentForm([])));
    assert.equal(r.status, "generated", JSON.stringify(r));
    assert.equal(r.c294, round2(1962.49 + 180 + 1200));
    assert.equal(r.c156, 95891.93);
  });
});

// ── P0-C ────────────────────────────────────────────────────────────────────────────────────────
describe("P0-C — le conflit assurance externe / assurance du tableau survit à la reconfirmation Tunnel A", () => {
  /** `creditFinancing` tel que persisté par F011FinancementAssistantPanel.persistCompletion. */
  function f011Financing(): CreditFinancingData {
    return {
      loans: [{ id: "pret-1", bank: "Prêt 1", loanType: "amortissable", borrowedAmount: 100000, rate: 2, durationMonths: 240, monthlyPayment: 0, insurance: 300, assuranceType: "externe", fees: 0, loanGuaranteeFees: 1200, souscritCetExercice: true, startDate: "2025-01-05", firstPaymentDate: "2025-01-05", remainingCapital: 66524.13 }],
      summary: { fiscalYearLabel: String(EX), annualInterest: 1665.11, annualInsurance: 0, remainingCapital: 66524.13 },
      installments: earlyRepaymentTable(),
    };
  }

  it("TEST 4 — BLOQUÉ avant reconfirmation → toujours BLOQUÉ après sauvegarde/restauration/reconfirmation A", () => {
    const financing = f011Financing();
    assert.deepEqual(excludedLoanIdsFromFinancing(financing, EX), ["pret-1"], "avant : bloqué");
    const saved: DeclarationDraft = JSON.parse(JSON.stringify(aliceDraft(undefined, { creditFinancing: financing, creditConfirmedAt: "2026-03-01T10:00:00.000Z" }, MES)));
    const restoredForm = creditFromDraft(saved, EX); // CreditDocumentStep : restauration passive
    const reconfirmed = confirmTunnelA(restoredForm);
    assert.equal(reconfirmed.creditFinancing!.loans[0]!.assuranceType, "externe", "le type d'assurance survit à l'aller-retour");
    assert.ok(excludedLoanIdsFromFinancing(reconfirmed.creditFinancing, EX).length > 0, "après : toujours bloqué");
    assert.equal(generate(reconfirmed).status, "blocked");
  });
});

describe("P0-A (VER opt. 2) — assistant F-011 : même preuve, document distinct obligatoire", () => {
  const ctx = { dossierId: "r1x", fiscalYear: EX, route: "/assistants/financement" };

  async function run(uploads: { amortization?: unknown; loanOffer?: unknown }[]) {
    const assistant = new F011FinancementAssistant(ctx, { dateMiseEnService: MES });
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
    for (const [i, upload] of uploads.entries()) {
      turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "document" });
      turn = await assistant.handle(turn.state, { type: "upload_document", documentId: `doc-${i}` });
      const prefill = mapCreditExtractionToF011Prefill(upload as never, `doc-${i}`, "2026-03-01T10:00:00.000Z");
      turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: `doc-${i}`, prefill });
      for (const c of turn.state.extractionConflicts ?? []) {
        turn = await assistant.handle(turn.state, { type: "resolve_conflict", field: c.field, choice: "keep_existing" });
      }
    }
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    if (turn.state.step === "loan_type") turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    if (turn.state.step === "loan_collect") {
      turn = await assistant.handle(turn.state, { type: "submit_loan_terms", capitalInitial: 9000, tauxNominal: 0.02, dureeMois: 9, datePremiereMensualite: month(4) });
    }
    for (const action of [
      { type: "set_insurance", assuranceType: "bancaire" },
      { type: "set_guarantee", typeGarantie: "aucune" },
      { type: "set_fees", souscritCetExercice: false },
      { type: "set_ira", remboursementAnticipe: false },
      { type: "confirm_loan" },
      { type: "confirm_all" },
    ]) turn = await assistant.handle(turn.state, action as never);
    const loan = turn.state.loans[0]!;
    const financing: CreditFinancingData = {
      loans: [{ id: loan.pretId, bank: "Prêt 1", loanType: loan.typePret, borrowedAmount: loan.capitalInitial, rate: 2, durationMonths: loan.dureeMois, monthlyPayment: 0, insurance: 0, ...(loan.capitalInitialOffre !== undefined ? { capitalInitialOffre: loan.capitalInitialOffre } : {}), fees: 0, souscritCetExercice: false, startDate: loan.datePremiereMensualite, firstPaymentDate: loan.datePremiereMensualite, remainingCapital: 0 }],
      summary: { fiscalYearLabel: String(EX), annualInterest: 0, annualInsurance: 0, remainingCapital: 0 },
      installments: documentaryInstallmentsForCreditFinancing(turn.state.loans),
    };
    return { state: turn.state, financing };
  }

  const table = () => ({ amortization: spatialExtraction(newLoanFromApril()) });
  const offer = (loanAmount: number) => ({ loanOffer: { loanAmount, interestRate: 2, loanType: "Prêt amortissable" } });

  it("offre importée à part (9 000 €) + tableau : accepté, intérêts 900 €, gate libre", async () => {
    const { state, financing } = await run([offer(9000), table()]);
    assert.equal(state.loans[0]!.capitalInitialOffre, 9000);
    assert.equal(state.result!.charges.prets[0]!.interetsEmpruntExercice, 900);
    assert.deepEqual(excludedLoanIdsFromFinancing(financing, EX), []);
  });

  it("tableau seul (n° 1 imprimé) : bloqué, annoncé", async () => {
    const { state, financing } = await run([table()]);
    assert.ok(state.result!.anomalies.some((a) => a.field === "financementCharges.excludedLoanIds"));
    assert.equal(excludedLoanIdsFromFinancing(financing, EX).length, 1);
  });

  it("offre et tableau issus du MÊME upload : pas un document distinct, jamais une preuve → bloqué", async () => {
    const { state, financing } = await run([{ ...table(), ...offer(9000) }]);
    assert.equal(state.loans[0]!.capitalInitialOffre, undefined);
    assert.equal(excludedLoanIdsFromFinancing(financing, EX).length, 1);
  });

  it("offre contradictoire (12 000 €) : bloqué", async () => {
    const { financing } = await run([offer(12000), table()]);
    assert.equal(excludedLoanIdsFromFinancing(financing, EX).length, 1);
  });
});
