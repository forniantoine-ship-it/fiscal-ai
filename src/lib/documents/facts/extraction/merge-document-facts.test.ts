import assert from "node:assert/strict";

import { createDocumentFact, createFactId } from "../document-fact";
import { mergeDocumentFacts } from "./merge-document-facts";
import { DETERMINISTIC_INPI_RNE_EXTRACTOR_ID } from "./inpi-rne/deterministic-inpi-rne-extractor";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log("merge-document-facts.test.ts");

run("preserves deterministic extracted facts over GPT values", () => {
  const deterministic = [
    createDocumentFact({
      id: createFactId("registry.siren", "doc-1"),
      type: "registry.siren",
      documentId: "doc-1",
      value: "808900351",
      status: "extracted",
      origin: "document",
      fieldSource: "extracted",
      extractorId: DETERMINISTIC_INPI_RNE_EXTRACTOR_ID,
      requiresConfirmation: false,
    }),
  ];

  const gpt = [
    createDocumentFact({
      id: createFactId("registry.siren", "doc-1"),
      type: "registry.siren",
      documentId: "doc-1",
      value: "123456789",
      status: "proposed",
      origin: "gpt",
      fieldSource: "judgment",
      requiresConfirmation: true,
    }),
  ];

  const { facts, conflicts } = mergeDocumentFacts(deterministic, gpt);
  assert.equal(facts.filter((fact) => fact.type === "registry.siren").length, 2);
  assert.equal(conflicts.length, 1);
  assert.equal(facts.find((fact) => fact.status === "extracted")?.value, "808900351");
});

console.log("All merge-document-facts tests passed.");
