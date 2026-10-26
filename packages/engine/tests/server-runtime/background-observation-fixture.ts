/** Exercises native SDK context, operation metrics and callback logs through actual host resources. */
import { expect } from "@effect/vitest";
import { Context, Effect, Metric } from "effect";
import { createJobQueue, createJobStore } from "@relkit/providers-local";
import { currentNativeEffectContext } from "@relkit/runtime-effect";
import { ExecutionSuccessLogs } from "@relkit/contracts/operation";
import type { ServerRuntimeHost } from "../../src/server-runtime/server-runtime-host.types.js";
/** @param host - Actual generated host. @param root - Test-owned durable job directory. @returns The acquired real job queue/store fixture. */
export async function acquireObservedQueue(host: ServerRuntimeHost, root: string) {
  return await host.resource(
    "provider",
    async () => {
      await Promise.resolve();
      const context = currentNativeEffectContext();
      if (context === undefined) throw new Error("Acquisition lost its native context.");
      expect(Context.get(context, ExecutionSuccessLogs)).toBe(false);
      const store = await createJobStore(root);
      return { store, queue: createJobQueue(store) };
    },
    ({ store }) => store.close(),
    undefined,
    "application",
    false,
  );
}
/** @param host - Actual generated host. @param queue - Acquired native queue. @returns Once one background pass completes its context/metric assertions. */
export async function checkObservedWorker(
  host: ServerRuntimeHost,
  queue: Awaited<ReturnType<typeof acquireObservedQueue>>,
): Promise<void> {
  const complete = Promise.withResolvers<void>();
  await host.worker("job-worker", async () => {
    try {
      await observedNativePass(host, queue);
      complete.resolve();
    } catch (failure) {
      complete.reject(failure);
      throw failure;
    }
  });
  await complete.promise;
}
/** @param host - Actual generated host. @param queue - Acquired native queue. @returns After nested native callback, metric and application-log assertions. */
async function observedNativePass(
  host: ServerRuntimeHost,
  queue: Awaited<ReturnType<typeof acquireObservedQueue>>,
): Promise<void> {
  await Promise.resolve();
  const context = currentNativeEffectContext();
  if (context === undefined) throw new Error("Worker lost its native context.");
  expect(Context.get(context, ExecutionSuccessLogs)).toBe(false);
  await host.each(["absent"], async (id) => {
    await Promise.resolve();
    expect(queue.queue.get(id)).toBeUndefined();
  });
  expect(() => queue.queue.get("")).toThrow();
  await Effect.runPromiseWith(context)(Effect.logInfo("application worker message"));
  const registry = Context.get(context, Metric.MetricRegistry);
  expect(
    [...registry.values()].some(
      (entry) =>
        entry.id === "relkit_execution_outcomes_total" &&
        entry.attributes?.operation === "JobQueue.get" &&
        entry.attributes?.outcome === "success",
    ),
  ).toBe(true);
  expect(
    [...registry.values()].some(
      (entry) =>
        entry.id === "relkit_execution_outcomes_total" &&
        entry.attributes?.operation === "server.snapshot" &&
        entry.attributes?.outcome === "success",
    ),
  ).toBe(true);
}
