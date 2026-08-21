import { createTestEvent } from "../../packages/testing/src/index.ts";
import type { InvocationContext } from "../../packages/engine/src/index.ts";
import { defineError } from "../../packages/functions/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import {
  registerEventContractSuite,
  type EventContractTarget,
  type EventContractTrigger,
} from "./events.ts";

const payload = z.object({ orderId: z.string() });
const output = z.object({ handled: z.boolean() });
const retryableError = defineError({
  id: "events.retryable",
  data: z.object({ reason: z.string() }),
  message: "retryable",
  retry: "later",
});

const testingEvents: EventContractTarget = {
  name: "deterministic testing event harness",
  capabilities: {
    ephemeral: { persistence: "none", restartRecovery: false },
    durable: {
      persistence: "restart-recovery",
      restartRecovery: true,
      atLeastOnce: true,
      exactlyOnce: false,
      ordering: "unsupported",
      orderedByKey: false,
    },
  },
  create: async (options = {}) => {
    const invocations: Array<{
      readonly target: string;
      readonly input: Parameters<NonNullable<EventContractTrigger["handler"]>>[0];
      readonly source: InvocationContext["invocation"]["source"];
      readonly attempt: number;
    }> = [];
    const specs: readonly EventContractTrigger[] = options.triggers ?? [
      {
        id: "orders.receipt",
        delivery: options.delivery ?? "durable",
        expansion: ["orders.created@1"],
      },
    ];
    const triggers = specs.map((spec) => ({
      id: spec.id,
      delivery: spec.delivery ?? options.delivery ?? "durable",
      ...(spec.expansion === undefined ? {} : { expansion: spec.expansion }),
      ...(options.retry === undefined ? {} : { retry: options.retry }),
      target: {
        id: `events.target.${spec.id}`,
        input: z.unknown(),
        output,
        errors: [retryableError],
        handler: async (
          input: Parameters<NonNullable<EventContractTrigger["handler"]>>[0],
          _request,
          context: InvocationContext,
        ) => {
          invocations.push({
            target: spec.id,
            input,
            source: context.invocation.source,
            attempt: context.invocation.attempt,
          });
          try {
            return (await spec.handler?.(input, context)) ?? { handled: true };
          } catch (error) {
            if (error instanceof Error && error.message === "retryable")
              throw retryableError.create({ reason: "retryable" });
            throw error;
          }
        },
      },
    }));
    const event = await createTestEvent<
      { readonly orderId: string },
      { readonly handled: boolean }
    >({
      eventId: "orders.created",
      version: 1,
      payloadSchema: payload,
      triggers,
      ...(options.retry === undefined ? {} : { retry: options.retry }),
      ...(options.leaseDurationMs === undefined
        ? {}
        : { leaseDurationMs: options.leaseDurationMs }),
      ...(options.ephemeralCapacity === undefined
        ? {}
        : { ephemeralCapacity: options.ephemeralCapacity }),
      ...(options.startTimeMs === undefined ? {} : { startTimeMs: options.startTimeMs }),
      ...(options.stateRoot === undefined ? {} : { stateRoot: options.stateRoot }),
      correlationId: "contract-correlation",
      causationInvocationId: "contract-invocation",
    });
    return { event, invocations };
  },
};

registerEventContractSuite(testingEvents);
