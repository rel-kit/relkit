import type {
  TestRuntimeOptions,
  TestRuntimeCloseOptions,
  TestClock,
  TestRuntime,
} from "./runtime.types.js";
export type {
  TestRuntimeOptions,
  TestRuntimeCloseOptions,
  TestClock,
  TestRuntime,
} from "./runtime.types.js";
import { type EnvShape } from "@relkit/config";

import { Layer, ManagedRuntime } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import { TestRuntimeExecution, testRuntimeLayer } from "./runtime-execution.js";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";

/**
 * Creates a small deterministic runtime for direct function tests.
 * @typeParam S Concrete environment declarations inferred from the options.
 * @param options Application declarations and deterministic test dependencies.
 * @returns A synchronously ready test owner; await close to release its resources.
 * @example
 * ```ts
 * import { defineEnv } from "@relkit/app/config";
 * import { createTestRuntime } from "@relkit/testing";
 *
 * export async function runtimeExample(): Promise<void> {
 *   const runtime = createTestRuntime({ app: { env: defineEnv({}) } });
 *   try {
 *     await runtime.clock.advance(10);
 *   } finally {
 *     await runtime.close();
 *   }
 * }
 * ```
 * @see tests/fixtures/checked-examples.ts ownedHelpersExample for checked inference and release.
 */
export function createTestRuntime<S extends EnvShape = EnvShape>(
  options: TestRuntimeOptions<S> = {},
): TestRuntime {
  const owner = ManagedRuntime.make(
    testRuntimeLayer(options).pipe(Layer.provideMerge(testingLoggerLayer(options.logger))),
  );
  let service;
  try {
    service = runExecutionSync(owner, TestRuntimeExecution);
  } catch (error) {
    void disposeTestingOwner(owner).catch(() => undefined);
    throw error;
  }
  let closing: Promise<void> | undefined;
  return Object.freeze({
    ...service.value,
    invoke: (target, input, callOptions) =>
      closing === undefined
        ? runExecutionPromise(owner, service.invoke(target, input, callOptions))
        : Promise.reject(new Error("Test runtime is closed")),
    close: (closeOptions) =>
      (closing ??= runExecutionPromise(owner, service.close(closeOptions)).finally(() =>
        disposeTestingOwner(owner),
      )),
  } satisfies TestRuntime);
}
