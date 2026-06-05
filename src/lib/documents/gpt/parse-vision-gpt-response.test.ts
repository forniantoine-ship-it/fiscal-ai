import assert from "node:assert/strict";
import test from "node:test";

import {
  deepJsonParse,
  flattenVisionPayloadForLegacyBridge,
  parseVisionGptResponse,
} from "./parse-vision-gpt-response";

test("deepJsonParse unwraps triple-escaped payload", () => {
  const object = {
    documentIntent: "acquisition",
    canonicalFields: { acquisitionPrice: 150_000, propertyAddress: "1 rue Test" },
    rawDocumentTerms: null,
  };
  const once = JSON.stringify(object);
  const twice = JSON.stringify(once);
  const thrice = JSON.stringify(twice);

  const { value, depth } = deepJsonParse(thrice);
  assert.equal(depth, 3);
  assert.equal((value as Record<string, unknown>).documentIntent, "acquisition");
});

test("parseVisionGptResponse unwraps canonicalFields starting with quote (triple escape)", () => {
  const fields = { acquisitionPrice: 200_000, propertyCity: "Lyon" };
  const raw = {
    documentIntent: "acquisition",
    canonicalFields: JSON.stringify(JSON.stringify(fields)),
    rawDocumentTerms: null,
  };

  const { parsed, diagnostics } = parseVisionGptResponse(raw);

  assert.equal(diagnostics.canonicalFieldsWasString, true);
  assert.equal(diagnostics.canonicalFieldsStillString, false);
  assert.ok(diagnostics.canonicalFieldsUnwrapDepth >= 2);
  assert.deepEqual(diagnostics.parsedCanonicalFieldKeys, ["acquisitionPrice", "propertyCity"]);
  assert.equal(diagnostics.finalCanonicalFieldsType, "object");

  const cf = (parsed as Record<string, unknown>).canonicalFields as Record<string, unknown>;
  assert.equal(cf.acquisitionPrice, 200_000);
});

test("parseVisionGptResponse unwraps top-level stringified JSON", () => {
  const inner = {
    documentIntent: "acquisition",
    canonicalFields: { acquisitionPrice: 150_000 },
    rawDocumentTerms: [],
  };
  const { parsed, diagnostics } = parseVisionGptResponse(JSON.stringify(inner));

  assert.equal(diagnostics.finalPayloadType, "object");
  assert.equal(diagnostics.unwrapDepthReached >= 1, true);
  const fields = (parsed as Record<string, unknown>).canonicalFields as Record<string, unknown>;
  assert.equal(fields.acquisitionPrice, 150_000);
});

test("flattenVisionPayloadForLegacyBridge exposes canonical numeric fields after unwrap", () => {
  const raw = {
    documentIntent: "acquisition",
    canonicalFields: JSON.stringify({ acquisitionPrice: 99_000 }),
    rawDocumentTerms: null,
  };

  const flat = flattenVisionPayloadForLegacyBridge(raw);
  assert.equal(flat.acquisitionPrice, 99_000);
});
