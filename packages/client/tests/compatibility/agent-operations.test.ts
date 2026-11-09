import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { createAgentOperations } from "../../src/react/agent-operations.service.ts";
import { createPendingOperations } from "../../src/react/pending.service.ts";

/**
 * Creates agent operations over isolated pending memory without browser persistence.
 * @returns The operations and the pending service they record receipts in.
 */
function isolated() {
  const pending = createPendingOperations({ memory: new Map(), storage: () => undefined });
  return { pending, agent: createAgentOperations(pending) };
}

test("standalone continuation cancellation aborts its authoritative native read", async () => {
  const { agent } = isolated();
  const started = Promise.withResolvers<void>();
  let request: AbortSignal | undefined;
  let cancelled = 0;
  const client = {
    "relkit.agent.load": (_input: unknown, options: { signal: AbortSignal }) => {
      request = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => {
            cancelled++;
            reject(options.signal.reason);
          },
          { once: true },
        );
        started.resolve();
      });
    },
  };
  const controller = new AbortController();
  const work = agent.continuation(client, "agent", "thread", {}, undefined, controller.signal);
  await started.promise;
  controller.abort();
  await expect(work).rejects.toBe(controller.signal.reason);
  expect(request?.aborted).toBe(true);
  expect(cancelled).toBe(1);
});

test("agent dispatch retains unknown receipt authority and the original rejection", async () => {
  const { agent, pending } = isolated();
  const rejection = { code: "transport-lost" };
  const result = agent.submit({
    client: {
      "relkit.agent.run": async () => {
        throw rejection;
      },
    },
    scopeKey: "agent-owner",
    agentId: "agent",
    threadId: "thread",
    identity: undefined,
    kind: "run",
    payload: { secret: "memory-only" },
  });
  await expect(result).rejects.toBe(rejection);
  const entries = pending.list("agent-owner");
  expect(entries).toHaveLength(1);
  expect(entries[0]?.state).toBe("unknown");
  expect(entries[0]?.kind).toBe("agent-run");
  expect(pending.request("agent-owner", entries[0]!.operationId)).toBeUndefined();
  expect(JSON.stringify(entries)).not.toContain("memory-only");
});

test("agent dispatch forgets the receipt on a permanent RPC rejection", async () => {
  const { agent, pending } = isolated();
  const rejection = new ORPCError("FORBIDDEN");
  const result = agent.submit({
    client: {
      "relkit.agent.control": async () => {
        throw rejection;
      },
    },
    scopeKey: "agent-owner",
    agentId: "agent",
    threadId: "thread",
    identity: undefined,
    kind: "stop",
    payload: { mode: "graceful" },
  });
  await expect(result).rejects.toBe(rejection);
  expect(pending.list("agent-owner")).toEqual([]);
});

test("agent dispatch forgets an accepted receipt and binds continuations to the revision", async () => {
  const { agent, pending } = isolated();
  let dispatched: Record<string, unknown> | undefined;
  const receipt = await agent.submit({
    client: {
      "relkit.agent.load": async () => ({
        thread: { threadId: "thread" },
        waiting: { revision: "r1" },
      }),
      "relkit.agent.control": async (input: Record<string, unknown>) => {
        dispatched = input;
        expect(pending.list("agent-owner")[0]?.kind).toBe("continuation");
        return { accepted: true };
      },
    },
    scopeKey: "agent-owner",
    agentId: "agent",
    threadId: "thread",
    identity: undefined,
    kind: "approve",
    payload: { approvalId: "a1", decision: "approve" },
    resume: true,
  });
  expect(receipt).toEqual({ accepted: true });
  expect(dispatched).toMatchObject({ resume: true, waitingRevision: "r1", kind: "approve" });
  expect(pending.list("agent-owner")).toEqual([]);
});

test("a run receipt for another thread is rejected and left unknown", async () => {
  const { agent, pending } = isolated();
  const result = agent.submit({
    client: { "relkit.agent.run": async () => ({ threadId: "other" }) },
    scopeKey: "agent-owner",
    agentId: "agent",
    threadId: "thread",
    identity: undefined,
    kind: "run",
    payload: "hello",
  });
  await expect(result).rejects.toThrow("different thread ID");
  expect(pending.list("agent-owner")[0]?.state).toBe("unknown");
});

test("reconcile forgets found and expired receipts and stops when aborted", async () => {
  const { agent, pending } = isolated();
  const references = { threadId: "thread:one" };
  const found = await pending.remember("scope", "agent-run", "agent", 1, references, {});
  const expired = await pending.remember("scope", "agent-control", "agent", 2, references, {});
  const missing = await pending.remember("scope", "continuation", "agent", 3, references, {});
  await pending.remember("scope", "agent-run", "other-agent", 4, references, {});
  const statuses = new Map<string, unknown>([
    [found.operationId, { status: "found", receipt: { threadId: "thread:one" } }],
    [expired.operationId, { status: "expired" }],
    [missing.operationId, { status: "not-found" }],
  ]);
  const client = {
    "relkit.agent.receipt": async (input: { readonly operationId: string }) =>
      statuses.get(input.operationId),
  };
  const restored = await agent.reconcile(client, "scope", "agent", new AbortController().signal);
  expect(restored).toBe("thread:one");
  expect(pending.list("scope").map((item) => item.operationId)).toHaveLength(2);
  expect(pending.list("scope").some((item) => item.operationId === missing.operationId)).toBe(true);

  const controller = new AbortController();
  const hanging = agent.reconcile(
    { "relkit.agent.receipt": () => new Promise(() => undefined) },
    "scope",
    "agent",
    controller.signal,
  );
  controller.abort();
  await expect(hanging).rejects.toBe(controller.signal.reason);
});
