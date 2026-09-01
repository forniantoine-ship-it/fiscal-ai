/**
 * F-012 Cycle 7 — premières sources documentaires (impôts + syndic).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { F012ChargesAssistant } from "./assistant";
import { isDocumentaryFamily, missingDocumentFieldMessage } from "./charge-proposal";
import { decideProposal, isDocumentAlreadyAnalyzed } from "./apply-document-review";
import { coproProposalDiagnostics, proposalsFromCoproCorpus } from "./proposals-from-copro";
import { proposalsFromTaxeFonciereCorpus } from "./proposals-from-taxe-fonciere";
import type { F012Deps } from "./types";

const TEXT_HEAVY_FIXTURE = `
Direction générale des Finances publiques
Avis de taxe foncière — Année 2025
Commune de Lyon
Propriétés bâties
Valeur locative cadastrale : 8 200 EUR
Net à payer : 1 245,50 EUR
`;

const TABLE_HEAVY_FIXTURE = `
DGFiP — Impôts locaux 2025
Commune de Bordeaux
Ligne impôt    Base        Taux    Montant
TF bâti        4200        12%     504,00
TEOM           180         8%      14,40
Total des impôts à payer                 518,40 EUR
`;

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const TS = "2024-03-01T10:00:00.000Z";
const PROFIL_COPRO = { copropriete: true, agence: false, travaux: false, vacance: false, comptable: false };

const AVIS_SIMPLE = `
Avis de taxe foncière — Année 2024
Commune de Lyon
Net à payer : 1 200,00 EUR
Date de paiement : 15/10/2024
`;

const AVIS_DEUX_PRELEVEMENTS = `
Avis de taxe foncière 2024
Prélèvement 1 : 600,00 EUR
Prélèvement 2 : 600,00 EUR
Date de paiement : 15/10/2024
`;

const AVIS_N_PLUS_1 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 100,00 EUR
Payé le 12/03/2025
`;

const AVIS_SANS_DATE = `
Avis de taxe foncière — Année 2024
Net à payer : 980,00 EUR
`;

const AVIS_INCOMPLET = `
Avis de taxe foncière
Commune de Nantes
`;

const DECOMPTE_MULTI = `
Syndic — Décompte annuel 2024
CHARGES COMMUNES GENERALES          245,60 €
CHARGES BATIMENT                    128,40
FONDS TRAVAUX (ALUR)                 89,20
REGULARISATION ANNUELLE              40,00
TOTAL APPEL DE FONDS                503,20
`;

const DECOMPTE_INCOMPLET = `
Syndic — Décompte
Lot n° 3
`;

async function startImpots() {
  const assistant = new F012ChargesAssistant(ctx, DEPS);
  const turn = await assistant.handle(assistant.start().state, {
    type: "submit_profilage",
    copropriete: false,
    agence: false,
    travaux: false,
    vacance: false,
    comptable: false,
  });
  return { assistant, turn };
}

describe("F-012 Cycle 7 — documentaire impôts / syndic", () => {
  it("A — avis simple → une proposition taxe foncière", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-a",
      fiscalYear: YEAR,
    });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0]?.amount, 1200);
    assert.equal(proposals[0]?.description.includes("Taxe"), true);
  });

  it("B — deux prélèvements → deux propositions, aucun total inventé", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_DEUX_PRELEVEMENTS,
      documentId: "avis-b",
      fiscalYear: YEAR,
    });
    assert.equal(proposals.length, 2);
    assert.deepEqual(
      proposals.map((item) => item.amount),
      [600, 600],
    );
  });

  it("C — paiement N rattache l'exercice N", () => {
    const [proposal] = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-c",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.exercise, YEAR);
    assert.equal(proposal?.paymentDate, "15/10/2024");
  });

  it("D — paiement N+1 n'écrit pas l'exercice N", () => {
    const [proposal] = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_N_PLUS_1,
      documentId: "avis-d",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.exercise, 2025);
    assert.notEqual(proposal?.exercise, YEAR);
  });

  it("E — date absente : montant conservé, date manquante", () => {
    const [proposal] = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SANS_DATE,
      documentId: "avis-e",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.amount, 980);
    assert.equal(proposal?.paymentDate, undefined);
    assert.ok(proposal?.missingFields.includes("paymentDate"));
  });

  it("F — document incomplet : aucune invention de montant", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_INCOMPLET,
      documentId: "avis-f",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.amount, undefined);
    assert.ok(proposals[0]?.missingFields.includes("amount"));
  });

  it("G — manuel après document incomplet", async () => {
    const { assistant, turn: start } = await startImpots();
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-g",
      familyId: "impots",
      proposals: proposalsFromTaxeFonciereCorpus({
        corpus: AVIS_INCOMPLET,
        documentId: "avis-g",
        fiscalYear: YEAR,
      }),
    });
    const proposalId = turn.state.documentReview?.proposals[0]?.id;
    assert.ok(proposalId);
    turn = await assistant.handle(turn.state, { type: "fill_proposal_manual", proposalId, amount: 750 });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 750);
  });

  it("H — décompte plusieurs lignes", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_MULTI,
      documentId: "copro-h",
      fiscalYear: YEAR,
    });
    assert.ok(proposals.length >= 3);
  });

  it("I — fonds travaux proposé avec exclusion, pas déductible", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_MULTI,
      documentId: "copro-i",
      fiscalYear: YEAR,
    });
    const fonds = proposals.find((item) => item.coproType === "fonds_travaux");
    assert.ok(fonds);
    assert.ok(fonds?.exclusionReason);
  });

  it("J — régularisation extraite sans demander un découpage", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_MULTI,
      documentId: "copro-j",
      fiscalYear: YEAR,
    });
    assert.ok(proposals.some((item) => item.coproType === "regularisation"));
  });

  it("K — total document ≠ somme déductible", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_MULTI,
      documentId: "copro-k",
      fiscalYear: YEAR,
    });
    const { documentLineTotal, deductibleProposed } = coproProposalDiagnostics(proposals);
    assert.ok(documentLineTotal > deductibleProposed);
  });

  it("L — décompte incomplet : trou manuel, pas d'échec", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_INCOMPLET,
      documentId: "copro-l",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.amount, undefined);
    assert.match(missingDocumentFieldMessage(), /manuellement/);
  });

  it("M — document → review → Charge", async () => {
    const { assistant, turn: start } = await startImpots();
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-m",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-m",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    const registry = collectedToChargeRegistry({
      collected: turn.state.collected,
      profil: turn.state.profil,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: YEAR,
    });
    assert.equal(registry.familyCoverage.find((row) => row.familyId === "impots")?.status, "captured");
    assert.deepEqual(registry.familyCoverage.find((row) => row.familyId === "impots")?.documentIds, ["avis-m"]);
    assert.equal(registry.charges[0]?.source, "document");
  });

  it("N — refresh durant review : propositions identiques", async () => {
    const { assistant, turn: start } = await startImpots();
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-n",
      fiscalYear: YEAR,
    });
    const reviewing = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-n",
      familyId: "impots",
      proposals,
    });
    const { toF012PersistedStateWithRegistry } = await import("./collected-to-registry");
    const persisted = toF012PersistedStateWithRegistry(reviewing.state, TS, YEAR);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.familyPhase, "review");
    assert.deepEqual(
      resumed.state.documentReview?.proposals.map((item) => item.id),
      proposals.map((item) => item.id),
    );
    assert.equal(resumed.state.result, undefined);
  });

  it("O — doublon même document : pas de seconde analyse silencieuse", async () => {
    const { assistant, turn: start } = await startImpots();
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-o",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-o",
      familyId: "impots",
      proposals,
    });
    assert.equal(isDocumentAlreadyAnalyzed(turn.state.analyzedDocumentIds, "avis-o"), true);
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "avis-o",
      familyId: "impots",
      proposals: [{ ...proposals[0]!, amount: 1 }],
    });
    assert.equal(turn.state.documentReview?.proposals[0]?.amount, 1200);
    assert.equal(turn.state.analyzedDocumentIds?.length, 1);
  });

  it("P — manuel + document : pas de Charge dupliquée", async () => {
    const { assistant, turn: start } = await startImpots();
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-p",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "avis-p",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    const registry = collectedToChargeRegistry({
      collected: turn.state.collected,
      profil: turn.state.profil,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: YEAR,
    });
    const impots = registry.charges.filter((charge) => charge.familyId === "impots");
    assert.equal(impots.length, 1);
    assert.equal(impots[0]?.amount, 1200);
  });

  it("Q — F-006 résultat inchangé", async () => {
    const { charges } = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
    });
    const aggregated = aggregateFiscalInputs({
      exerciceFiscal: YEAR,
      activite: { dateMiseEnService: "2023-01-01" },
      revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 9000 },
      chargesAssistant: {
        exerciceFiscal: YEAR,
        totalDeductible: charges.totalDeductible,
        totalPreExploitation: charges.totalPreExploitation,
        parCategorie: charges.parCategorie,
      },
      financementCharges: {
        exerciceFiscal: YEAR,
        totalChargesFinancementExercice: 0,
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 0, status: "validated" },
    });
    assert.equal(aggregated.data?.chargesExploitation, charges.totalDeductible);
  });

  it("R — F-011 inchangé : pas d'import de Charge financement", () => {
    assert.equal(isDocumentaryFamily("assurances"), true);
    assert.equal(isDocumentaryFamily("impots"), true);
    assert.equal(isDocumentaryFamily("gestion"), true);
    assert.equal(isDocumentaryFamily("travaux"), false);
  });

  it("proposition ignorée ne crée pas de Charge", async () => {
    const { assistant, turn: start } = await startImpots();
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-ignore",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-ignore",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
  });

  it("syndic : review → lignes copro, fonds exclu du write path déductible", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_COPRO });
    while (turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0] !== "syndic") {
      turn = await assistant.handle(turn.state, { type: "none_family" });
    }
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_MULTI,
      documentId: "copro-m",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "copro-m",
      familyId: "syndic",
      proposals,
    });
    for (const proposal of turn.state.documentReview?.proposals ?? []) {
      if (!proposal.exclusionReason) {
        turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal.id });
      } else {
        turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposal.id });
      }
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.ok(turn.state.collected.coproLignes.length > 0);
    assert.equal(
      turn.state.collected.coproLignes.some((ligne) => ligne.type === "fonds_travaux"),
      false,
    );
  });

  it("TEOM du tableau n'est pas le montant payable", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: TABLE_HEAVY_FIXTURE,
      documentId: "teom",
      fiscalYear: 2025,
    });
    assert.equal(proposals[0]?.amount, 518.4);
    assert.notEqual(proposals[0]?.amount, 14.4);
  });

  it("parser Tunnel A avis text-heavy reste la source du montant", () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: TEXT_HEAVY_FIXTURE,
      documentId: "text-heavy",
      fiscalYear: 2025,
    });
    assert.equal(proposals[0]?.amount, 1245.5);
  });

  it("decideProposal ignore ne change pas le montant", () => {
    const next = decideProposal(
      [{ id: "p1", documentId: "d", familyId: "impots", description: "x", amount: 10, missingFields: [], decision: "pending" }],
      "p1",
      "ignored",
    );
    assert.equal(next[0]?.decision, "ignored");
    assert.equal(next[0]?.amount, 10);
  });
});
