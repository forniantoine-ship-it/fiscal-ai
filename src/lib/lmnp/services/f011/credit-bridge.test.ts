import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyCreditPrefillToLoan,
  mapCreditExtractionToF011Prefill,
  resolveF011FieldWriteDecision,
} from "./credit-bridge";
import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";

const TS = "2024-06-01T08:00:00.000Z";
const DOC_ID = "doc-123";

const FULL_AMORTIZATION: CreditAmortizationExtraction = {
  detectedFiscalYear: 2022,
  yearlyInterestTotal: 1850,
  yearlyInsuranceTotal: 240,
  remainingPrincipal: 181250,
  monthlyPayment: 950,
  firstPaymentDate: "2022-01-15",
  loanDurationMonths: 240,
  loanAmount: 200000,
};

const FULL_LOAN_OFFER: CreditLoanOfferExtraction = {
  bankName: "Crédit Foncier",
  loanType: "Prêt amortissable classique",
  interestRate: 1.85,
  deferredLoanType: "none",
  applicationFees: 500,
  guaranteeFees: 1200,
  insuranceMonthlyAmount: 20,
  loanAmount: 200000,
  loanDurationMonths: 240,
  firstPaymentDate: "2022-01-15",
  monthlyPayment: 970,
};

describe("F-011 — Cycle 4 : pont documentaire Crédit", () => {
  it("A — document avec un prêt complet : tous les champs pontables sont remplis", () => {
    const prefill = mapCreditExtractionToF011Prefill(
      { amortization: FULL_AMORTIZATION, loanOffer: FULL_LOAN_OFFER },
      DOC_ID,
      TS,
    );
    assert.equal(prefill.fields.capitalInitial, 200000);
    // Même division flottante que le formulaire manuel F-011 (`Number(rate) / 100`,
    // jamais arrondie à cette étape) — comparé à la même opération, pas à un
    // littéral "propre" qui masquerait un bruit IEEE754 différent.
    assert.equal(prefill.fields.tauxNominal, 1.85 / 100);
    assert.equal(prefill.fields.dureeMois, 240);
    assert.equal(prefill.fields.datePremiereMensualite, "2022-01-15");
    assert.equal(prefill.fields.typePret, "amortissable");
    assert.equal(prefill.fields.assuranceAnnuelle, 240);
    assert.equal(prefill.fields.fraisDossier, 500);
  });

  it("B — plusieurs prêts : le pipeline extrait un seul prêt par appel — accumuler via des appels séparés, jamais depuis un seul document", () => {
    // Aucun schéma d'extraction (credit-amortization / credit-loan-offer) ne porte
    // de champ `loans[]` — confirmé en amont de ce cycle. Ce pont reflète fidèlement
    // cette réalité : il ne prend jamais un tableau de prêts en entrée. Le
    // multi-prêts F-011 (Cycle 1-3) reste la seule façon de les accumuler —
    // un appel du pont par document, jamais une heuristique de découpage.
    const loan1 = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-pret-1", TS);
    const loan2 = mapCreditExtractionToF011Prefill(
      { amortization: { ...FULL_AMORTIZATION, loanAmount: 50000, loanDurationMonths: 120 } },
      "doc-pret-2",
      TS,
    );
    assert.equal(loan1.fields.capitalInitial, 200000);
    assert.equal(loan2.fields.capitalInitial, 50000);
    assert.notEqual(loan1.fields.capitalInitial, loan2.fields.capitalInitial, "deux appels, deux résultats indépendants");
  });

  it("C — capital extrait : le tableau d'amortissement l'emporte sur l'offre s'il est présent", () => {
    const prefill = mapCreditExtractionToF011Prefill(
      { amortization: { loanAmount: 199999 }, loanOffer: { loanAmount: 200000 } },
      DOC_ID,
      TS,
    );
    assert.equal(prefill.fields.capitalInitial, 199999);
    assert.equal(prefill.provenance.capitalInitial?.sourceDocument, DOC_ID);
  });

  it("capital extrait : repli sur l'offre si le tableau ne le porte pas", () => {
    const prefill = mapCreditExtractionToF011Prefill({ loanOffer: { loanAmount: 150000 } }, DOC_ID, TS);
    assert.equal(prefill.fields.capitalInitial, 150000);
  });

  it("D — taux extrait : uniquement depuis l'offre, converti en fraction décimale", () => {
    const withOffer = mapCreditExtractionToF011Prefill({ loanOffer: { interestRate: 3.15 } }, DOC_ID, TS);
    assert.equal(withOffer.fields.tauxNominal, 0.0315);

    const amortizationOnly = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, DOC_ID, TS);
    assert.equal(
      amortizationOnly.fields.tauxNominal,
      undefined,
      "le schéma d'amortissement ne porte aucun taux — jamais reconstruit par approximation",
    );
  });

  it("E — durée extraite : appartient au tableau d'amortissement s'il est présent", () => {
    const prefill = mapCreditExtractionToF011Prefill(
      { amortization: { loanDurationMonths: 180 }, loanOffer: { loanDurationMonths: 240 } },
      DOC_ID,
      TS,
    );
    assert.equal(prefill.fields.dureeMois, 180);
  });

  it("F — type de prêt : détecté depuis le texte libre, jamais deviné si ambigu", () => {
    const inFine = mapCreditExtractionToF011Prefill({ loanOffer: { loanType: "Prêt in fine" } }, DOC_ID, TS);
    assert.equal(inFine.fields.typePret, "in_fine");

    const amortissable = mapCreditExtractionToF011Prefill(
      { loanOffer: { loanType: "Prêt amortissable" } },
      DOC_ID,
      TS,
    );
    assert.equal(amortissable.fields.typePret, "amortissable");

    const ambiguous = mapCreditExtractionToF011Prefill({ loanOffer: { loanType: "Prêt travaux" } }, DOC_ID, TS);
    assert.equal(ambiguous.fields.typePret, undefined, "texte non concluant — jamais deviné");
    assert.ok(ambiguous.unmapped.some((u) => u.field === "loanType"), "signalé, pas silencieusement ignoré");
  });

  it("F bis — type de prêt : synonymes non ambigus reconnus (correctif Cycle 9)", () => {
    const relais = mapCreditExtractionToF011Prefill({ loanOffer: { loanType: "Prêt relais" } }, DOC_ID, TS);
    assert.equal(relais.fields.typePret, "in_fine", "un prêt relais est structurellement in fine");

    const creditRelais = mapCreditExtractionToF011Prefill({ loanOffer: { loanType: "Crédit relais" } }, DOC_ID, TS);
    assert.equal(creditRelais.fields.typePret, "in_fine");

    const progressif = mapCreditExtractionToF011Prefill(
      { loanOffer: { loanType: "Prêt à amortissement progressif" } },
      DOC_ID,
      TS,
    );
    assert.equal(progressif.fields.typePret, "amortissable");

    const capitalConstant = mapCreditExtractionToF011Prefill(
      { loanOffer: { loanType: "Prêt à capital constant" } },
      DOC_ID,
      TS,
    );
    assert.equal(capitalConstant.fields.typePret, "amortissable");
  });

  it("F ter — type de prêt : formulation ambiguë reste non concluante, jamais devinée", () => {
    const stillAmbiguous = mapCreditExtractionToF011Prefill(
      { loanOffer: { loanType: "Prêt modulable" } },
      DOC_ID,
      TS,
    );
    assert.equal(stillAmbiguous.fields.typePret, undefined);
    assert.ok(stillAmbiguous.unmapped.some((u) => u.field === "loanType"));
  });

  it("F quater — tableau sans type explicite : aucune inférence depuis l'amortissement seul", () => {
    const noLoanOffer = mapCreditExtractionToF011Prefill(
      { amortization: { loanAmount: 100000, loanDurationMonths: 240 } },
      DOC_ID,
      TS,
    );
    assert.equal(noLoanOffer.fields.typePret, undefined, "l'amortissement seul ne porte aucun signal de type de prêt");
  });

  it("G — assurance : le montant réellement observé sur l'échéancier prime sur le montant déclaré dans l'offre", () => {
    const prefill = mapCreditExtractionToF011Prefill(
      { amortization: { yearlyInsuranceTotal: 300 }, loanOffer: { insuranceMonthlyAmount: 20 } },
      DOC_ID,
      TS,
    );
    assert.equal(prefill.fields.assuranceAnnuelle, 300);
  });

  it("assurance : conversion mensuel → annuel depuis l'offre seule", () => {
    const prefill = mapCreditExtractionToF011Prefill({ loanOffer: { insuranceMonthlyAmount: 25 } }, DOC_ID, TS);
    assert.equal(prefill.fields.assuranceAnnuelle, 300);
  });

  it("H — garantie : le montant est vu mais jamais appliqué — STOP délibéré (Cycle 4 §7)", () => {
    const prefill = mapCreditExtractionToF011Prefill({ loanOffer: { guaranteeFees: 1200 } }, DOC_ID, TS);
    assert.equal(
      "typeGarantie" in prefill.fields,
      false,
      "aucun typeGarantie n'est jamais produit par ce pont",
    );
    const unmapped = prefill.unmapped.find((u) => u.field === "guaranteeFees");
    assert.ok(unmapped, "le montant extrait doit rester traçable, pas perdu silencieusement");
    assert.equal(unmapped!.value, 1200);
  });

  it("I — frais de dossier : uniquement depuis l'offre de prêt", () => {
    const prefill = mapCreditExtractionToF011Prefill({ loanOffer: { applicationFees: 450 } }, DOC_ID, TS);
    assert.equal(prefill.fields.fraisDossier, 450);
  });

  it("J — IRA : jamais extraite par le pipeline actuel, jamais fabriquée, et rien à signaler", () => {
    const prefill = mapCreditExtractionToF011Prefill(
      { amortization: FULL_AMORTIZATION, loanOffer: FULL_LOAN_OFFER },
      DOC_ID,
      TS,
    );
    assert.equal("iraMontant" in prefill.fields, false);
    assert.equal(
      prefill.unmapped.some((u) => u.field.toLowerCase().includes("ira")),
      false,
      "rien n'a été vu dans le document à ce sujet — pas d'entrée unmapped non plus",
    );
  });

  it("K — la date de mise en service n'est jamais un champ que ce pont produit", () => {
    const prefill = mapCreditExtractionToF011Prefill(
      { amortization: FULL_AMORTIZATION, loanOffer: FULL_LOAN_OFFER },
      DOC_ID,
      TS,
    );
    assert.equal(
      Object.keys(prefill.fields).some((k) => k.toLowerCase().includes("miseenservice")),
      false,
    );
  });

  it("L — champ absent → undefined, jamais une valeur par défaut", () => {
    const prefill = mapCreditExtractionToF011Prefill({ loanOffer: { bankName: "Banque X" } }, DOC_ID, TS);
    assert.equal(prefill.fields.capitalInitial, undefined);
    assert.equal(prefill.fields.tauxNominal, undefined);
    assert.equal(prefill.fields.dureeMois, undefined);
    assert.equal(prefill.fields.datePremiereMensualite, undefined);
  });

  it("M — aucune valeur inventée : le résultat ne contient que ce qui était explicitement présent en entrée", () => {
    const prefill = mapCreditExtractionToF011Prefill({ loanOffer: { loanAmount: 100000 } }, DOC_ID, TS);
    assert.deepEqual(Object.keys(prefill.fields), ["capitalInitial"]);
  });

  it("N — données déjà présentes : jamais écrasées silencieusement", () => {
    const prefill = mapCreditExtractionToF011Prefill({ loanOffer: { loanAmount: 250000 } }, DOC_ID, TS);
    const application = applyCreditPrefillToLoan({ capitalInitial: 200000 }, prefill);
    assert.equal("capitalInitial" in application.patch, false, "jamais appliqué par-dessus une valeur existante");
    assert.equal(application.conflicts.length, 1);
    assert.equal(application.conflicts[0]?.existingValue, 200000);
    assert.equal(application.conflicts[0]?.incomingValue, 250000);
  });

  it("O — provenance conservée pour chaque champ appliqué", () => {
    const prefill = mapCreditExtractionToF011Prefill({ loanOffer: { loanAmount: 200000 } }, DOC_ID, TS);
    const application = applyCreditPrefillToLoan(undefined, prefill);
    const provenance = application.provenance.capitalInitial;
    assert.ok(provenance);
    assert.equal(provenance!.sourceTunnel, "credit");
    assert.equal(provenance!.sourceDocument, DOC_ID);
    assert.equal(provenance!.extractedBy, "gpt");
    assert.equal(provenance!.manuallyValidated, false);
    assert.equal(provenance!.updatedAt, TS);
  });

  it("P — conflit non silencieux : la décision et les deux valeurs sont explicites, jamais un simple booléen", () => {
    const prefill = mapCreditExtractionToF011Prefill({ loanOffer: { loanDurationMonths: 300 } }, DOC_ID, TS);
    const application = applyCreditPrefillToLoan({ dureeMois: 240 }, prefill);
    assert.deepEqual(application.conflicts[0], {
      field: "dureeMois",
      existingValue: 240,
      incomingValue: 300,
      decision: "blocked_user_validated",
    });
  });

  it("résolution de décision : vide → apply_empty, déjà rempli → blocked_user_validated", () => {
    assert.equal(resolveF011FieldWriteDecision(undefined), "apply_empty");
    assert.equal(resolveF011FieldWriteDecision(100000), "blocked_user_validated");
  });

  it("Q — document partiel : seuls les champs présents sont pontés, le reste reste absent", () => {
    const prefill = mapCreditExtractionToF011Prefill(
      { amortization: { loanAmount: 120000, loanDurationMonths: 180 } },
      DOC_ID,
      TS,
    );
    assert.equal(prefill.fields.capitalInitial, 120000);
    assert.equal(prefill.fields.dureeMois, 180);
    assert.equal(prefill.fields.datePremiereMensualite, undefined);
    assert.equal(prefill.fields.tauxNominal, undefined);
  });

  it("R — document invalide/vide : aucun crash, résultat vide", () => {
    const prefill = mapCreditExtractionToF011Prefill({}, DOC_ID, TS);
    assert.deepEqual(prefill.fields, {});
    assert.deepEqual(prefill.provenance, {});
    assert.deepEqual(prefill.unmapped, []);
  });

  it("une valeur documentaire identique à l'existant ne crée pas de conflit", () => {
    const prefill = mapCreditExtractionToF011Prefill({ loanOffer: { loanAmount: 200000 } }, DOC_ID, TS);
    const application = applyCreditPrefillToLoan({ capitalInitial: 200000 }, prefill);
    assert.equal(application.conflicts.length, 0, "le document confirme simplement ce qui était déjà su");
    assert.equal("capitalInitial" in application.patch, false);
  });
});
