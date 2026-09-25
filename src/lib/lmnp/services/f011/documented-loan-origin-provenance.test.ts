/**
 * R1.y — provenance de la preuve de capital d'origine (VER option 2). Un tableau commençant en cours
 * d'exercice n'est accepté que si le capital d'origine est prouvé par un document DISTINCT (offre / contrat).
 * Défaut démontré sur c375fc9 : l'assemblage de session Tunnel A (CreditDocumentStep) versait les métadonnées
 * du tableau lui-même (en-tête « montant du prêt ») dans l'emplacement `loanOffer`, donc dans
 * `capitalInitialOffre` : le tableau prouvait sa propre origine.
 *
 * Tous les scénarios passent par l'assemblage RÉEL (`mergeCreditPipelineResultIntoSession`, appelé par
 * CreditDocumentStep — vérifié statiquement ci-dessous), jamais par une session construite à la main.
 *
 * Run: npx tsx --test src/lib/lmnp/services/f011/documented-loan-origin-provenance.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildCreditAmortizationFromSpatial } from "@/lib/lmnp/parsers/spatial-amortization-primary";
import type { SpatialInstallment } from "@/lib/lmnp/parsers/spatial-amortization-core";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";
import {
  creditFromDraft,
  hydrateCreditFormFromSession,
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
const month = (m: number) => `${EX}-${String(m).padStart(2, "0")}-05`;

/** Échéances imprimées : 1 000 € de capital + 100 € d'intérêts + 15 € d'assurance par mois. */
function rows(fromMonth: number, capital: number, firstRank: number): SpatialInstallment[] {
  return Array.from({ length: 13 - fromMonth }, (_, i) => ({
    rank: firstRank + i,
    date: month(fromMonth + i),
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

/** Métadonnées documentaires lues sur l'en-tête du TABLEAU (même schéma que l'offre). */
const tableHeader = (loanAmount: number): CreditLoanOfferExtraction => ({ bankName: "Banque", loanType: "Prêt amortissable", interestRate: 2, loanAmount });
/** Offre de prêt : document DISTINCT, classé `loan_offer`. */
const offer = (loanAmount: number): CreditLoanOfferExtraction => ({ bankName: "Banque", loanType: "Prêt amortissable", interestRate: 2, loanAmount, loanDurationMonths: 9 });

type Upload =
  | { kind: "amortization"; extraction: ReturnType<typeof table>; metadata?: CreditLoanOfferExtraction }
  | { kind: "loan_offer"; extraction: CreditLoanOfferExtraction };

/** = CreditDocumentStep : un appel d'assemblage par document analysé, dans l'ordre des uploads. */
function assemble(uploads: Upload[]): CreditExtractionSession {
  return uploads.reduce<CreditExtractionSession>(
    (session, upload, i) =>
      mergeCreditPipelineResultIntoSession(
        session,
        upload.kind,
        upload.extraction,
        upload.kind === "amortization" ? upload.metadata : undefined,
        { documentId: `doc-${i}` },
      ),
    {},
  );
}

function confirm(form: CreditFormValues): DeclarationDraft {
  const financing = formValuesToFinancing(form, EX);
  const { financementCharges, excludedLoanIds } = mapCreditFinancingToFinancementCharges({ financing, exerciceFiscal: EX, dateMiseEnService: MES });
  return aliceDraft(undefined, { creditFinancing: financing, creditConfirmedAt: "2026-03-01T10:00:00.000Z", financementCharges: { ...financementCharges, excludedLoanIds } }, MES);
}

function formFrom(session: CreditExtractionSession): CreditFormValues {
  return hydrateCreditFormFromSession({ session, revenueYear: EX }).nextValues;
}

function generate(draft: DeclarationDraft) {
  const g = runDeclarationGeneration(draft, EX);
  if (g.status !== "generated") return { status: g.status };
  return {
    status: g.status,
    c294: g.liasseRfs.form2033B.cases.find((c) => c.caseId === "294")?.value as number | undefined,
    c156: g.liasseRfs.form2033A.cases.find((c) => c.caseId === "156")?.value as number | undefined,
  };
}

// Prêt réellement démarré en avril : n° 1 imprimé, 1re ligne CRD 8 000 + capital 1 000 = origine 9 000 €.
const aprilTable = () => table(rows(4, 9000, 1));

describe("R1.y — le tableau ne prouve jamais lui-même son capital d'origine", () => {
  it("CreditDocumentStep utilise l'assemblage testé ici (chemin de production)", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/lmnp/documents/CreditDocumentStep.tsx"), "utf8");
    assert.match(src, /mergeCreditPipelineResultIntoSession\(\s*extractionSessionRef\.current,\s*kind,\s*extraction,\s*result\.loanOffer\?\.extraction,/);
    assert.doesNotMatch(src, /mergeCreditExtractionSession\(\s*session,\s*"loan_offer"/, "plus aucun versement direct des métadonnées du tableau dans loanOffer");
  });

  it("TEST A — UN seul document (tableau), en-tête 9 000 €, n° 1, avril, aucune offre : BLOQUÉ, jamais 294 = 1 035 €", () => {
    const session = assemble([{ kind: "amortization", extraction: aprilTable(), metadata: tableHeader(9000) }]);
    assert.equal(session.loanOffer?.bankName, "Banque", "les métadonnées documentaires restent disponibles");
    assert.equal(session.loanOffer?.loanAmount, undefined, "le capital d'en-tête n'entre jamais dans loanOffer");
    const draft = confirm(formFrom(session));
    assert.equal(draft.creditFinancing!.loans[0]!.capitalInitialOffre, undefined);
    const r = generate(draft);
    assert.equal(r.status, "blocked");
    assert.notEqual(r.c294, 1035);
  });

  it("TEST A bis — offre réelle PUIS tableau avec en-tête contradictoire : l'en-tête ne remplace jamais le capital de l'offre", () => {
    const session = assemble([
      { kind: "loan_offer", extraction: offer(12000) },
      { kind: "amortization", extraction: aprilTable(), metadata: tableHeader(9000) },
    ]);
    assert.equal(session.loanOffer?.loanAmount, 12000);
    assert.equal(generate(confirm(formFrom(session))).status, "blocked");
  });

  it("TEST B — tableau + offre DISTINCTE 9 000 € (les deux ordres) : ACCEPTÉ, 294 = 9 × (100 + 15) = 1 035 €, 156 = 0", () => {
    for (const uploads of [
      [{ kind: "loan_offer", extraction: offer(9000) }, { kind: "amortization", extraction: aprilTable(), metadata: tableHeader(9000) }],
      [{ kind: "amortization", extraction: aprilTable(), metadata: tableHeader(9000) }, { kind: "loan_offer", extraction: offer(9000) }],
    ] as Upload[][]) {
      const draft = confirm(formFrom(assemble(uploads)));
      assert.equal(draft.creditFinancing!.loans[0]!.capitalInitialOffre, 9000);
      const r = generate(draft);
      assert.equal(r.status, "generated", JSON.stringify(uploads.map((u) => u.kind)));
      assert.equal(r.c294, 1035);
      assert.equal(r.c156, 0);
      // Sauvegarde / restauration / reconfirmation Tunnel A : la preuve survit.
      const saved: DeclarationDraft = JSON.parse(JSON.stringify({ ...draft, creditGptSession: assemble(uploads) }));
      assert.equal(generate(confirm(creditFromDraft(saved, EX))).status, "generated");
    }
  });

  it("TEST C — offre distincte contradictoire (12 000 €) : BLOQUÉ", () => {
    const session = assemble([
      { kind: "amortization", extraction: aprilTable() },
      { kind: "loan_offer", extraction: offer(12000) },
    ]);
    assert.equal(generate(confirm(formFrom(session))).status, "blocked");
  });

  it("TEST D — aucune offre, capital saisi manuellement 9 000 € : BLOQUÉ", () => {
    const form = formFrom(assemble([{ kind: "amortization", extraction: aprilTable(), metadata: tableHeader(9000) }]));
    const manual = { ...form, loans: [{ ...form.loans[0]!, borrowedAmount: "9000" }] };
    assert.equal(generate(confirm(manual)).status, "blocked");
  });

  it("TEST E — tableau commençant en janvier, sans offre : comportement R1 inchangé (accepté, 12 × 115 = 1 380 €)", () => {
    const r = generate(confirm(formFrom(assemble([{ kind: "amortization", extraction: table(rows(1, 12000, 1)), metadata: tableHeader(12000) }]))));
    assert.equal(r.status, "generated");
    assert.equal(r.c294, 1380);
    assert.equal(r.c156, 0);
  });
});
