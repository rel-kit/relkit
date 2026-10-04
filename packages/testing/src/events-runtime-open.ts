import type { OpenTestEventRuntimeOptions } from "./events-runtime-open.types.js";
export type { OpenTestEventRuntimeOptions } from "./events-runtime-open.types.js";
import { join } from "node:path";
import { Effect } from "effect";
import { materializeEvents, type EventRuntimeProvider } from "@relkit/engine";

import type { RetryPolicy } from "@relkit/jobs/legacy";
import { createEventLog, createEventRouter, type EventRouter } from "@relkit/providers-local";

import { createEventInvoker } from "./events-runtime-utils.js";

/**
 * Acquires log/router resources and materializes the declared event plan.
 * @param input - Declared input passed through the owning schema authority.
 * @returns The ready generation, closing all acquired resources if setup fails.
 */
export function openTestEventRuntime(input: OpenTestEventRuntimeOptions) {
  return Effect.gen(function* () {
    /* Native generation shape is inferred from the final return. */
    const log = yield* Effect.tryPromise({
      try: () => createEventLog(join(input.owner.path, "events"), { now: input.now }),
      catch: (cause) => cause,
    });
    let router: EventRouter | undefined;
    return yield* Effect.gen(function* () {
      router = yield* Effect.tryPromise({
        try: () =>
          createEventRouter(join(input.owner.path, "deliveries"), {
            now: input.now,
            random: input.random,
            ownerToken: `test-event-owner-${input.generation + 1}`,
            ...(input.options.leaseDurationMs === undefined
              ? {}
              : { leaseDurationMs: input.options.leaseDurationMs }),
            ...(input.options.ephemeralCapacity === undefined
              ? {}
              : { ephemeralCapacity: input.options.ephemeralCapacity }),
            onBoundary: (boundary) => {
              if (boundary === "handler-success-before-ack")
                input.failures.check("event.after-handler-success-before-ack");
            },
          }),
        catch: (cause) => cause,
      });
      const runtimeProvider: EventRuntimeProvider = {
        registerContract: (contract) => router!.registerContract(contract),
        registerTrigger: (binding) =>
          router!.registerTrigger({
            id: binding.id,
            targetFunctionId: binding.targetFunctionId,
            eventId: binding.eventId,
            eventVersion: binding.eventVersion,
            delivery: binding.delivery,
            profile: binding.profile,
            invoke: binding.invoke,
            ...(binding.retry === undefined
              ? {}
              : { retry: binding.retry as unknown as RetryPolicy }),
            ...(binding.concurrency === undefined ? {} : { concurrency: binding.concurrency }),
            ...(binding.timeoutMs === undefined ? {} : { timeoutMs: binding.timeoutMs }),
          }),
      };
      yield* Effect.tryPromise({
        try: () =>
          materializeEvents({
            plan: input.plan,
            eventProviders: new Map([[input.profile, runtimeProvider]]),
            engine: {
              invoke: createEventInvoker(
                input.targets,
                input.options,
                input.now,
                input.runner,
                input.idSource,
                input.ownerSignal,
              ),
            },
          }),
        catch: (cause) => cause,
      });
      return {
        log,
        router,
        generation: input.generation + 1,
        storedCount: log.snapshot().records.length,
      };
    }).pipe(
      Effect.onError(() =>
        Effect.forEach(
          [() => router?.close(), () => log.close()],
          (release) =>
            Effect.exit(
              Effect.tryPromise({
                try: async () => {
                  await release();
                },
                catch: (cause) => cause,
              }),
            ),
          { concurrency: 1, discard: true },
        ),
      ),
    );
  });
}
