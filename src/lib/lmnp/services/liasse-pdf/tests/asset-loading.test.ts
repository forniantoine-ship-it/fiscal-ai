/** Run from the project root: node --import tsx --test <this file>. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { CERFA_ASSET_MANIFESTS } from "../asset-manifest";
import { assetPath, readAssetBytes } from "../assets/load-asset";

describe("Cerfa assets — runtime files", () => {
  const seen = new Set<string>();
  for (const entries of Object.values(CERFA_ASSET_MANIFESTS)) {
    for (const entry of entries) {
      const key = `${entry.millesime}/${entry.assetFile}`;
      if (seen.has(key)) continue;
      seen.add(key);
      it(`${key}: project-root path, official hash and readable PDF`, async () => {
        assert.equal(assetPath(entry.millesime, entry.assetFile), path.join(
          process.cwd(), "src/lib/lmnp/services/liasse-pdf/assets", key,
        ));
        const bytes = readAssetBytes(entry.millesime, entry.assetFile);
        assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
        assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
        const pdf = await PDFDocument.load(bytes);
        assert.equal(pdf.getPageCount(), entry.assetTotalPages);
      });
    }
  }
  it("fails explicitly for a missing asset, without falling back to another form", () => {
    assert.throws(() => readAssetBytes(2026, "missing.pdf"), /ENOENT/);
  });
});
