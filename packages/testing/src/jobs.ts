import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { observeExecution, runExecutionPromise } from "@relkit/contracts/operation";
import type { JsonValue } from "@relkit/contracts";
import { createTestJobRuntime } from "./job-runtime.js";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type { TestJobCloseOptions, TestJobFake, TestJobOptions } from "./jobs-types.js";
import type { JobHarnessService } from "./job-harness.types.js";

/** Durable native job generation owned by one test scope. */
export class TestJobHarness extends Context.Service<TestJobHarness, JobHarnessService>()(
  "relkit/testing/JobHarness",
) {}

/**
 * Acquires native store/queue/worker resources with deterministic retry inputs.
 * @typeParam Input Declared target input.
 * @typeParam Output Declared target output.
 * @param options Native job policy and deterministic dependencies.
 * @returns Scoped, substitutable native harness; release joins admitted work.
 */
export function testJobLayer<Input, Output>(options: TestJobOptions<Input, Output>) {
  return Layer.effect(
    TestJobHarness,
    Effect.acquireRelease(
      observeExecution(
        "testing",
        "job.acquire",
        createTestJobRuntime(options).pipe(
          Effect.map((harness) =>
            TestJobHarness.of({
              ...harness,
              runNext: (id) => observeExecution("testing", "job.runNext", harness.runNext(id)),
              drain: observeExecution("testing", "job.drain", harness.drain),
              restart: observeExecution("testing", "job.restart", harness.restart),
              close: harness.close,
            }),
          ),
        ),
      ),
      (harness) => harness.close().pipe(Effect.orDie),
    ),
  );
}

/**
 * Creates a durable one-job harness with an owned Effect runtime.
 * @typeParam Input Public target input.
 * @typeParam Output Public target output.
 * @param options Job target, retry bounds, native persistence and deterministic time.
 * @returns Ready Promise facade; close releases the underlying Layer exactly once.
 */
export async function createTestJobFake<Input = JsonValue, Output = unknown>(
  options: TestJobOptions<Input, Output>,
): Promise<TestJobFake<Input, Output>> {
  const owner = ManagedRuntime.make(
    testJobLayer(options).pipe(Layer.provideMerge(testingLoggerLayer(options.logger))),
  );
  try {
    const harness = await runExecutionPromise(owner, TestJobHarness);
    let closing: Promise<void> | undefined;
    return Object.freeze({
      ...harness.value,
      get admin() {
        return harness.value.admin;
      },
      runNext: (id?: string) => run(harness.runNext(id)),
      drain: () => run(harness.drain),
      restart: () => run(harness.restart),
      close: (options?: TestJobCloseOptions) =>
        (closing ??= runExecutionPromise(owner, harness.close(options)).finally(() =>
          disposeTestingOwner(owner),
        )),
    }) as unknown as TestJobFake<Input, Output>;
    /**
     * Rejects new work once this public owner starts closing.
     * @typeParam A Native job workflow result.
     * @param effect Admitted worker or lifecycle workflow.
     * @returns Completion or the established closed-owner error.
     */
    function run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
      return closing === undefined
        ? runExecutionPromise(owner, effect)
        : Promise.reject(new Error("Test job is closed"));
    }
  } catch (error) {
    await disposeTestingOwner(owner).catch(() => undefined);
    throw error;
  }
}

/** @inheritDoc createTestJobFake */
export const createTestJob = createTestJobFake;
