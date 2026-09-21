import { expect, test } from "bun:test";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import { stateFromFeedEvent } from "./src/jobs/controller-state.ts";
import {
  freeze,
  notify,
  reconnectAfterTeardown,
  resumedOptions,
} from "./src/jobs/controller-support.ts";
import { runPollingFeed } from "./src/jobs/watch-feed-polling.ts";
import { runWatchFeed, type WatchFeedLoop } from "./src/jobs/watch-feed-loop.ts";
import {
  backoff,
  closeEmptyIterator,
  isFrame,
  isUnauthorized,
  offline,
  resetFrame,
  wait,
  withAfter,
} from "./src/jobs/watch-feed-support.ts";
import type { FeedEvent } from "./src/jobs/watch-feed-types.ts";
import type { JobWatchOptions } from "./src/jobs/types.ts";

function run(status: RunSnapshot["status"]): RunSnapshot {
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

function frame(status: RunSnapshot["status"], kind: RunWatchFrame["kind"] = "update") {
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

test("covers controller state transitions and support helpers", async () => {
  const current = {
    connection: "connected" as const,
    isStale: true,
    continuity: "history" as const,
  };
  expect(
    stateFromFeedEvent(
      current,
      { kind: "status", status: "unauthorized", error: "denied" },
      "native",
    ),
  ).toMatchObject({ connection: "unauthorized", isStale: false });
  expect(
    stateFromFeedEvent(current, { kind: "status", status: "error", error: "failed" }, "native"),
  ).toMatchObject({ connection: "error", connectionError: "failed" });
  expect(
    stateFromFeedEvent(
      current,
      { kind: "status", status: "reconnecting", error: "retry" },
      undefined,
    ),
  ).toMatchObject({ connection: "reconnecting", isStale: true });
  expect(
    stateFromFeedEvent(current, { kind: "status", status: "completed" }, "polling"),
  ).toMatchObject({ connection: "completed" });
  expect(
    stateFromFeedEvent(current, { kind: "frame", frame: frame("running", "snapshot") }, undefined),
  ).toMatchObject({ connection: "connected", continuity: "state", source: "native" });
  expect(
    stateFromFeedEvent(current, { kind: "frame", frame: frame("completed", "reset") }, undefined),
  ).toMatchObject({ connection: "completed", isStale: true, resetReason: "reconnected" });

  const nested = { child: { value: 1 } } as { child: { value: number } };
  expect(freeze(nested)).toBe(nested);
  expect(Object.isFrozen(nested.child)).toBe(true);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(() => freeze(cyclic)).not.toThrow();
  expect(() =>
    notify(() => {
      throw new Error("listener");
    }, current),
  ).not.toThrow();
  expect(resumedOptions({ runId: "run" }, current)).toEqual({ runId: "run" });
  expect(resumedOptions({ runId: "run" }, { ...current, cursor: "cursor" })).toMatchObject({
    after: "cursor",
  });
  expect(withAfter({ runId: "run" }, undefined)).toEqual({ runId: "run" });
  expect(withAfter({ runId: "run" }, "cursor")).toMatchObject({ after: "cursor" });
  expect(backoff(1, { runId: "run", reconnectMinDelayMs: 0, reconnectMaxDelayMs: 0 })).toBe(0);
  expect(
    backoff(4, { runId: "run", reconnectMinDelayMs: 1, reconnectMaxDelayMs: 2 }),
  ).toBeGreaterThanOrEqual(1);
  expect(isFrame(frame("running"))).toBe(true);
  expect(isFrame(null)).toBe(false);
  expect(resetFrame(frame("running"))).toMatchObject({ kind: "reset", reason: "reconnected" });
  const alreadyReset = frame("running", "reset");
  expect(resetFrame(alreadyReset)).toBe(alreadyReset);
  expect(resetFrame({})).toEqual({});
  expect(await closeEmptyIterator().next()).toEqual({ done: true, value: undefined });
  expect(isUnauthorized({ data: { cause: { code: "FORBIDDEN" } } })).toBe(true);
  expect(isUnauthorized({ cause: { code: "UNAUTHORIZED" } })).toBe(true);
  expect(isUnauthorized({ code: "other" })).toBe(false);
  expect(isUnauthorized(null)).toBe(false);

  const aborted = new AbortController();
  aborted.abort("stop");
  await expect(wait(1, aborted.signal)).rejects.toBe("stop");
  const during = new AbortController();
  const pending = wait(100, during.signal);
  during.abort("cancelled");
  await expect(pending).rejects.toBe("cancelled");
  const previous = Promise.reject(new Error("previous"));
  await expect(
    reconnectAfterTeardown(previous, Promise.resolve(), async () => undefined),
  ).resolves.toBeUndefined();
  await expect(
    reconnectAfterTeardown(undefined, undefined, async () => undefined),
  ).resolves.toBeUndefined();
});

test("covers offline recovery and polling terminal/error transitions", async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousAddEventListener = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
  const previousRemoveEventListener = Object.getOwnPropertyDescriptor(
    globalThis,
    "removeEventListener",
  );
  let onlineListener: (() => void) | undefined;
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { onLine: false },
    });
    Object.defineProperty(globalThis, "addEventListener", {
      configurable: true,
      value: (_type: string, listener: unknown) => {
        onlineListener = listener as () => void;
      },
    });
    Object.defineProperty(globalThis, "removeEventListener", {
      configurable: true,
      value: () => undefined,
    });
    const online = offline(new AbortController().signal);
    onlineListener?.();
    await expect(online).resolves.toBe(true);
  } finally {
    if (previousNavigator === undefined) delete (globalThis as { navigator?: unknown }).navigator;
    else Object.defineProperty(globalThis, "navigator", previousNavigator);
    if (previousAddEventListener === undefined)
      delete (globalThis as { addEventListener?: unknown }).addEventListener;
    else Object.defineProperty(globalThis, "addEventListener", previousAddEventListener);
    if (previousRemoveEventListener === undefined)
      delete (globalThis as { removeEventListener?: unknown }).removeEventListener;
    else Object.defineProperty(globalThis, "removeEventListener", previousRemoveEventListener);
  }

  const terminal = makeFeed(
    { source: "polling", maxReconnectAttempts: 1 },
    clientWithGet("completed"),
  );
  await runPollingFeed(terminal.feed, 1);
  expect(terminal.events.map((event) => event.kind === "status" && event.status)).toContain(
    "completed",
  );
  expect(terminal.rejected).toHaveLength(0);

  const unauthorized = makeFeed(
    { source: "polling", maxReconnectAttempts: 1 },
    clientWithError({ code: "FORBIDDEN" }),
  );
  await runPollingFeed(unauthorized.feed, 1);
  expect(unauthorized.events).toContainEqual(expect.objectContaining({ status: "unauthorized" }));
  expect(unauthorized.rejected).toHaveLength(1);

  const failed = makeFeed(
    { source: "polling", maxReconnectAttempts: 1 },
    clientWithError(new Error("down")),
  );
  await runPollingFeed(failed.feed, 1);
  expect(failed.events).toContainEqual(expect.objectContaining({ status: "error" }));

  const retried = makeFeed(
    { source: "polling", maxReconnectAttempts: 2, reconnectMinDelayMs: 0, reconnectMaxDelayMs: 0 },
    clientWithError(new Error("down")),
  );
  await runPollingFeed(retried.feed, 1);
  expect(
    retried.events.filter((event) => event.kind === "status" && event.status === "reconnecting"),
  ).toHaveLength(2);
});

