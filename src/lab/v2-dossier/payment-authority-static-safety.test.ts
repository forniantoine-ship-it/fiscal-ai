import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * R13.2 §7 — the V3 payment path (RealWorkspaceRoute's loader, V2Prototype's
 * rendering) must never read `fiscalYear.paidAt` as authority. The only
 * legitimate source is `fetchServerPaymentStatus` (lmnp_declaration_payments,
 * RLS-protected) via `ServerPaymentStatus`. This does not touch or remove
 * `fiscalYear.paidAt` anywhere else in the product (still the display mirror
 * used by non-V3 payment UI) — R13.2 concerns only these two V3 files.
 */
describe("V3 payment path — never fiscalYear.paidAt as authority (R13.2 §7)", () => {
  it("RealWorkspaceRoute.tsx and V2Prototype.tsx never reference fiscalYear.paidAt", async () => {
    const fs = await import("node:fs/promises");
    for (const file of ["./RealWorkspaceRoute.tsx", "./V2Prototype.tsx"]) {
      const source = await fs.readFile(new URL(file, import.meta.url), "utf8");
      const code = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const forbidden of ["fiscalYear.paidAt", "workspace.fiscalYear.paidAt"]) {
        assert.equal(code.includes(forbidden), false, `${file} ne doit jamais lire ${forbidden}`);
      }
    }
  });

  it("RealWorkspaceRoute.tsx sources the V3 payment status only from fetchServerPaymentStatus", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./RealWorkspaceRoute.tsx", import.meta.url), "utf8");
    assert.match(source, /fetchServerPaymentStatus/);
    assert.match(source, /entitlement-client/);
  });
});
