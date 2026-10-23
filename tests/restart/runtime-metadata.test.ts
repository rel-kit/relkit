/** Checks the real metadata handoff and preservation of failed native restart fixtures. */
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { nativeAgentRuntimePackages } from "../compiler/native-agent-runtime.fixture.js";
import { readRestartRuntimePackages } from "./agent-graph-runtime.fixture.js";
import { RestartLayout, restartLayoutLayer } from "./layout-move.service.js";

test("Node worker metadata retains every real registration and SDK requirement", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-restart-jobs-"));
  let passed = false;
  try {
    const path = join(root, "runtime-integrations.json");
    await writeFile(path, JSON.stringify(nativeAgentRuntimePackages));
    expect(readRestartRuntimePackages(root)).toEqual(nativeAgentRuntimePackages);
    await writeFile(path, "{}");
    expect(() => readRestartRuntimePackages(root)).toThrow();
    passed = true;
  } finally {
    if (passed) await rm(root, { recursive: true, force: true });
    else console.error(`Failed metadata fixture retained: ${root}`);
  }
});

test("failed restart scope retains the complete authored boundary and metadata", async () => {
  let root: string | undefined;
  let passed = false;
  try {
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        root = (yield* RestartLayout).root;
        return yield* Effect.fail("intentional fixture preservation control");
      }).pipe(Effect.provide(restartLayoutLayer), Effect.scoped, Effect.exit),
    );
    expect(exit._tag).toBe("Failure");
    if (root === undefined) throw new Error("Restart scope did not acquire its root");
    expect(existsSync(join(root, "src/jobs/agent-graph-runtime.fixture.ts"))).toBe(true);
    expect(readRestartRuntimePackages(root)).toEqual(nativeAgentRuntimePackages);
    passed = true;
  } finally {
    if (passed && root !== undefined) await rm(root, { recursive: true, force: true });
  }
});