test("covers polling changes, terminal rechecks and active-generation exits", async () => {
  let abortController: AbortController | undefined;
  const changing = makeFeed({ source: "polling" }, clientWithGet("running"), {
    onAbort: (controller) => {
      abortController = controller;
    },
    onResolveFirsts: () => abortController?.abort("stop"),
  });
  await runPollingFeed(changing.feed, 1);
  expect(changing.events).toContainEqual(expect.objectContaining({ kind: "frame" }));

  let terminalAbort: AbortController | undefined;
  const unconfirmed = makeFeed({ source: "polling" }, clientWithGet("completed"), {
    onAbort: (controller) => {
      terminalAbort = controller;
    },
    onVerifyTerminal: () => {
      terminalAbort?.abort("stop");
      return false;
    },
  });
  await runPollingFeed(unconfirmed.feed, 1);
  expect(unconfirmed.rejected).toHaveLength(0);

  const inactive = makeFeed({ source: "polling" }, clientWithGet("running"), {
    onAccepted: (control) => {
      control.active = false;
      control.abort?.abort("stop");
    },
  });
  await runPollingFeed(inactive.feed, 1);
  expect(inactive.events).toContainEqual(expect.objectContaining({ status: "connected" }));
});

test("covers native feed frames, reconciliation and retry exits", async () => {
  const reconciled = makeFeed(
    { maxReconnectAttempts: 1 },
    clientWithWatch([frame("running")], "completed"),
  );
  await runWatchFeed(reconciled.feed, 1);
  expect(reconciled.events).toContainEqual(expect.objectContaining({ status: "completed" }));

  const notConfirmed = makeFeed(
    { maxReconnectAttempts: 1 },
    clientWithWatch([frame("completed")], "running"),
    {
      onVerifyTerminal: (frameValue) => (frameValue.run.status === "completed" ? false : true),
      onResolveFirsts: (control) => {
        control.active = false;
      },
    },
  );
  await runWatchFeed(notConfirmed.feed, 1);
  expect(notConfirmed.rejected).toHaveLength(0);

  const unauthorized = makeFeed(
    { maxReconnectAttempts: 1 },
    clientWithWatchError({ code: "RELKIT_JOB_ACCESS_DENIED" }),
  );
  await runWatchFeed(unauthorized.feed, 1);
  expect(unauthorized.events).toContainEqual(expect.objectContaining({ status: "unauthorized" }));

  const exhausted = makeFeed({ maxReconnectAttempts: 1 }, clientWithWatchError(new Error("down")));
  await runWatchFeed(exhausted.feed, 1);
  expect(exhausted.events).toContainEqual(expect.objectContaining({ status: "error" }));

  const inactive = makeFeed({ maxReconnectAttempts: 1 }, clientWithWatch([frame("running")]), {
    onIterator: (control) => {
      control.active = false;
    },
  });
  await runWatchFeed(inactive.feed, 1);
  expect(inactive.rejected).toHaveLength(0);

  const noSnapshot = makeFeed({ maxReconnectAttempts: 1 }, clientWithWatch([]));
  await runWatchFeed(noSnapshot.feed, 1);
  expect(noSnapshot.events).toContainEqual(expect.objectContaining({ status: "error" }));
});

