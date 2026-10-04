import type { NormalizedTrigger } from "./events.types.js";
import { normalizeId, type JsonValue } from "@relkit/contracts";
import { materializeEvents } from "@relkit/engine";
import type { InvocationRunner } from "@relkit/runtime-effect";
import { createDeterministicClock } from "./runtime-clock.js";
import { createTestStateRoot } from "./state-root.js";
import { createFailures, createIdSource, createRandom } from "./jobs-utils.js";
import { createTestEventRuntime } from "./events-runtime.js";
import type { TestEventFake, TestEventOptions } from "./events-types.js";

/**
 * Creates a deterministic event publication and delivery harness.
 * @typeParam Payload - Event payload accepted by the native publication schema.
 * @typeParam Output - Output validated by the target's native schema.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns The ready event harness, releasing partial acquisition on failure.
 */
export async function createTestEvent<Payload = unknown, Output = unknown>(
  options: TestEventOptions<Payload, Output>,
): Promise<TestEventFake<Payload, Output>> {
  const eventId = normalizeId(options.event?.ref.id ?? options.eventId ?? "");
  const version = options.event?.version ?? options.version ?? 1;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1)
    throw new TypeError("Test event version must be a positive integer");
  const profile = normalizeId(options.profile ?? "default");
  const triggers = normalizeTriggers(eventId, version, profile, options);
  const deterministic = createDeterministicClock(options.startTimeMs ?? 0);
  const random = createRandom(options.random, options.randomValues);
  const failures = options.failures ?? createFailures();
  const runner: InvocationRunner = {
    run: (effect, runOptions) => deterministic.run(effect, runOptions),
  };
  const owner = createTestStateRoot(options.stateRoot);
  try {
    return await createTestEventRuntime({
      eventId,
      version,
      profile,
      triggers,
      plan: createPlan(eventId, version, triggers),
      owner,
      deterministic,
      failures,
      random,
      runner,
      idSource: createIdSource(),
      options,
    });
  } catch (error) {
    owner.cleanup(true);
    throw error;
  }
}

/** @inheritDoc createTestEvent */
export const createTestEventFake = createTestEvent;

/**
 * Validates and binds event trigger identities and delivery policy.
 * @typeParam Output - Output validated by the target's native schema.
 * @param eventId - Declared event identity.
 * @param version - Declared positive event version.
 * @param profile - Native provider profile identity.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns Immutable triggers preserving native concurrency, retry and profile contracts.
 */
function normalizeTriggers<Output>(
  eventId: string,
  version: number,
  profile: string,
  options: TestEventOptions<unknown, Output>,
): readonly NormalizedTrigger<Output>[] {
  const source =
    options.triggers ??
    (options.target === undefined
      ? []
      : [
          {
            id: options.triggerId ?? `relkit.event.${options.target.id}.trigger`,
            target: options.target,
            ...(options.delivery === undefined ? {} : { delivery: options.delivery }),
            ...(options.profile === undefined ? {} : { profile: options.profile }),
            ...(options.retry === undefined ? {} : { retry: options.retry }),
            ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
          },
        ]);
  return Object.freeze(
    source.map((trigger) => {
      if (trigger.target.event !== eventId)
        throw new TypeError(
          `Event function ${trigger.target.id} consumes ${trigger.target.event}, not ${eventId}`,
        );
      const triggerProfile = normalizeId(trigger.profile ?? trigger.target.profile ?? profile);
      if (triggerProfile !== profile) throw new TypeError("Test event profiles must match");
      return Object.freeze({
        id: normalizeId(trigger.id),
        target: trigger.target,
        delivery: trigger.delivery ?? trigger.target.delivery,
        profile: triggerProfile,
        eventId,
        eventVersion: version,
        retry: trigger.retry ?? trigger.target.retry,
        ...((trigger.concurrency ?? trigger.target.concurrency) === undefined
          ? {}
          : { concurrency: trigger.concurrency ?? trigger.target.concurrency }),
        ...((trigger.timeoutMs ?? trigger.target.timeoutMs) === undefined
          ? {}
          : { timeoutMs: trigger.timeoutMs ?? trigger.target.timeoutMs }),
      });
    }),
  );
}

/**
 * Builds the minimal registration plan consumed by native materialization.
 * @typeParam Output - Output validated by the target's native schema.
 * @param eventId - Declared event identity.
 * @param version - Declared positive event version.
 * @param triggers - Normalized native event trigger policies.
 * @returns A registration plan preserving retry, concurrency and identity policies.
 */
function createPlan<Output>(
  eventId: string,
  version: number,
  triggers: readonly NormalizedTrigger<Output>[],
): Parameters<typeof materializeEvents>[0]["plan"] {
  const source = { file: "test-events.ts", line: 1, column: 1 } as const;
  return {
    graphHash: "sha256:test-events",
    functions: triggers.map(({ target }) => ({
      kind: "function",
      invocationMode: "event-only",
      id: target.id,
      source,
      input: {},
      output: {},
    })),
    eventTriggers: triggers.map((trigger) => ({
      kind: "trigger",
      id: trigger.id,
      source,
      triggerType: "event",
      targetFunctionId: trigger.target.id,
      config: {
        eventId,
        eventVersion: version,
        delivery: trigger.delivery,
        profile: trigger.profile,
        ...(trigger.retry === undefined ? {} : { retry: trigger.retry as unknown as JsonValue }),
        ...(trigger.concurrency === undefined ? {} : { concurrency: trigger.concurrency }),
        ...(trigger.timeoutMs === undefined ? {} : { timeoutMs: trigger.timeoutMs }),
      },
    })),
    events: [
      {
        kind: "event",
        id: eventId,
        source,
        version,
        input: {},
        profile: triggers[0]?.profile ?? "default",
      },
    ],
    httpTriggers: [],
    queues: [],
    schedules: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    channels: [],
    middlewares: [],
  } as Parameters<typeof materializeEvents>[0]["plan"];
}
