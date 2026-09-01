/**
 * Cycle 7/10 — pont documentaire F-012 (impôts / syndic / assurances / gestion).
 * Délègue classification et parsing au Tunnel A. N'implémente ni OCR ni moteur fiscal.
 */

import type { DocumentaryFamilyId, ChargeProposal } from "@/runtime/assistants/f012-charges/charge-proposal";
import { proposalsFromAssuranceCorpus } from "@/runtime/assistants/f012-charges/proposals-from-assurance";
import { proposalsFromCoproCorpus } from "@/runtime/assistants/f012-charges/proposals-from-copro";
import { proposalsFromGestionCorpus } from "@/runtime/assistants/f012-charges/proposals-from-gestion";
import { proposalsFromTaxeFonciereCorpus } from "@/runtime/assistants/f012-charges/proposals-from-taxe-fonciere";

export type F012DocumentCorpus = {
  text: string;
  fileName?: string;
};

export function proposalsFromExistingParsers(input: {
  familyId: DocumentaryFamilyId;
  corpus: F012DocumentCorpus;
  documentId: string;
  fiscalYear: number;
}): ChargeProposal[] {
  const shared = {
    corpus: input.corpus.text,
    documentId: input.documentId,
    fiscalYear: input.fiscalYear,
    fileName: input.corpus.fileName,
  };
  if (input.familyId === "impots") {
    return proposalsFromTaxeFonciereCorpus(shared);
  }
  if (input.familyId === "assurances") {
    return proposalsFromAssuranceCorpus(shared);
  }
  if (input.familyId === "gestion") {
    return proposalsFromGestionCorpus(shared);
  }
  return proposalsFromCoproCorpus(shared);
}
