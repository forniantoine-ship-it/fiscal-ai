/**
 * GATE-1 §18 — property-based fuzzing déterministe (seed fixe) contre l'oracle indépendant.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/silent-error-gate/fuzz.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prng } from "./oracle";
import { FUZZ_SEED, FUZZ_CASES, genCase } from "./gen";
import { checkCase } from "./check";


describe("GATE-1 — fuzz déterministe (oracle indépendant)", () => {
  it(`${FUZZ_CASES} dossiers (seed ${FUZZ_SEED}) : aucun écart, aucune génération refusée dans le domaine`, () => {
    const rnd = prng(FUZZ_SEED);
    const failures: string[] = [];
    let executed = 0, blocked = 0;
    for (let i = 0; i < FUZZ_CASES; i++) {
      const c = genCase(rnd);
      const res = checkCase(c, `#${i}`);
      executed += 1;
      if (res.blocked !== undefined) { blocked += 1; failures.push(`#${i} BLOQUÉ ${res.blocked} ${JSON.stringify(c)}`); continue; }
      for (const d of res.diffs) failures.push(`${d} :: ${JSON.stringify(c)}`);
    }
    console.log(`FUZZ CASES EXECUTED=${executed} BLOCKED=${blocked} FAILURES=${failures.length}`);
    assert.deepEqual(failures.slice(0, 15), []);
  });
});
