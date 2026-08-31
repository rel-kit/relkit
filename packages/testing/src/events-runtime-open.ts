import { join } from "node:path";
import {
  materializeEvents,
  type EventRuntimeProvider,
  type InvocationTarget,
} from "@relkit/engine";
import type { UnknownEventEnvelope } from "@relkit/events";
import type { RetryPolicy } from "@relkit/jobs";
import { createEventLog, createEventRouter, type EventRouter } from "@relkit/providers-local";
import type { InvocationRunner } from "@relkit/runtime-effect";
import { createEventInvoker } from "./events-runtime-utils.js";
import type { TestFailureControls } from "./fakes.js";
import type { TestStateRoot } from "./state-root.js";
import type { TestEventOptions } from "./events-types.js";

export interface OpenTestEventRuntimeOptions {
  readonly profile: string;
  readonly plan: Parameters<typeof materializeEvents>[0]["plan"];
  readonly owner: TestStateRoot;
  readonly options: TestEventOptions<unknown, unknown>;
  readonly now: () => number;
  readonly random: () => number;
  readonly failures: TestFailureControls;
  readonly runner: InvocationRunner;
  readonly idSource: Parameters<typeof createEventInvoker>[4];
  readonly targets: ReadonlyMap<string, InvocationTarget<unknown, unknown>>;
  readonly generation: number;
}

export async function openTestEventRuntime(input: OpenTestEventRuntimeOptions): Promise<{
  readonly log: Awaited<ReturnType<typeof createEventLog>>;
  readonly router: EventRouter;
  readonly generation: number;
  readonly storedCount: number;
}> {
  const log = await createEventLog(join(input.owner.path, "events"), { now: input.now });
  const router = await createEventRouter(join(input.owner.path, "deliveries"), {
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
  });
  const runtimeProvider: EventRuntimeProvider = {
    registerContract: (contract) => router.registerContract(contract),
    registerTrigger: (binding) =>
      router.registerTrigger({
        id: binding.id,
        targetFunctionId: binding.targetFunctionId,
        eventId: binding.eventId,
        eventVersion: binding.eventVersion,
        delivery: binding.delivery,
        profile: binding.profile,
        invoke: binding.invoke,
        ...(binding.retry === undefined ? {} : { retry: binding.retry as unknown as RetryPolicy }),
        ...(binding.concurrency === undefined ? {} : { concurrency: binding.concurrency }),
        ...(binding.timeoutMs === undefined ? {} : { timeoutMs: binding.timeoutMs }),
      }),
  };
  await materializeEvents({
    plan: input.plan,
    eventProviders: new Map([[input.profile, runtimeProvider]]),
    engine: {
      invoke: createEventInvoker(
        input.targets,
        input.options,
        input.now,
        input.runner,
        input.idSource,
      ),
    },
  });
  return {
    log,
    router,
    generation: input.generation + 1,
    storedCount: log.snapshot().records.length,
  };
}