type Control = {
  active: boolean;
  failures: number;
  abort?: AbortController;
  events: FeedEvent<RunSnapshot>[];
  rejected: unknown[];
};

function makeFeed(
  options: JobWatchOptions,
  client: unknown,
  hooks: {
    readonly onAbort?: (controller: AbortController) => void;
    readonly onAccepted?: (control: Control) => void;
    readonly onIterator?: (control: Control) => void;
    readonly onResolveFirsts?: (control: Control) => void;
    readonly onVerifyTerminal?: (
      frame: RunWatchFrame<RunSnapshot>,
      signal: AbortSignal,
    ) => Promise<boolean | undefined> | boolean | undefined;
  } = {},
) {
  const control: Control = { active: true, failures: 0, events: [], rejected: [] };
  const feed: WatchFeedLoop<RunSnapshot> = {
    client,
    name: "quality",
    options,
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

function clientWithGet(status: RunSnapshot["status"]): unknown {
  return { jobs: { quality: { runs: { get: async () => run(status) } } } };
}

function clientWithError(error: unknown): unknown {
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

function clientWithWatchError(error: unknown): unknown {
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

function clientWithWatch(values: readonly unknown[], finalStatus?: RunSnapshot["status"]): unknown {
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

function finiteIterator(values: readonly unknown[]): AsyncIterator<unknown> {
  let index = 0;
  return {
    next: async () =>
      index < values.length
        ? { done: false, value: values[index++] }
        : { done: true, value: undefined },
    return: async () => ({ done: true, value: undefined }),
  };
}
