import { describe, expect, test } from "bun:test";
import type { UnknownEventEnvelope } from "../../packages/events/src/index.ts";
import type { InvocationContext } from "../../packages/engine/src/index.ts";
import type { RetryPolicy } from "../../packages/jobs/src/index.ts";
import type { TestEventFake } from "../../packages/testing/src/index.ts";

export interface EventContractTrigger {
  readonly id: string;
  readonly delivery?: "ephemeral" | "durable";
  readonly handler?: (
    input: { readonly orderId: string },
    context: InvocationContext,
  ) => Promise<void>;
}

export interface EventContractCreateOptions {
  readonly triggers?: readonly EventContractTrigger[];
  readonly delivery?: "ephemeral" | "durable";
  readonly retry?: RetryPolicy;
  readonly leaseDurationMs?: number;
  readonly ephemeralCapacity?: number;
  readonly startTimeMs?: number;
  readonly stateRoot?: string;
}

export interface EventInvocationObservation {
  readonly target: string;
  readonly input: { readonly orderId: string };
  readonly trigger: unknown;
  readonly source: InvocationContext["invocation"]["source"];
  readonly attempt: number;
}

export interface EventContractHarness {
  readonly event: TestEventFake<{ readonly orderId: string }, void>;
  readonly invocations: readonly EventInvocationObservation[];
}

export interface EventContractCapabilities {
  readonly ephemeral: {
    readonly persistence: "none";
    readonly restartRecovery: false;
  };
  readonly durable: {
    readonly persistence: "restart-recovery";
    readonly restartRecovery: true;
    readonly atLeastOnce: true;
    readonly exactlyOnce: false;
    readonly ordering: "unsupported";
    readonly orderedByKey: false;
  };
}

export interface EventContractTarget {
  readonly name: string;
  readonly capabilities: EventContractCapabilities;
  readonly create: (options?: EventContractCreateOptions) => Promise<EventContractHarness>;
}

