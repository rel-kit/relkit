/**
 * Shared event provider conformance suite. Every first-party event provider (local, Postgres)
 * runs these cases, and provider authors run the same ones.
 */
import type { EventOperationContext } from "relkit/events";
import { applicationFailure } from "relkit/invocation";
import type { ConformanceHarness } from "./conformance.types.js";
import type {
  EventsConformanceCase,
  EventsConformanceCaseId,
  EventsConformanceEnvelope,
  EventsConformanceOptions,
  EventsConformanceProvider,
} from "./events-conformance.types.js";
import { check, conformanceHarness, eventually, rejects, same, SKIPPED } from "./conformance.js";

export type * from "./events-conformance.types.js";

/** The cases every event provider passes. */
export const EVENTS_CONFORMANCE_CASES: readonly EventsConformanceCase[] = Object.freeze([
  { id: "publish-accepted", description: "publish acknowledges with an instance id" },
  { id: "distinct-instances", description: "two publishes get two instance ids" },
  { id: "delivery", description: "a durable consumer receives the published payload" },
  { id: "retry-after-failure", description: "a failed delivery is retried" },
  { id: "backend-failure", description: "a failing backend rejects the publish" },
]);

const EVENT = { id: "conformance.pinged", version: 1 } as const;
const RETRY = { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" };

/**
 * Creates the events conformance harness for one provider.
 * @param options - Provider factory, delivery driver and optional failing provider.
 * @returns Cases and a runner; pass it to `runConformance` or run each case as a test.
 * @example
 * ```ts
 * import { runConformance } from "@relkit/testing/conformance";
 * import { createEventsConformanceHarness } from "@relkit/testing/events-conformance";
 *
 * const published: unknown[] = [];
 * const harness = createEventsConformanceHarness({
 *   create: () => ({
 *     publish: async (payload) => {
 *       published.push(payload);
 *       return { accepted: true, instanceId: `event-${published.length}` };
 *     },
 *   }),
 * });
 * console.log((await runConformance(harness, ["publish-accepted"])).passed);
 * ```
 */
export function createEventsConformanceHarness(
  options: EventsConformanceOptions,
): ConformanceHarness<EventsConformanceCaseId> {
  const run = `conformance-${Math.random().toString(36).slice(2, 10)}`;
  const timeout = options.deliveryTimeoutMs ?? 10_000;
  const withProvider =
    (caseId: string, body: (provider: EventsConformanceProvider) => Promise<void | "skipped">) =>
    async () => {
      const provider = await options.create(`${run}-${caseId}`, EVENT);
      try {
        return await body(provider);
      } finally {
        await provider.close?.();
      }
    };
  const drive = (provider: EventsConformanceProvider) => async () => options.deliver?.(provider);
  return conformanceHarness("events", EVENTS_CONFORMANCE_CASES, {
    "publish-accepted": withProvider("accepted", async (provider) => {
      const result = await provider.publish({ n: 1 }, {}, context());
      check(result.accepted === true, "publish is accepted", result);
      check(typeof result.instanceId === "string" && result.instanceId !== "", "instance id");
    }),
    "distinct-instances": withProvider("distinct", async (provider) => {
      const first = await provider.publish({ n: 1 }, {}, context());
      const second = await provider.publish({ n: 1 }, {}, context());
      check(first.instanceId !== second.instanceId, "instance ids differ", [first, second]);
    }),
    delivery: withProvider("delivery", async (provider) => {
      if (provider.registerTrigger === undefined) return SKIPPED;
      const received: EventsConformanceEnvelope[] = [];
      await provider.registerTrigger(
        trigger("delivery", async (envelope) => received.push(envelope)),
      );
      const published = await provider.publish({ n: 7 }, {}, context());
      await eventually(() => received.length > 0, drive(provider), timeout, "a delivery");
      check(
        received[0]?.instanceId === published.instanceId,
        "the envelope names the instance",
        received,
      );
      check(same(received[0]?.payload, { n: 7 }), "the payload arrives unchanged", received);
    }),
    "retry-after-failure": withProvider("retry", async (provider) => {
      if (provider.registerTrigger === undefined) return SKIPPED;
      let attempts = 0;
      let completed = false;
      await provider.registerTrigger(
        trigger("retry", async () => {
          attempts += 1;
          if (attempts === 1) throw options.retryableFailure?.() ?? retryLater();
          completed = true;
        }),
      );
      await provider.publish({ n: 1 }, {}, context());
      await eventually(() => completed, drive(provider), timeout, "a retried delivery");
      check(attempts === 2, "one failure, one retry", attempts);
    }),
    "backend-failure": async () => {
      if (options.failing === undefined) return SKIPPED;
      const provider = await options.failing();
      try {
        await rejects(async () => provider.publish({ n: 1 }, {}, context()), "publish");
      } finally {
        await provider.close?.().catch(() => undefined);
      }
    },
  });
}

function retryLater(): unknown {
  return applicationFailure({
    id: "conformance.retry",
    message: "Injected consumer failure; retry later.",
    data: null,
    retry: "later",
  });
}

function context(): EventOperationContext {
  return {
    operation: "publish",
    eventId: EVENT.id,
    version: EVENT.version,
    signal: new AbortController().signal,
    profile: "conformance",
  };
}

function trigger(id: string, invoke: (envelope: EventsConformanceEnvelope) => Promise<unknown>) {
  return {
    id: `conformance.${id}`,
    eventId: EVENT.id,
    eventVersion: EVENT.version,
    delivery: "durable" as const,
    retry: RETRY as EventsConformanceTriggerRetry,
    invoke,
  };
}

type EventsConformanceTriggerRetry = Parameters<
  NonNullable<EventsConformanceProvider["registerTrigger"]>
>[0]["retry"];
