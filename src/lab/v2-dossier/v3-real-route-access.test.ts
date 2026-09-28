import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { isV3RealTestRouteEnabled } from "./v3-real-route-access";

const ENV_KEY = "ENABLE_V3_REAL_TEST_ROUTE";
const original = process.env[ENV_KEY];

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
});

describe("isV3RealTestRouteEnabled — R14.1 fail-closed production gate", () => {
  it("CASE A — flag absent → disabled", () => {
    delete process.env[ENV_KEY];
    assert.equal(isV3RealTestRouteEnabled(), false);
  });

  it("CASE B — flag explicitly \"false\" → disabled", () => {
    process.env[ENV_KEY] = "false";
    assert.equal(isV3RealTestRouteEnabled(), false);
  });

  it("CASE C — any non-exact value never enables it (never a truthy-string coercion)", () => {
    for (const value of ["1", "yes", "TRUE", "True", " true", "true ", "true,false", ""]) {
      process.env[ENV_KEY] = value;
      assert.equal(isV3RealTestRouteEnabled(), false, `value ${JSON.stringify(value)} must stay disabled`);
    }
  });

  it("CASE D — flag explicitly \"true\" → enabled", () => {
    process.env[ENV_KEY] = "true";
    assert.equal(isV3RealTestRouteEnabled(), true);
  });

  it("anti-exposure — a forgotten/blank env var at deploy time cannot enable the route", () => {
    delete process.env[ENV_KEY];
    assert.equal(isV3RealTestRouteEnabled(), false);
    process.env[ENV_KEY] = "";
    assert.equal(isV3RealTestRouteEnabled(), false);
  });
});

describe("real/page.tsx — the guard still requires BOTH the production check and the flag (R14.1 CASE E + static safety)", () => {
  it("production guard combines NODE_ENV === \"production\" with !isV3RealTestRouteEnabled() — dev stays open regardless of the flag", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("../../app/lab/v2-dossier/real/page.tsx", import.meta.url), "utf8");
    assert.match(source, /process\.env\.NODE_ENV === "production" && !isV3RealTestRouteEnabled\(\)/);
    assert.match(source, /import \{ isV3RealTestRouteEnabled \} from "@\/lab\/v2-dossier\/v3-real-route-access"/);
  });
});
