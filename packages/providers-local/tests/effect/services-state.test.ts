/** Verifies native journal recovery, quiet store disposal and scoped filesystem lock release on transaction defects. */
import { it, expect } from "@effect/vitest";
import { vi } from "vitest";
import { Cause, Effect, Exit } from "effect";

import { appendFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";

import { localPromise } from "../../src/local-effect.js";
import { makeAgentStateStore } from "../../src/agent-state/storage.js";

import { createJobStore } from "../../src/jobs/store.js";

it.effect("journal recovery emits a bounded warning through the configured sink", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    const root = yield* Effect.acquireRelease(
      localPromise(() => mkdtemp(join(tmpdir(), "relkit-recovery-log-"))),
      (path) => localPromise(() => rm(path, { force: true, recursive: true })).pipe(Effect.orDie),
    );
    const first = yield* localPromise(() => createJobStore(root));
    yield* localPromise(() => first.close());
    yield* localPromise(() => appendFile(first.paths.records, "secret-malformed-payload\n"));
    yield* Effect.gen(function* () {
      const recovered = yield* localPromise(() => createJobStore(root));
      yield* localPromise(() => recovered.close());
    }).pipe(
      Effect.provide(
        createLoggerLayer({
          minimumLevel: "warn",
          human: { write: (_line, record) => records.push(record) },
          json: false,
        }),
      ),
    );
    expect(records.some((record) => record.message.includes("Recovered local journal"))).toBe(true);
    expect(JSON.stringify(records)).not.toContain("secret-malformed-payload");
    expect(JSON.stringify(records)).not.toContain(root);
  }).pipe(Effect.scoped),
);

it("Promise store acquisition and finalization keep the default console quiet", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const root = await mkdtemp(join(tmpdir(), "relkit-quiet-close-"));
  try {
    const store = await createJobStore(root);
    await store.close();
    expect(output).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  } finally {
    output.mockRestore();
    error.mockRestore();
    await rm(root, { force: true, recursive: true });
  }
});

it.effect("transaction defects release the filesystem lock and remain defects", () =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      localPromise(() => mkdtemp(join(tmpdir(), "relkit-effect-state-"))),
      (path) => localPromise(() => rm(path, { force: true, recursive: true })).pipe(Effect.orDie),
    );
    const store = yield* makeAgentStateStore(root);
    yield* store.read();
    const bug = new Error("programming defect");
    const exit = yield* Effect.exit(
      store.update(() => {
        throw bug;
      }),
    );
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
    expect(yield* localPromise(() => readdir(root))).toEqual(["agent-state.json"]);
    expect(yield* store.update((state) => [{ ...state, revision: 1 }, 1])).toBe(1);
  }).pipe(Effect.scoped),
);
