/**
 * R1.z — l'ordre d'import ne change pas la vérité documentaire. Défaut démontré sur 70c0ee5 : tableau
 * importé en premier → `loanOffer` réduit aux métadonnées du tableau, SANS capital (garde R1.y) → vraie offre
 * importée ensuite → BUSINESS RULE A (CreditDocumentStep) la jugeait « déjà connue » (aucun conflit) et
 * retournait avant l'assemblage → capital de l'offre jamais stocké → prêt démarré en cours d'année bloqué.
 *
 * Chaque import rejoue la séquence de décision de CreditDocumentStep avec les fonctions de PRODUCTION :
 *  - offre face à une session qui a déjà un `loanOffer` → `decideLoanOfferAgainstSession` (règle A) ;
 *    « aucune nouveauté » → session inchangée (retour anticipé du composant) ;
 *  - sinon → `mergeCreditPipelineResultIntoSession` (assemblage R1.y).
 * Garde statique : le composant utilise bien cette décision pour son retour anticipé.
 *
 * Run: npx tsx --test src/lib/lmnp/services/f011/documented-loan-offer-import-order.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildCreditAmortizationFromSpatial } from "@/lib/lmnp/parsers/spatial-amortization-primary";
import type { SpatialInstallment } from "@/lib/lmnp/parsers/spatial-amortization-core";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";
import {
  decideLoanOfferAgainstSession,
  hydrateCreditFormFromSession,
  mergeCreditExtractionSession,
  mergeCreditPipelineResultIntoSession,
  type CreditExtractionSession,
} from "@/lib/lmnp/services/credit-gpt-ui-prefill";
import { formValuesToFinancing, type CreditFormValues } from "@/lib/lmnp/services/credit-profile";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import { mapCreditFinancingToFinancementCharges } from "./credit-financing-to-financement-charges";
import { runDeclarationGeneration } from "../declaration/run-declaration-generation";
import { ALICE_YEAR, aliceDraft } from "../declaration/alice-test-draft";

const EX = ALICE_YEAR; // 2025
const MES = "2025-01-01";

/** Échéances imprimées : 1 000 € de capital + 100 € d'intérêts + 15 € d'assurance par mois. */
function rows(fromMonth: number, capital: number): SpatialInstallment[] {
  return Array.from({ length: 13 - fromMonth }, (_, i) => ({
    rank: i + 1,
    date: `${EX}-${String(fromMonth + i).padStart(2, "0")}-05`,
    payment: 1115,
    principal: 1000,
    interest: 100,
    insurance: 15,
    remainingCapital: capital - 1000 * (i + 1),
  }));
}
function table(spatial: SpatialInstallment[]) {
  return buildCreditAmortizationFromSpatial(
    { success: true, confidenceScore: 95, installments: spatial, detectedColumns: ["rank", "date", "payment", "principal", "interest", "insurance", "remainingCapital"], detectedInstallmentRows: spatial.length },
    EX,
  );
}
/** Tableau démarré en avril : n° 1 imprimé, 1re ligne CRD 8 000 + capital 1 000 = origine 9 000 € ; en-tête 9 000 €. */
const aprilTable = () => ({ kind: "amortization" as const, extraction: table(rows(4, 9000)), metadata: { bankName: "Banque", interestRate: 2, loanAmount: 9000 } });
const offer = (loanAmount: number, extra: Partial<CreditLoanOfferExtraction> = {}) => ({
  kind: "loan_offer" as const,
  extraction: { bankName: "Banque", loanType: "Prêt amortissable", interestRate: 2, loanAmount, loanDurationMonths: 9, ...extra } as CreditLoanOfferExtraction,
});
type Upload = ReturnType<typeof aprilTable> | ReturnType<typeof offer>;

/** Séquence de décision de CreditDocumentStep pour un document analysé (règle A puis assemblage). */
function importDocument(session: CreditExtractionSession, upload: Upload, documentId: string) {
  if (upload.kind === "loan_offer" && session.loanOffer) {
    const decision = decideLoanOfferAgainstSession(session.loanOffer, upload.extraction);
    if (decision.noChange) return { session, decision: "document_no_change" as const };
  }
  // Dossier non encore confirmé : le composant poursuit jusqu'à l'assemblage.
  const metadata = upload.kind === "amortization" ? upload.metadata : undefined;
  return { session: mergeCreditPipelineResultIntoSession(session, upload.kind, upload.extraction, metadata, { documentId }), decision: "merged" as const };
}
function importAll(uploads: Upload[]): CreditExtractionSession {
  return uploads.reduce<CreditExtractionSession>((s, u, i) => importDocument(s, u, `doc-${i}`).session, {});
}

function confirm(form: CreditFormValues): DeclarationDraft {
  const financing = formValuesToFinancing(form, EX);
  const { financementCharges, excludedLoanIds } = mapCreditFinancingToFinancementCharges({ financing, exerciceFiscal: EX, dateMiseEnService: MES });
  return aliceDraft(undefined, { creditFinancing: financing, creditConfirmedAt: "2026-03-01T10:00:00.000Z", financementCharges: { ...financementCharges, excludedLoanIds } }, MES);
}
const formFrom = (session: CreditExtractionSession) => hydrateCreditFormFromSession({ session, revenueYear: EX }).nextValues;
function generate(draft: DeclarationDraft) {
  const g = runDeclarationGeneration(draft, EX);
  if (g.status !== "generated") return { status: g.status };
  return {
    status: g.status,
    c294: g.liasseRfs.form2033B.cases.find((c) => c.caseId === "294")?.value as number | undefined,
    c156: g.liasseRfs.form2033A.cases.find((c) => c.caseId === "156")?.value as number | undefined,
  };
}

