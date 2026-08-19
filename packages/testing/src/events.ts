import { normalizeId, type JsonValue } from "@zsys/contracts";
import { materializeEvents } from "@zsys/engine";
import type { InvocationRunner } from "@zsys/runtime-effect";
import { createDeterministicClock } from "./runtime-clock.js";
import { createTestStateRoot } from "./state-root.js";
import { createFailures, createIdSource, createRandom } from "./jobs-utils.js";
import { createTestEventRuntime } from "./events-runtime.js";
import type { TestEventFake, TestEventOptions, TestEventTriggerOptions } from "./events-types.js";

type NormalizedTrigger<Output> = TestEventTriggerOptions<Output> & {
  readonly delivery: "ephemeral" | "durable";
  readonly profile: string;
  readonly expansion: readonly string[];
};

/** Creates a deterministic event publication and delivery harness. */
export async function createTestEvent<Payload = unknown, Output = unknown>(
  options: TestEventOptions<Payload, Output>,
): Promise<TestEventFake<Payload, Output>> {
  const eventId = normalizeId(options.event?.ref.id ?? options.eventId ?? "");
  const version = options.event?.version ?? options.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1)
    throw new TypeError("Test event version must be a positive integer");
  const profile = normalizeId(options.profile ?? "default");
  const triggers = normalizeTriggers(eventId, version, profile, options);
  const owner = createTestStateRoot(options.stateRoot);
  const deterministic = createDeterministicClock(options.startTimeMs ?? 0);
  const failures = options.failures ?? createFailures();
  const runner: InvocationRunner = {
    run: (effect, runOptions) => deterministic.run(effect, runOptions),
  };
  return createTestEventRuntime({
    eventId,
    version,
    profile,
    triggers,
    plan: createPlan(eventId, version, triggers),
    owner,
    deterministic,
    failures,
    random: createRandom(options.random, options.randomValues),
    runner,
    idSource: createIdSource(),
    options,
  });
}

export const createTestEventFake = createTestEvent;

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
            id: options.triggerId ?? `${eventId}.trigger`,
            target: options.target,
            ...(options.delivery === undefined ? {} : { delivery: options.delivery }),
            ...(options.selector === undefined ? {} : { selector: options.selector }),
            ...(options.expansion === undefined ? {} : { expansion: options.expansion }),
            ...(options.profile === undefined ? {} : { profile: options.profile }),
            ...(options.retry === undefined ? {} : { retry: options.retry }),
            ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
          },
        ]);
  return Object.freeze(
    source.map((trigger) => {
      const triggerProfile = normalizeId(trigger.profile ?? profile);
      if (triggerProfile !== profile) throw new TypeError("Test event profiles must match");
      return Object.freeze({
        id: normalizeId(trigger.id),
        target: trigger.target,
        delivery: trigger.delivery ?? "durable",
        profile: triggerProfile,
        expansion: Object.freeze(
          [...(trigger.expansion ?? [`${eventId}@${version}`])].map(String).sort(),
        ),
        ...(trigger.selector === undefined ? {} : { selector: trigger.selector }),
        ...(trigger.retry === undefined ? {} : { retry: trigger.retry }),
        ...(trigger.concurrency === undefined ? {} : { concurrency: trigger.concurrency }),
      });
    }),
  );
}

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
        selector: trigger.selector ?? { eventId, version },
        expansion: trigger.expansion,
        delivery: trigger.delivery,
        profile: trigger.profile,
        ...(trigger.retry === undefined ? {} : { retry: trigger.retry as unknown as JsonValue }),
        ...(trigger.concurrency === undefined ? {} : { concurrency: trigger.concurrency }),
      },
    })),
    events: [{ kind: "event", id: eventId, source, version, payload: {} }],
    httpTriggers: [],
    queues: [],
    schedules: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
  } as Parameters<typeof materializeEvents>[0]["plan"];
}
