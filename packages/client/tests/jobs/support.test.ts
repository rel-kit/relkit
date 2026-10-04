import { expect, test } from "@effect/vitest";
import { vi } from "vitest";
import { stateFromFeedEvent } from "../../src/jobs/controller-state.ts";
import {
  freeze,
  notify,
  reconnectAfterTeardown,
  resumedOptions,
} from "../../src/jobs/controller-support.ts";
import {
  backoff,
  closeEmptyIterator,
  isFrame,
  isUnauthorized,
  offline,
  resetFrame,
  wait,
  withAfter,
} from "../../src/jobs/watch-feed-support.ts";
import { frame } from "./quality-fixture.js";

test("native compatibility wait releases its borrowed abort listener on timeout", async () => {
  const controller = new AbortController();
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  try {
    await wait(0, controller.signal);
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort("already aborted");
    await expect(offline(controller.signal)).rejects.toBe("already aborted");
  } finally {
    controller.abort();
    removed.mockRestore();
  }
});

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

test("uses default reconnect bounds and waits for teardown without a prior feed", async () => {
  expect(backoff(1, { runId: "run" })).toBe(500);
  expect(backoff(1, { runId: "run", reconnectMinDelayMs: 1500 })).toBe(1500);
  const noCursor = { ...frame("running"), cursor: undefined };
  expect(resetFrame(noCursor)).not.toHaveProperty("cursor");
  let finishTeardown!: () => void;
  const teardown = new Promise<void>((resolve) => {
    finishTeardown = resolve;
  });
  let started = false;
  const next = reconnectAfterTeardown(undefined, teardown, async () => {
    started = true;
  });
  await Promise.resolve();
  expect(started).toBe(false);
  finishTeardown();
  await next;
  expect(started).toBe(true);
});
