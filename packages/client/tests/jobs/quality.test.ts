import { expect, it } from "vitest";
import { JobWatchAbortedError } from "../../src/jobs/types.ts";
import { runPollingFeed } from "../../src/jobs/watch-feed-polling.ts";
import { runWatchFeed } from "../../src/jobs/watch-feed-loop.ts";
import { offline } from "../../src/jobs/watch-feed-support.ts";
import {
  frame,
  makeFeed,
  clientWithGet,
  clientWithError,
  clientWithWatch,
  clientWithWatchError,
} from "./quality-fixture.js";

/** Waits for an observation workflow to end, whether it settles or rejects.
 * @param work - Observation workflow.
 * @returns The rejection, or undefined when the workflow settled. */
const settle = (work: Promise<void>): Promise<unknown> =>
  work.then(
    () => undefined,
    (error) => error,
  );

it("covers offline recovery and polling terminal/error transitions", async () => {
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
  await settle(runPollingFeed(terminal.feed, 1));
  expect(terminal.events.map((event) => event.kind === "status" && event.status)).toContain(
    "completed",
  );
  expect(terminal.rejected).toHaveLength(0);
  const unauthorized = makeFeed(
    { source: "polling", maxReconnectAttempts: 1 },
    clientWithError({ code: "FORBIDDEN" }),
  );
  await settle(runPollingFeed(unauthorized.feed, 1));
  expect(unauthorized.events).toContainEqual(expect.objectContaining({ status: "unauthorized" }));
  expect(unauthorized.rejected).toHaveLength(1);
  const failed = makeFeed(
    { source: "polling", maxReconnectAttempts: 1 },
    clientWithError(new Error("down")),
  );
  await settle(runPollingFeed(failed.feed, 1));
  expect(failed.events).toContainEqual(expect.objectContaining({ status: "error" }));
  const retried = makeFeed(
    {
      source: "polling",
      maxReconnectAttempts: 2,
      reconnectMinDelayMs: 0,
      reconnectMaxDelayMs: 0,
    },
    clientWithError(new Error("down")),
  );
  await settle(runPollingFeed(retried.feed, 1));
  expect(
    retried.events.filter((event) => event.kind === "status" && event.status === "reconnecting"),
  ).toHaveLength(2);
});
it("covers polling changes, terminal rechecks and active-generation exits", async () => {
  let abortController: AbortController | undefined;
  const changing = makeFeed({ source: "polling" }, clientWithGet("running"), {
    onAbort: (controller) => {
      abortController = controller;
    },
    onResolveFirsts: () => abortController?.abort("stop"),
  });
  await settle(runPollingFeed(changing.feed, 1));
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
  await settle(runPollingFeed(unconfirmed.feed, 1));
  expect(unconfirmed.rejected).toHaveLength(0);
  const inactive = makeFeed({ source: "polling" }, clientWithGet("running"), {
    onAccepted: (control) => {
      control.active = false;
      control.abort?.abort("stop");
    },
  });
  await settle(runPollingFeed(inactive.feed, 1));
  expect(inactive.events).toContainEqual(expect.objectContaining({ status: "connected" }));
});
it("covers native feed frames, reconciliation and retry exits", async () => {
  const reconciled = makeFeed(
    { maxReconnectAttempts: 1 },
    clientWithWatch([frame("running")], "completed"),
  );
  await settle(runWatchFeed(reconciled.feed, 1));
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
  await settle(runWatchFeed(notConfirmed.feed, 1));
  expect(notConfirmed.rejected).toHaveLength(0);
  const unauthorized = makeFeed(
    { maxReconnectAttempts: 1 },
    clientWithWatchError({ code: "RELKIT_JOB_ACCESS_DENIED" }),
  );
  await settle(runWatchFeed(unauthorized.feed, 1));
  expect(unauthorized.events).toContainEqual(expect.objectContaining({ status: "unauthorized" }));
  const exhausted = makeFeed({ maxReconnectAttempts: 1 }, clientWithWatchError(new Error("down")));
  await settle(runWatchFeed(exhausted.feed, 1));
  expect(exhausted.events).toContainEqual(expect.objectContaining({ status: "error" }));
  const inactive = makeFeed({ maxReconnectAttempts: 1 }, clientWithWatch([frame("running")]), {
    onIterator: (control) => {
      control.active = false;
    },
  });
  await settle(runWatchFeed(inactive.feed, 1));
  expect(inactive.rejected).toHaveLength(0);
  const noSnapshot = makeFeed({ maxReconnectAttempts: 1 }, clientWithWatch([]));
  await settle(runWatchFeed(noSnapshot.feed, 1));
  expect(noSnapshot.events).toContainEqual(expect.objectContaining({ status: "error" }));
});

