import { describe, expect, test } from "bun:test";
import { diffGraph, type ApplicationGraph } from "../../packages/graph/src/index.ts";
import {
  defineEvent,
  events,
  onEvent,
  type UnknownEventEnvelope,
} from "../../packages/events/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import type { InvocationContext } from "../../packages/engine/src/index.ts";
import { NORMALIZE_CODES, normalizeCompilation } from "../../packages/compiler/src/index.ts";
import type { RetryPolicy } from "../../packages/jobs/src/index.ts";
import type { TestEventFake } from "../../packages/testing/src/index.ts";
import { z, type StandardSchemaV1 } from "../../packages/schema/src/index.ts";

export interface EventContractTrigger {
  readonly id: string;
  readonly delivery?: "ephemeral" | "durable";
  readonly expansion?: readonly string[];
  readonly handler?: (
    input: UnknownEventEnvelope,
    context: InvocationContext,
  ) => Promise<{ readonly handled: boolean }>;
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
  readonly input: UnknownEventEnvelope;
  readonly source: InvocationContext["invocation"]["source"];
  readonly attempt: number;
}

export interface EventContractHarness {
  readonly event: TestEventFake<{ readonly orderId: string }, { readonly handled: boolean }>;
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

const payload = z.object({ orderId: z.string() });
const output = z.object({ handled: z.boolean() });

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
            source: "event",
            attempt: 1,
            input: expect.objectContaining({
              instanceId: published.instanceId,
              payload: { orderId: "order-1" },
              correlationId: "contract-correlation",
              causationInvocationId: "contract-invocation",
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

    test("expands single, anyOf, and pattern selectors to known pairs", () => {
      const created = defineEvent({ id: "orders.created", version: 1, payload });
      const updated = defineEvent({
        id: "orders.updated",
        version: 2,
        payload: z.object({ orderId: z.string(), state: z.string() }),
      });
      const targetFunction = defineFunction({
        id: "orders.listener",
        input: z.union([
          envelope("orders.created", 1, payload),
          envelope("orders.updated", 2, z.object({ orderId: z.string(), state: z.string() })),
        ]),
        output,
        handler: async () => ({ handled: true }),
      });
      const descriptors = [
        created,
        updated,
        targetFunction,
        onEvent("orders.created" as never, async () => ({ handled: true }), {
          id: "orders.single",
        }),
        onEvent(
          events.anyOf("orders.updated" as never, "orders.created" as never),
          async () => ({ handled: true }),
          { id: "orders.any" },
        ),
        onEvent(events.match("orders.*"), async () => ({ handled: true }), {
          id: "orders.pattern",
        }),
      ];
      const result = normalizeCompilation({ descriptors });
      expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
      expect(triggerExpansion(result.graph, "orders.single")).toEqual(["orders.created@1"]);
      expect(triggerExpansion(result.graph, "orders.any")).toEqual([
        "orders.created@1",
        "orders.updated@2",
      ]);
      expect(triggerExpansion(result.graph, "orders.pattern")).toEqual([
        "orders.created@1",
        "orders.updated@2",
      ]);
      const forbiddenKind = ["sub", "scription"].join("");
      expect(result.graph?.nodes.some(({ kind }) => kind === forbiddenKind)).toBe(false);
      expect(result.graph?.edges.some(({ kind }) => kind === forbiddenKind)).toBe(false);
    });

    test("warns on a pattern with no known event without rejecting the graph", () => {
      const targetFunction = defineFunction({
        id: "orders.listener",
        input: z.unknown(),
        output,
        handler: async () => ({ handled: true }),
      });
      const result = normalizeCompilation({
        descriptors: [
          targetFunction,
          onEvent(events.match("payments.*"), async () => ({ handled: true }), {
            id: "payments.listener",
          }),
        ],
      });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: NORMALIZE_CODES.selector,
          severity: "warning",
          message: 'Event selector "payments.*" matched no known event.',
        }),
      );
      expect(result.activatable).toBe(true);
    });

    test("classifies a compatible pattern expansion change", () => {
      const source = { file: "events.ts", line: 1, column: 1 } as const;
      const before: ApplicationGraph = {
        contractVersion: 3,
        nodes: [
          { kind: "function", id: "orders.listener", source, input: {}, output: {} },
          {
            kind: "trigger",
            id: "orders.pattern",
            source,
            triggerType: "event",
            targetFunctionId: "orders.listener",
            config: {
              selector: { kind: "match", pattern: "orders.*" },
              expansion: ["orders.created@1"],
              delivery: "durable",
            },
          },
        ],
        edges: [],
      };
      const after: ApplicationGraph = {
        ...before,
        nodes: [
          before.nodes[0]!,
          {
            ...before.nodes[1]!,
            config: {
              ...(before.nodes[1] as { readonly config: Record<string, unknown> }).config,
              expansion: ["orders.created@1", "orders.updated@1"],
            },
          } as unknown as ApplicationGraph["nodes"][number],
        ],
      };
      expect(diffGraph(before, after).changes).toContainEqual(
        expect.objectContaining({
          category: "event/selector",
          classification: "potentially-breaking",
          selectorExpansion: { added: ["orders.updated@1"], removed: [] },
        }),
      );
    });

    test("restricts raw wildcard selectors to the declared audit purposes", () => {
      const targetFunction = defineFunction({
        id: "orders.audit",
        input: z.unknown(),
        output,
        handler: async () => ({ handled: true }),
      });
      const rejected = normalizeCompilation({
        descriptors: [
          targetFunction,
          onEvent(events.all({ payload: "unknown" }), async () => ({ handled: true }), {
            id: "orders.raw",
            delivery: "ephemeral",
          }),
        ],
      });
      expect(rejected.diagnostics).toContainEqual(
        expect.objectContaining({
          code: NORMALIZE_CODES.wildcard,
          severity: "error",
        }),
      );

      const allowed = normalizeCompilation({
        descriptors: [
          targetFunction,
          onEvent(
            events.all({ payload: "unknown", purpose: "telemetry" }),
            async () => ({ handled: true }),
            { id: "orders.telemetry", delivery: "ephemeral" },
          ),
        ],
      });
      expect(allowed.diagnostics).toContainEqual(
        expect.objectContaining({
          code: NORMALIZE_CODES.wildcard,
          severity: "warning",
        }),
      );
      expect(allowed.activatable).toBe(true);
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
                return { handled: true };
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
              return { handled: true };
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

function triggerExpansion(
  graph:
    | {
        readonly nodes: readonly {
          readonly id: string;
          readonly kind: string;
          readonly triggerType?: unknown;
          readonly config?: unknown;
        }[];
      }
    | undefined,
  id: string,
): readonly string[] | undefined {
  const node = graph?.nodes.find((entry) => entry.id === id);
  if (node?.kind !== "trigger" || node.triggerType !== "event") return undefined;
  if (!isRecord(node.config)) return undefined;
  const expansion = node.config.expansion;
  return Array.isArray(expansion)
    ? expansion.filter((value): value is string => typeof value === "string")
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function envelope<Id extends string, Version extends number>(
  eventId: Id,
  version: Version,
  eventPayload: StandardSchemaV1,
) {
  return z.object({
    instanceId: z.string(),
    eventId: z.literal(eventId),
    version: z.literal(version),
    payload: eventPayload,
    occurredAt: z.string(),
    publishedAt: z.string(),
    traceId: z.string(),
    attributes: z.object({}),
  });
}
