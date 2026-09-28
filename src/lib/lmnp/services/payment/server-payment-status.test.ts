/**
 * R13.2 — granular server payment read for V3. The authority is the server
 * row (lmnp_declaration_payments), scoped exactly to (dossier_id, fiscal_year),
 * never fiscalYear.paidAt. Every failure mode resolves to "unknown", never a
 * silent "not_started"/unpaid.
 * Run: npx tsx --test src/lib/lmnp/services/payment/server-payment-status.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchServerPaymentStatus } from "./entitlement-client";

function fakeSupabase(result: { data: unknown; error: { message: string } | null } | (() => never)) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  return {
    calls,
    client: {
      auth: { getSession: async () => ({ data: { session: null } }) },
      from: (table: string) => ({
        select: () => ({
          eq: (c1: string, v1: unknown) => ({
            eq: (c2: string, v2: unknown) => {
              calls.push({ table, filters: [[c1, v1], [c2, v2]] });
              return { maybeSingle: async () => (typeof result === "function" ? result() : result) };
            },
          }),
        }),
      }),
    },
  };
}

describe("fetchServerPaymentStatus — R13.2 server-authoritative payment read", () => {
  it("1/9 — paid row → state paid with paidAt, filtered exactly on (dossier_id, fiscal_year)", async () => {
    const { client, calls } = fakeSupabase({ data: { status: "paid", paid_at: "2026-09-19T10:00:00Z" }, error: null });
    const result = await fetchServerPaymentStatus("d1", 2026, { client: client as never });
    assert.deepEqual(result, { state: "paid", source: "server", paidAt: "2026-09-19T10:00:00Z" });
    assert.equal(calls[0].table, "lmnp_declaration_payments");
    assert.deepEqual(calls[0].filters, [["dossier_id", "d1"], ["fiscal_year", 2026]]);
  });

  it("2 — pending row → state pending, distinct from not_started and from paid", async () => {
    const { client } = fakeSupabase({ data: { status: "pending", paid_at: null }, error: null });
    const result = await fetchServerPaymentStatus("d1", 2026, { client: client as never });
    assert.deepEqual(result, { state: "pending", source: "server" });
  });

  it("3 — no row → not_started (demonstrated: no checkout ever created a row for this dossier/year)", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    const result = await fetchServerPaymentStatus("d1", 2026, { client: client as never });
    assert.deepEqual(result, { state: "not_started", source: "server" });
  });

  it("4 — network/lookup error → unknown, never not_started/unpaid", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "network down" } });
    const result = await fetchServerPaymentStatus("d1", 2026, { client: client as never });
    assert.equal(result.state, "unknown");
  });

  it("5 — thrown exception (e.g. auth/RLS failure surfaced as a throw) → unknown, never unpaid", async () => {
    const client = { from: () => { throw new Error("auth failure"); } };
    const result = await fetchServerPaymentStatus("d1", 2026, { client: client as never });
    assert.equal(result.state, "unknown");
  });

  it("6/7 — wrong dossier or wrong year is impossible to observe from here: the filters ARE the scope", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await fetchServerPaymentStatus("dossier-X", 2031, { client: client as never });
    assert.deepEqual(calls[0].filters, [["dossier_id", "dossier-X"], ["fiscal_year", 2031]]);
  });

  it("8 — unexpected/unknown status value on the row → unknown, fail closed (never guessed as paid or not_started)", async () => {
    const { client } = fakeSupabase({ data: { status: "refunded", paid_at: null }, error: null });
    const result = await fetchServerPaymentStatus("d1", 2026, { client: client as never });
    assert.deepEqual(result, { state: "unknown", source: "server", reason: "unexpected_status" });
  });

  it("no client-writable path exists: this module never calls .insert/.update/.delete/.upsert", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./entitlement-client.ts", import.meta.url), "utf8");
    for (const forbidden of [".insert(", ".update(", ".delete(", ".upsert("]) {
      assert.equal(source.includes(forbidden), false, `entitlement-client.ts ne doit jamais appeler ${forbidden}`);
    }
  });
});