it("an aborted signal stops native and polling feeds and releases their requests", async () => {
  const held = Promise.withResolvers<IteratorResult<unknown>>();
  let request: AbortSignal | undefined;
  let returned = 0;
  const client = {
    jobs: {
      quality: {
        runs: {
          watch: async (_input: unknown, options: { readonly signal: AbortSignal }) => {
            request = options.signal;
            return {
              next: () => held.promise,
              return: async () => {
                returned++;
                held.resolve({ done: true, value: undefined });
                return { done: true, value: undefined };
              },
            };
          },
        },
      },
    },
  };
  const native = makeFeed({ maxReconnectAttempts: 1 }, client);
  const stop = new AbortController();
  const watching = settle(runWatchFeed(native.feed, 1, stop.signal));
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(native.events).toContainEqual(expect.objectContaining({ status: "connected" }));
  stop.abort();
  expect(await watching).toBeInstanceOf(JobWatchAbortedError);
  expect(request?.aborted).toBe(true);
  expect(returned).toBe(1);
  expect(native.control.failures).toBe(0);
  expect(native.rejected).toHaveLength(0);
  const polling = makeFeed({ source: "polling" }, clientWithGet("running"));
  const pollStop = new AbortController();
  const polled = settle(runPollingFeed(polling.feed, 1, pollStop.signal));
  await new Promise((resolve) => setTimeout(resolve, 5));
  pollStop.abort();
  expect(await polled).toBeInstanceOf(JobWatchAbortedError);
  expect(polling.events).toContainEqual(expect.objectContaining({ kind: "frame" }));
  const before = new AbortController();
  before.abort();
  expect(await settle(runWatchFeed(makeFeed({}, client).feed, 1, before.signal))).toBeInstanceOf(
    JobWatchAbortedError,
  );
});

it("a read timeout reconnects with reset continuity before the retry budget ends", async () => {
  let opened = 0;
  const client = {
    jobs: {
      quality: {
        runs: {
          watch: async () => {
            opened++;
            if (opened > 2) throw new Error("down");
            let pulls = 0;
            return {
              next: () =>
                opened === 1 || pulls++ > 0
                  ? new Promise<IteratorResult<unknown>>(() => undefined)
                  : Promise.resolve({ done: false, value: frame("running") }),
              return: async () => ({ done: true, value: undefined }),
            };
          },
        },
      },
    },
  };
  const accepted: unknown[] = [];
  const feed = makeFeed(
    { maxReconnectAttempts: 3, readTimeoutMs: 1, reconnectMinDelayMs: 0, reconnectMaxDelayMs: 0 },
    client,
    { onAccepted: () => undefined },
  );
  const accept = feed.feed.acceptFrame;
  const observed = {
    ...feed.feed,
    acceptFrame: (value: unknown) => (accepted.push(value), accept(value)),
  };
  const error = await settle(runWatchFeed(observed, 1));
  expect(opened).toBe(4);
  expect(feed.events).toContainEqual(expect.objectContaining({ status: "reconnecting" }));
  expect(accepted[0]).toMatchObject({ kind: "reset", reason: "reconnected" });
  expect(error).toBeDefined();
  expect(feed.events.at(-1)).toMatchObject({ status: "error" });
});
