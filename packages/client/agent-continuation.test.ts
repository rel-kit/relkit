import { expect, test } from "bun:test";
import type { ThreadSnapshot } from "@relkit/contracts";
import { prepareAgentContinuation } from "./src/react/agent-continuation.ts";
import { reconcileAgentRun } from "./src/react/agent-reconcile.ts";
import { clearPendingOperations, pendingOperations, rememberPending } from "./src/react/pending.ts";

test("binds continuation digest input to the observed waiting revision", async () => {
  let loads = 0;
  const client = {
    "relkit.agent.load": async () => {
      loads += 1;
      return waitingSnapshot("thread:one", "revision:loaded");
    },
  };
  const observed = waitingSnapshot("thread:one", "revision:observed");

  const prepared = await prepareAgentContinuation(
    client,
    "orders.review",
    "thread:one",
    { approved: true },
    observed,
  );

  expect(prepared).toEqual({
    waitingRevision: "revision:observed",
    digestValue: { payload: { approved: true }, waitingRevision: "revision:observed" },
  });
  expect(loads).toBe(0);
});

test("loads the requested thread when the hook has no matching waiting snapshot", async () => {
  let requested: unknown;
  const client = {
    "relkit.agent.load": async (input: unknown) => {
      requested = input;
      return waitingSnapshot("thread:two", "revision:loaded");
    },
  };

  const prepared = await prepareAgentContinuation(
    client,
    "orders.review",
    "thread:two",
    "continue",
    waitingSnapshot("thread:one", "revision:stale"),
  );

  expect(requested).toEqual({ agentId: "orders.review", threadId: "thread:two" });
  expect(prepared.waitingRevision).toBe("revision:loaded");
});

test("persists the revision-bound continuation digest for receipt reconciliation", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  try {
    const first = await rememberPending(
      "scope",
      "continuation",
      "orders.review",
      { payload: true, waitingRevision: "revision:one" },
      { threadId: "thread:one" },
    );
    const second = await rememberPending(
      "scope",
      "continuation",
      "orders.review",
      { payload: true, waitingRevision: "revision:two" },
      { threadId: "thread:one" },
    );

    expect(first.requestDigest).not.toBe(second.requestDigest);
    clearPendingOperations("scope");
  } finally {
    if (previous === undefined) delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    else Object.defineProperty(globalThis, "sessionStorage", previous);
  }
});

test("restores a durable thread after an unknown run response", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  try {
    const pending = await rememberPending(
      "scope",
      "agent-run",
      "orders.review",
      { orderId: "one" },
      { threadId: "thread:one" },
    );
    const restored = await reconcileAgentRun(
      {
        "relkit.agent.receipt": async (input: { readonly operationId: string }) => {
          expect(input.operationId).toBe(pending.operationId);
          return { status: "found", receipt: { threadId: "thread:one" } };
        },
      },
      "scope",
      "orders.review",
      new AbortController().signal,
    );

    expect(restored).toBe("thread:one");
    expect(pendingOperations("scope")).toEqual([]);
  } finally {
    if (previous === undefined) delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    else Object.defineProperty(globalThis, "sessionStorage", previous);
  }
});

function waitingSnapshot(threadId: string, revision: string): ThreadSnapshot {
  return {
    thread: { threadId },
    waiting: { revision },
  } as unknown as ThreadSnapshot;
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  const storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
      delete (storage as unknown as Record<string, unknown>)[key];
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
      (storage as unknown as Record<string, unknown>)[key] = value;
    },
  } satisfies Storage;
  return storage;
}
