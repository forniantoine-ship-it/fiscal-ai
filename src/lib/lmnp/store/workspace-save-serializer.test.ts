/**
 * B1-1 — serialized workspace write queue.
 * Run: npx tsx --test src/lib/lmnp/store/workspace-save-serializer.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  __testResetSerializedWorkspaceWrites,
  isStaleWorkspaceWrite,
  runSerializedWorkspaceWrite,
} from "./workspace-save-serializer";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("workspace-save-serializer", () => {
  it("exécute les écritures dans l'ordre d'enqueue malgré des durées variables", async () => {
    __testResetSerializedWorkspaceWrites();
    const log: string[] = [];

    const first = runSerializedWorkspaceWrite(async () => {
      await sleep(80);
      log.push("A");
    });
    const second = runSerializedWorkspaceWrite(async () => {
      log.push("B");
    });

    await Promise.all([first, second]);
    assert.deepEqual(log, ["A", "B"]);
  });

  it("une écriture lente antérieure ne peut pas écraser une écriture plus récente (race B1)", async () => {
    __testResetSerializedWorkspaceWrites();
    const disk: { step: string | null } = { step: null };

    const slow = runSerializedWorkspaceWrite(async () => {
      await sleep(60);
      disk.step = "ventilation";
    });
    const fast = runSerializedWorkspaceWrite(async () => {
      disk.step = "review_plan";
    });

    await Promise.all([slow, fast]);
    assert.equal(disk.step, "review_plan");
  });

  it("isStaleWorkspaceWrite détecte les générations obsolètes", async () => {
    __testResetSerializedWorkspaceWrites();
    let capturedGen = 0;
    await runSerializedWorkspaceWrite(async (generation) => {
      capturedGen = generation;
    });
    await runSerializedWorkspaceWrite(async () => undefined);
    assert.equal(isStaleWorkspaceWrite(capturedGen), true);
    assert.equal(isStaleWorkspaceWrite(capturedGen + 1), false);
  });
});