export function registerEventContractSuite(target: EventContractTarget): void {
  describe.serial(`event contract: ${target.name}`, () => {
    test("publishes a validated payload as one correlated envelope", async () => {
      await withEvent(target, async ({ event, invocations }) => {
        const published = await event.publish(
          { orderId: "order-1" },
          { key: "order-1", attributes: { source: "contract" } },
        );
        expect(published).toMatchObject({
          accepted: true,
          eventId: "orders.created",
          version: 1,
          payload: { orderId: "order-1" },
          key: "order-1",
          attributes: { source: "contract" },
          traceId: "test-trace-1",
        });
        expect(event.envelopes).toHaveLength(1);
        expect(event.pending()).toBe(1);

        await expect(event.drain()).resolves.toMatchObject([{ state: "completed", attempt: 1 }]);
        expect(invocations).toEqual([
          expect.objectContaining({
            target: "orders.receipt",
            source: "event-delivery",
            attempt: 1,
            input: { orderId: "order-1" },
            trigger: expect.objectContaining({
              event: expect.objectContaining({ instanceId: published.instanceId }),
              trace: expect.objectContaining({
                correlationId: "contract-correlation",
                causationInvocationId: "contract-invocation",
              }),
            }),
          }),
        ]);
      });
    });

    test("rejects invalid payload before acceptance or delivery", async () => {
      await withEvent(target, async ({ event, invocations }) => {
        await expect(event.publish({ orderId: 42 } as never)).rejects.toMatchObject({
          code: "RELKIT_EVENT_PAYLOAD_VALIDATION",
        });
        expect(event.envelopes).toHaveLength(0);
        expect(event.pending()).toBe(0);
        expect(invocations).toHaveLength(0);
      });
    });

    test("exposes honest ephemeral and durable delivery capabilities", () => {
      expect(target.capabilities).toEqual({
        ephemeral: { persistence: "none", restartRecovery: false },
        durable: {
          persistence: "restart-recovery",
          restartRecovery: true,
          atLeastOnce: true,
          exactlyOnce: false,
          ordering: "unsupported",
          orderedByKey: false,
        },
      });
    });

    test("fans out independently and invokes the selected target", async () => {
      await withEvent(
        target,
        async ({ event, invocations }) => {
          await event.publish({ orderId: "fan-out" });
          expect(event.pending()).toBe(2);
          await expect(event.runNext("orders.good")).resolves.toMatchObject({
            triggerId: "orders.good",
            state: "completed",
          });
          expect(invocations.map(({ target }) => target)).toEqual(["orders.good"]);
          await expect(event.runNext("orders.bad")).resolves.toMatchObject({
            triggerId: "orders.bad",
            state: "dead-lettered",
          });
          expect(event.completed("orders.good")).toBe(1);
          expect(event.completed("orders.bad")).toBe(0);
        },
        {
          retry: oneAttempt,
          triggers: [
            { id: "orders.good" },
            {
              id: "orders.bad",
              handler: async () => {
                throw new Error("listener failed");
              },
            },
          ],
        },
      );
    });

    test("recovers durable work, exposes duplicates, retries, and dead-letters safely", async () => {
      let retryAttempts = 0;
      await withEvent(
        target,
        async ({ event }) => {
          await event.publish({ orderId: "retry" });
          await expect(event.runNext("orders.retry")).resolves.toMatchObject({
            state: "delayed",
            attempt: 1,
          });
          await event.clock.advance(10);
          await expect(event.runNext("orders.retry")).resolves.toMatchObject({
            state: "completed",
            attempt: 2,
          });

          await event.publish({ orderId: "duplicate" });
          event.failures.once!("event.after-handler-success-before-ack");
          await expect(event.runNext("orders.retry")).rejects.toThrow(
            "event.after-handler-success-before-ack",
          );
          await event.clock.advance(10);
          await event.restart();
          await expect(event.runNext("orders.retry")).resolves.toMatchObject({
            state: "completed",
            attempt: 2,
            duplicate: true,
          });
          expect(retryAttempts).toBe(4);
        },
        {
          startTimeMs: 100,
          leaseDurationMs: 10,
          retry: {
            maxAttempts: 2,
            initialDelayMs: 10,
            maxDelayMs: 10,
            multiplier: 1,
            jitter: "none",
          },
          triggers: [
            {
              id: "orders.retry",
              handler: async (_input, context) => {
                retryAttempts += 1;
                if (retryAttempts === 1) throw new Error("retryable");
              },
            },
          ],
        },
      );

      await withEvent(
        target,
        async ({ event }) => {
          await event.publish({ orderId: "dead-letter" });
          const result = await event.runNext("orders.dead");
          expect(result).toMatchObject({ state: "dead-lettered", attempt: 1 });
          expect(result).not.toHaveProperty("failure.stack");
          expect(result).not.toHaveProperty("failure.cause");
        },
        {
          retry: oneAttempt,
          triggers: [
            {
              id: "orders.dead",
              handler: async () => {
                throw new Error("private-cause");
              },
            },
          ],
        },
      );
    });

    test("does not claim recovery for in-flight ephemeral delivery", async () => {
      let started!: () => void;
      let release!: () => void;
      const running = new Promise<void>((resolve) => {
        started = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const first = await target.create({
        delivery: "ephemeral",
        triggers: [
          {
            id: "orders.ephemeral",
            handler: async () => {
              started();
              await gate;
            },
          },
        ],
      });
      const publish = first.event.publish({ orderId: "lost" });
      await running;
      const stateRoot = first.event.stateRoot;
      await first.event.close();

      const restarted = await target.create({
        delivery: "ephemeral",
        stateRoot,
        triggers: [{ id: "orders.ephemeral" }],
      });
      try {
        expect(restarted.event.pending()).toBe(0);
        expect(restarted.event.deliveries).toEqual([]);
        expect(target.capabilities.ephemeral.restartRecovery).toBe(false);
      } finally {
        release();
        await publish;
        await restarted.event.close();
      }
    });
  });
}

const oneAttempt: RetryPolicy = Object.freeze({
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
});

async function withEvent(
  target: EventContractTarget,
  run: (harness: EventContractHarness) => Promise<void>,
  options: EventContractCreateOptions = {},
): Promise<void> {
  const harness = await target.create({
    ...options,
  });
  try {
    await run(harness);
  } finally {
    await harness.event.close();
  }
}
