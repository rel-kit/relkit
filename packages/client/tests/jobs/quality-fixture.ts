import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { WatchFeedLoop } from "../../src/jobs/watch-feed-loop.types.js";
import type { JobWatchOptions } from "../../src/jobs/types.js";
import type { QualityControl, QualityHooks } from "./quality-fixture.types.js";

/** Builds the legacy authoritative fixture run without altering its payload.
 * @param status - Canonical run lifecycle to expose.
 * @returns The retained assertion-bearing run snapshot. */
export function run(status: RunSnapshot["status"]): RunSnapshot {
  return {
    accepted: true,
    runId: "run-quality",
    jobId: "job-quality",
    taskId: "task-quality",
    taskVersion: "1",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    buildId: "build-quality",
    service: "local",
    status,
    observedAt: "2026-01-01T00:00:01.000Z",
    resultAvailability: status === "completed" ? "available" : "pending",
  } as RunSnapshot;
}

/** Builds a native observation around the retained fixture run.
 * @param status - Canonical observed run lifecycle.
 * @param kind - Native frame discriminator.
 * @returns The retained sequence, cursor and continuity fixture. */
export function frame(status: RunSnapshot["status"], kind: RunWatchFrame["kind"] = "update") {
  return {
    kind,
    run: run(status),
    observedAt: "2026-01-01T00:00:01.000Z",
    epoch: "epoch-quality",
    sequence: 1,
    cursor: "cursor-quality",
    ...(kind === "snapshot" ? { continuity: "state" as const } : {}),
    ...(kind === "reset" ? { reason: "reconnected" as const } : {}),
  } as RunWatchFrame<RunSnapshot>;
}

/** Supplies deterministic native boundaries for the original observation assertions.
 * @param options - Legacy observation policy passed unchanged to the fixture.
 * @param client - Borrowed native procedure fixture.
 * @param hooks - Synchronous state-transition and recovery controls.
 * @returns The physical workflow callbacks and assertion-bearing state collections.
 * @remarks The original fixture omitted runId because its native procedures ignore
 * request input. The boundary cast preserves that exact legacy payload; production
 * callers and real native fixtures continue to supply complete JobWatchOptions. */
export function makeFeed(
  options: Omit<JobWatchOptions, "runId">,
  client: unknown,
  hooks: QualityHooks = {},
) {
  const control: QualityControl = { active: true, failures: 0, events: [], rejected: [] };
  const feed: WatchFeedLoop<RunSnapshot> = {
    client,
    name: "quality",
    options: options as JobWatchOptions,
    isActive: () => control.active,
    lastCursor: () => "cursor-before",
    setAbort: (controller) => {
      control.abort = controller;
      if (controller !== undefined) hooks.onAbort?.(controller);
    },
    setIterator: () => hooks.onIterator?.(control),
    acceptFrame: (value) => {
      hooks.onAccepted?.(control);
      return value as RunWatchFrame<RunSnapshot>;
    },
    emit: (event) => control.events.push(event),
    verifyTerminal: async (value, signal) => hooks.onVerifyTerminal?.(value, signal) ?? true,
    releaseTerminal: () => {
      control.active = false;
    },
    resolveFirsts: () => hooks.onResolveFirsts?.(control),
    rejectFirsts: (error) => control.rejected.push(error),
    failureCount: () => control.failures,
    setFailureCount: (value) => {
      control.failures = value;
    },
  };
  return { control, feed, events: control.events, rejected: control.rejected };
}

/** Provides an authoritative native get boundary.
 * @param status - Run lifecycle returned on each read.
 * @returns A deterministic generated-procedure-shaped client. */
export function clientWithGet(status: RunSnapshot["status"]): unknown {
  return { jobs: { quality: { runs: { get: async () => run(status) } } } };
}

/** Provides an authoritative native read failure without translating its identity.
 * @param error - Exact rejection supplied by the assertion.
 * @returns A generated-procedure-shaped client that rejects each read. */
export function clientWithError(error: unknown): unknown {
  return {
    jobs: {
      quality: {
        runs: {
          get: async () => {
            throw error;
          },
        },
      },
    },
  };
}

/** Provides a native establishment failure without translating its identity.
 * @param error - Exact rejection supplied by the assertion.
 * @returns A generated-procedure-shaped client that rejects establishment. */
export function clientWithWatchError(error: unknown): unknown {
  return {
    jobs: {
      quality: {
        runs: {
          watch: async () => {
            throw error;
          },
        },
      },
    },
  };
}

/** Provides finite native observations and optional authoritative EOF recovery.
 * @param values - Exact ordered native frames to expose.
 * @param finalStatus - Optional authoritative lifecycle after native EOF.
 * @returns A deterministic generated-procedure-shaped observation client. */
export function clientWithWatch(
  values: readonly unknown[],
  finalStatus?: RunSnapshot["status"],
): unknown {
  return {
    jobs: {
      quality: {
        runs: {
          watch: async () => finiteIterator(values),
          ...(finalStatus === undefined ? {} : { get: async () => run(finalStatus) }),
        },
      },
    },
  };
}

/** Supplies ordered native pulls with an idempotent completed return.
 * @param values - Exact ordered native fixture values.
 * @returns An independently indexed finite iterator. */
export function finiteIterator(values: readonly unknown[]): AsyncIterator<unknown> {
  let index = 0;
  return {
    next: async () =>
      index < values.length
        ? { done: false, value: values[index++] }
        : { done: true, value: undefined },
    return: async () => ({ done: true, value: undefined }),
  };
}