describe("R1.z — ordre d'import : TABLEAU → OFFRE ≡ OFFRE → TABLEAU", () => {
  it("garde de production : le retour anticipé de la règle A de CreditDocumentStep suit decideLoanOfferAgainstSession", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/lmnp/documents/CreditDocumentStep.tsx"), "utf8");
    assert.match(src, /const decision = decideLoanOfferAgainstSession\(sessionOffer, extraction as CreditLoanOfferExtraction\);/);
    assert.match(src, /if \(decision\.noChange\) \{/);
    assert.doesNotMatch(src, /if \(!amountConflicts && !rateConflicts && !durationConflicts\)/, "plus aucune règle A locale divergente");
  });

  it("TEST 1 — tableau PUIS offre 9 000 € : l'offre n'est plus écartée, capitalInitialOffre = 9 000, accepté, 294 = 1 035 €, 156 = 0", () => {
    const afterTable = importAll([aprilTable()]);
    assert.equal(afterTable.loanOffer?.loanAmount, undefined, "précondition : coquille sans capital (R1.y)");
    const step = importDocument(afterTable, offer(9000), "doc-offer");
    assert.equal(step.decision, "merged", "la vraie offre apporte le capital manquant : jamais « aucune nouveauté »");
    const draft = confirm(formFrom(step.session));
    assert.equal(draft.creditFinancing!.loans[0]!.capitalInitialOffre, 9000);
    const r = generate(draft);
    assert.equal(r.status, "generated", JSON.stringify(r));
    assert.equal(r.c294, 1035);
    assert.equal(r.c156, 0);
  });

  it("TEST 2 — offre PUIS tableau : même état canonique que TEST 1 (sans conflit comme après « utiliser le nouveau » de la règle B)", () => {
    const tableThenOffer = importAll([aprilTable(), offer(9000)]);
    const viaAssembly = importAll([offer(9000), aprilTable()]);
    // Règle B (fixture : capital inféré du tableau 8 000 vs offre 9 000) → « utiliser le nouveau » = fusion du seul tableau.
    const viaRuleBUseNew = mergeCreditExtractionSession(importAll([offer(9000)]), "amortization", aprilTable().extraction, { documentId: "doc-1" });
    for (const session of [viaAssembly, viaRuleBUseNew]) {
      assert.equal(session.loanOffer?.loanAmount, tableThenOffer.loanOffer?.loanAmount);
      const a = confirm(formFrom(session));
      const b = confirm(formFrom(tableThenOffer));
      assert.equal(a.creditFinancing!.loans[0]!.capitalInitialOffre, b.creditFinancing!.loans[0]!.capitalInitialOffre);
      assert.deepEqual(generate(a), generate(b));
    }
  });

  it("TEST 3 — tableau seul : capitalInitialOffre absent, bloqué (R1.y intact)", () => {
    const draft = confirm(formFrom(importAll([aprilTable()])));
    assert.equal(draft.creditFinancing!.loans[0]!.capitalInitialOffre, undefined);
    assert.equal(generate(draft).status, "blocked");
  });

  it("TEST 4 — tableau PUIS offre contradictoire 12 000 € : l'offre est stockée (jamais écartée), la comparaison d'origine BLOQUE", () => {
    const session = importAll([aprilTable(), offer(12000)]);
    assert.equal(session.loanOffer?.loanAmount, 12000);
    const draft = confirm(formFrom(session));
    assert.equal(draft.creditFinancing!.loans[0]!.capitalInitialOffre, 12000);
    assert.equal(generate(draft).status, "blocked");
  });

  it("TEST 5 — offre réelle existante + nouvelle offre contradictoire : conflit (comportement inchangé) ; copie identique : aucune nouveauté", () => {
    const existing = importAll([offer(9000)]);
    const conflicting = decideLoanOfferAgainstSession(existing.loanOffer!, offer(12000).extraction);
    assert.equal(conflicting.noChange, false);
    assert.equal(conflicting.amountConflicts, true);
    assert.equal(importDocument(existing, offer(12000), "doc-x").decision, "merged", "jamais écartée comme « déjà connue »");
    assert.equal(importDocument(existing, offer(9000), "doc-signed").decision, "document_no_change", "copie signée identique");
    // Écart sous le seuil existant (≤ 500 €) : inchangé, aucune nouveauté.
    assert.equal(decideLoanOfferAgainstSession(existing.loanOffer!, offer(9300).extraction).noChange, true);
    // Taux / durée manquants seulement : règle A inchangée (aucune nouveauté, pas de remplacement en bloc).
    assert.equal(decideLoanOfferAgainstSession({ loanAmount: 9000, interestRate: 2 }, { loanAmount: 9000, interestRate: 2, loanDurationMonths: 9 }).noChange, true);
  });

  it("TEST 6 — aucune offre, capital saisi manuellement 9 000 € : bloqué", () => {
    const form = formFrom(importAll([aprilTable()]));
    assert.equal(generate(confirm({ ...form, loans: [{ ...form.loans[0]!, borrowedAmount: "9000" }] })).status, "blocked");
  });

  it("TEST 7 — tableau dès janvier sans offre : inchangé (accepté, 12 × 115 = 1 380 €)", () => {
    const janvier = { kind: "amortization" as const, extraction: table(rows(1, 12000)), metadata: { bankName: "Banque", loanAmount: 12000 } };
    const r = generate(confirm(formFrom(importAll([janvier]))));
    assert.equal(r.status, "generated");
    assert.equal(r.c294, 1380);
  });
});
