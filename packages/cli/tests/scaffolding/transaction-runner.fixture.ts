/** Acquires temporary files and settlement barriers for the ignored-signal installer test in the caller's existing Scope; no nested scope shortens their lifetime. */

import { Effect } from "effect";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScaffoldPlan } from "create-relkit/internal/add-types";
import {
  applyScaffoldPlan,
  type ApplyScaffoldContext,
} from "../../src/scaffolding/add-transaction.js";
import { normalizeAddRequest } from "../../src/scaffolding/add-options.js";

/** Acquires the original runner setup and registers its original cleanup on the current test Scope.
 * @returns A lazy Effect yielding the owned root, readiness/settlement barriers and cancellation controller; requires Scope and preserves native I/O failures.
 */
export const ignoredRunnerSetupEffect = Effect.fn("Test.ignoredRunnerSetup")(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-runner-settlement-"))),
    (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
  );
  yield* Effect.promise(() =>
    Promise.all([
      writeFile(join(root, "value.ts"), "original"),
      writeFile(join(root, "bun.lock"), "lock-original"),
      writeFile(join(root, "bun.lockb"), "binary-original"),
    ]),
  );
  const started = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  const settlement = Promise.withResolvers<void>();
  yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => settlement.resolve()));
  const controller = new AbortController();
  return { root, started, aborted, settlement, controller };
});

/** Joins this fixture's exact ignored-signal task before its owned root is removed. */
export function ignoredRunnerCleanupEffect(
  setup: Pick<
    Effect.Success<ReturnType<typeof ignoredRunnerSetupEffect>>,
    "controller" | "settlement"
  >,
  settled: Promise<void>,
) {
  return Effect.addFinalizer(() =>
    Effect.promise(async () => {
      setup.controller.abort();
      setup.settlement.resolve();
      await settled;
    }),
  );
}

/** Starts the original install transaction and retains its settlement in the test Scope. */
export const ignoredRunnerTaskEffect = Effect.fn("Test.ignoredRunnerTask")(function* (
  setup: Effect.Success<ReturnType<typeof ignoredRunnerSetupEffect>>,
  onComplete: () => void,
) {
  const task = applyScaffoldPlan(
    {
      ...transactionPlan(setup.root),
      dependencies: { effect: "4.0.1" },
      request: { ...transactionPlan(setup.root).request, install: true },
    },
    {
      signal: setup.controller.signal,
      commandRunner: ignoredRunnerCommand(setup),
    },
  ).then(
    (value) => {
      onComplete();
      return value;
    },
    (error: unknown) => {
      onComplete();
      return error;
    },
  );
  yield* ignoredRunnerCleanupEffect(
    setup,
    task.then(() => undefined),
  );
  return { task };
});

/** Retains the original late lock writes after the caller releases its installer barrier. */
export function ignoredRunnerCommand(
  setup: Pick<
    Effect.Success<ReturnType<typeof ignoredRunnerSetupEffect>>,
    "root" | "started" | "aborted" | "settlement"
  >,
): NonNullable<ApplyScaffoldContext["commandRunner"]> {
  return async (_command, _cwd, signal) => {
    signal?.addEventListener("abort", () => setup.aborted.resolve(), { once: true });
    setup.started.resolve();
    await setup.settlement.promise;
    await writeFile(join(setup.root, "bun.lock"), "late-lock-mutation");
    await writeFile(join(setup.root, "bun.lockb"), "late-binary-mutation");
    return { exitCode: 0 };
  };
}

/** Creates the unchanged concrete update transaction used by rollback probes. */
export function transactionPlan(root: string): ScaffoldPlan {
  return {
    request: normalizeAddRequest(["function", "Sample", "--project-root", root, "--no-install"]),
    projectRoot: root,
    operations: [{ path: "value.ts", action: "update", content: "updated" }],
    dependencies: {},
    artifacts: [],
    profiles: [],
    warnings: [],
    nextSteps: [],
  };
}
