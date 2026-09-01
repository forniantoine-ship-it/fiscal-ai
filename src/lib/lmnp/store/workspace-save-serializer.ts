/**
 * Serialized async write queue — prevents slower older workspace writes from
 * overwriting newer snapshots (B1 last-write-wins race).
 */
let writeChain: Promise<void> = Promise.resolve();
let writeGeneration = 0;

export async function runSerializedWorkspaceWrite(
  task: (generation: number) => Promise<void>,
): Promise<void> {
  const generation = ++writeGeneration;
  writeChain = writeChain
    .then(() => task(generation))
    .catch((error) => {
      console.error("[lmnp] serialized workspace write failed", error);
    });
  await writeChain;
}

export function isStaleWorkspaceWrite(generation: number): boolean {
  return generation < writeGeneration;
}

/** @internal tests */
export function __testResetSerializedWorkspaceWrites(): void {
  writeChain = Promise.resolve();
  writeGeneration = 0;
}
