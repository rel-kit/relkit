/** Owns bounded native PID readiness/reaping probes; pure configuration source publishes evaluator and descendant identities atomically before the CPU-bound test begins. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ownedNativePromise } from "./src/services/owned-promise.js";
import { cliAdapterError } from "./src/cli-errors.js";
import { ProcessIds } from "./dev-check-fixture.schemas.js";

/** Produces the original controlled evaluator behavior with atomic readiness publication.
 * @param cpuBound - Whether the evaluator loops indefinitely instead of throwing its original diagnostic.
 * @returns Native configuration source whose complete PID marker precedes either controlled behavior. */
export function configurationSource(cpuBound: boolean): string {
  const behavior = cpuBound
    ? "while (true) {}"
    : 'setInterval(() => {}, 1000); throw new Error("fixture config diagnostic");';
  return `
import { rename } from "node:fs/promises";
const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
  stdin: "ignore", stdout: "ignore", stderr: "ignore",
});
const pending = new URL("./pids.pending.json", import.meta.url);
await Bun.write(pending, JSON.stringify([process.pid, child.pid]));
await rename(pending, new URL("./pids.json", import.meta.url));
${behavior}
`;
}

/** Tests actual OS liveness without converting unrelated native errors into absence.
 * @param pid - Actual evaluator or descendant identity from the validated marker.
 * @returns Whether that native process remains visible to the OS. */
export function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

/** Waits for the complete atomic marker under the original 200-by-10ms readiness policy.
 * @param root - Caller-owned evaluator fixture root.
 * @returns Actual schema-decoded process IDs, or the original native/decode/readiness failure. */
const pidsEffect = Effect.fn("DevCheckProbe.pids")(
  function* (root: string) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const source = yield* ownedNativePromise("dev-check.pids", () =>
        readFile(join(root, "pids.json"), "utf8").catch((error) => {
          if (error instanceof Error && "code" in error && error.code === "ENOENT")
            return undefined;
          throw error;
        }),
      );
      if (source !== undefined)
        return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ProcessIds))(source);
      yield* Effect.sleep("10 millis");
    }
    return yield* cliAdapterError(
      "dev-check.pids",
      new Error("Evaluator PID readiness marker was not published"),
    );
  },
  (effect) => observeExecution("testing", "dev-check.pids", effect),
);

/** Gives the OS its original bounded reap interval after the actual compiler has joined.
 * @param pids - Original evaluator/descendant identities.
 * @returns Completion after each native reap probe; callers retain the actual liveness assertions. */
const reapEffect = Effect.fn("DevCheckProbe.reap")(
  (pids: readonly number[]) =>
    Effect.forEach(pids, (pid) =>
      Effect.gen(function* () {
        for (let attempt = 0; attempt < 100 && running(pid); attempt++)
          yield* Effect.sleep("10 millis");
      }),
    ).pipe(Effect.asVoid),
  (effect) => observeExecution("testing", "dev-check.reap", effect),
);

/** Captures stateless probe operations without acquiring evaluator resources or changing its cancellation API. */
class DevCheckProbe extends Context.Service<DevCheckProbe>()("relkit.tests.DevCheckProbe", {
  make: Effect.succeed({ pids: pidsEffect, reap: reapEffect }),
}) {}
const live = Layer.effect(DevCheckProbe, DevCheckProbe.make);

/** Bridges native Bun assertions to observed marker readiness.
 * @param root - Scope-owned evaluator root.
 * @returns Original validated PID array after finite I/O settlement. */
export function waitForPids(root: string): Promise<readonly number[]> {
  return Effect.runPromise(
    Effect.flatMap(DevCheckProbe, (probe) => probe.pids(root)).pipe(Effect.provide(live)),
  );
}

/** Bridges native Bun assertions to the original OS reap interval.
 * @param pids - Actual process identities retained across cancellation.
 * @returns Completion before callers assert that every original process is gone. */
export function waitForStopped(pids: readonly number[]): Promise<void> {
  return Effect.runPromise(
    Effect.flatMap(DevCheckProbe, (probe) => probe.reap(pids)).pipe(Effect.provide(live)),
  );
}
