import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { runPollingFeed as runPollingFeedEffect } from "../../src/jobs/watch-feed-polling.ts";
import { runWatchFeed as runWatchFeedEffect } from "../../src/jobs/watch-feed-loop.ts";
import { offline } from "../../src/jobs/watch-feed-support.ts";
import {
  frame,
  makeFeed,
  clientWithGet,
  clientWithError,
  clientWithWatch,
  clientWithWatchError,
} from "./quality-fixture.js";

// Failure state assertions inspect the owning Effect Exit.
it.effect("covers offline recovery and polling terminal/error transitions", () =>
  Effect.gen(function* () {
    const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const previousAddEventListener = Object.getOwnPropertyDescriptor(
      globalThis,
      "addEventListener",
    );
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
      yield* Effect.promise(() => expect(online).resolves.toBe(true));
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
    yield* Effect.exit(runPollingFeedEffect(terminal.feed, 1));
    expect(terminal.events.map((event) => event.kind === "status" && event.status)).toContain(
      "completed",
    );
    expect(terminal.rejected).toHaveLength(0);
    const unauthorized = makeFeed(
      { source: "polling", maxReconnectAttempts: 1 },
      clientWithError({ code: "FORBIDDEN" }),
    );
    yield* Effect.exit(runPollingFeedEffect(unauthorized.feed, 1));
    expect(unauthorized.events).toContainEqual(expect.objectContaining({ status: "unauthorized" }));
    expect(unauthorized.rejected).toHaveLength(1);
    const failed = makeFeed(
      { source: "polling", maxReconnectAttempts: 1 },
      clientWithError(new Error("down")),
    );
    yield* Effect.exit(runPollingFeedEffect(failed.feed, 1));
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
    yield* Effect.exit(runPollingFeedEffect(retried.feed, 1));
    expect(
      retried.events.filter((event) => event.kind === "status" && event.status === "reconnecting"),
    ).toHaveLength(2);
  }),
);
it.effect("covers polling changes, terminal rechecks and active-generation exits", () =>
  Effect.gen(function* () {
    let abortController: AbortController | undefined;
    const changing = makeFeed({ source: "polling" }, clientWithGet("running"), {
      onAbort: (controller) => {
        abortController = controller;
      },
      onResolveFirsts: () => abortController?.abort("stop"),
    });
    yield* Effect.exit(runPollingFeedEffect(changing.feed, 1));
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
    yield* Effect.exit(runPollingFeedEffect(unconfirmed.feed, 1));
    expect(unconfirmed.rejected).toHaveLength(0);
    const inactive = makeFeed({ source: "polling" }, clientWithGet("running"), {
      onAccepted: (control) => {
        control.active = false;
        control.abort?.abort("stop");
      },
    });
    yield* Effect.exit(runPollingFeedEffect(inactive.feed, 1));
    expect(inactive.events).toContainEqual(expect.objectContaining({ status: "connected" }));
  }),
);
it.effect("covers native feed frames, reconciliation and retry exits", () =>
  Effect.gen(function* () {
    const reconciled = makeFeed(
      { maxReconnectAttempts: 1 },
      clientWithWatch([frame("running")], "completed"),
    );
    yield* Effect.exit(runWatchFeedEffect(reconciled.feed, 1));
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
    yield* Effect.exit(runWatchFeedEffect(notConfirmed.feed, 1));
    expect(notConfirmed.rejected).toHaveLength(0);
    const unauthorized = makeFeed(
      { maxReconnectAttempts: 1 },
      clientWithWatchError({ code: "RELKIT_JOB_ACCESS_DENIED" }),
    );
    yield* Effect.exit(runWatchFeedEffect(unauthorized.feed, 1));
    expect(unauthorized.events).toContainEqual(expect.objectContaining({ status: "unauthorized" }));
    const exhausted = makeFeed(
      { maxReconnectAttempts: 1 },
      clientWithWatchError(new Error("down")),
    );
    yield* Effect.exit(runWatchFeedEffect(exhausted.feed, 1));
    expect(exhausted.events).toContainEqual(expect.objectContaining({ status: "error" }));
    const inactive = makeFeed({ maxReconnectAttempts: 1 }, clientWithWatch([frame("running")]), {
      onIterator: (control) => {
        control.active = false;
      },
    });
    yield* Effect.exit(runWatchFeedEffect(inactive.feed, 1));
    expect(inactive.rejected).toHaveLength(0);
    const noSnapshot = makeFeed({ maxReconnectAttempts: 1 }, clientWithWatch([]));
    yield* Effect.exit(runWatchFeedEffect(noSnapshot.feed, 1));
    expect(noSnapshot.events).toContainEqual(expect.objectContaining({ status: "error" }));
  }),
);
