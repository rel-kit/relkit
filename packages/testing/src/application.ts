/** General test application ownership with explicitly selected capability helpers. */
import { Layer, ManagedRuntime } from "effect";
import { runExecutionPromise } from "@relkit/contracts/operation";
import { acquireApplication } from "./application-acquisition.js";
import { TestApplicationHarness, TestApplicationPlatformLive } from "./application-platform.js";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type { TestApplication, TestApplicationOptions } from "./application.types.js";
export {
  TestApplicationHarness,
  TestApplicationPlatform,
  TestApplicationPlatformLive,
} from "./application-platform.js";
export type { TestApplication, TestApplicationOptions } from "./application.types.js";

/**
 * Creates an application owner with HTTP, deterministic runtime and provider services.
 * @param app Application environment declarations.
 * @param options Explicit environment, generated project and capability helpers.
 * @returns The ready harness; close releases resources in reverse acquisition order.
 * @example
 * ```ts
 * import { defineEnv } from "@relkit/app/config";
 * import { createTestApplication } from "@relkit/testing";
 * async function testApplication(projectRoot: string): Promise<void> {
 *   const app = await createTestApplication({ env: defineEnv({}) }, { projectRoot });
 *   try { await app.http.get("/"); } finally { await app.close(); }
 * }
 * ```
 * @category Testing
 * @since 0.1.0
 */
export async function createTestApplication(
  app: { readonly env: object },
  options: TestApplicationOptions = {},
): Promise<TestApplication> {
  const owner = ManagedRuntime.make(
    testApplicationLayer(app, options).pipe(
      Layer.provide(TestApplicationPlatformLive),
      Layer.provideMerge(testingLoggerLayer(options.logger)),
    ),
  );
  try {
    const harness = await runExecutionPromise(owner, TestApplicationHarness);
    let closing: Promise<void> | undefined;
    return Object.freeze({
      ...harness.value,
      close: () =>
        (closing ??= (async () => {
          await disposeTestingOwner(owner);
          if (harness.cleanupFailures.length > 0)
            throw new AggregateError(harness.cleanupFailures, "Test application cleanup failed");
        })()),
    });
  } catch (error) {
    await disposeTestingOwner(owner);
    throw error;
  }
}

/** Acquires the application scope using replaceable platform operations. */
export function testApplicationLayer(
  app: { readonly env: object },
  options: TestApplicationOptions = {},
) {
  return Layer.effect(TestApplicationHarness, acquireApplication(app, options));
}
