/**
 * Compagnon INPI — Phase 4.5.4 : garde d'appel LLM.
 * Run: npx tsx --test src/components/lmnp/inpi-companion/inpi-companion-chat-llm.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { InpiCompanionIntent } from "./inpi-companion-chat-intent";
import { shouldUseInpiCompanionLlm } from "./inpi-companion-chat-llm";

const DETERMINISTIC_ONLY: InpiCompanionIntent[] = [
  "regularization",
  "screen_divergence",
  "conflict",
  "lost",
  "resume",
  "unknown_status",
  "already_registered",
  "multi_property",
  "out_of_scope",
];

describe("shouldUseInpiCompanionLlm", () => {
  it("free_question → LLM autorisé", () => {
    assert.equal(shouldUseInpiCompanionLlm("free_question"), true);
  });

  it("field_help → LLM éventuellement autorisé", () => {
    assert.equal(shouldUseInpiCompanionLlm("field_help"), true);
  });

  for (const intent of DETERMINISTIC_ONLY) {
    it(`${intent} → déterministe uniquement`, () => {
      assert.equal(shouldUseInpiCompanionLlm(intent), false);
    });
  }
});
