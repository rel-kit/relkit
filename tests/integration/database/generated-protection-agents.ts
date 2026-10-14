/** Exercises the original deterministic agent through real authenticated HTTP, retaining native receipts and identity-scoped thread state. */
import { expect } from "bun:test";
import { Effect } from "effect";
import { createOperationId } from "../../../packages/realtime/src/operation-id.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { protectionClient } from "./generated-protection-client.js";
import type { GeneratedHostSession } from "./generated-host.types.js";
import type { ProtectedUser } from "./generated-protection.types.js";

/** Runs the controlled model and checks protected admission and foreign thread isolation.
 * @param host - Actual caller-owned generated listener.
 * @param alice - Real owner session.
 * @param others - Real foreign user and tenant sessions.
 * @returns Completion after the original accepted run settles and scoped snapshots are checked.
 */
export const verifyProtectedAgents = Effect.fn("GeneratedProtection.agents")(function* (
  host: GeneratedHostSession,
  alice: ProtectedUser,
  others: readonly ProtectedUser[],
) {
  const client = yield* protectionClient(host, alice);
  const anonymous = yield* protectionClient(host);
  const request = {
    agentId: "ownership.assistant",
    threadId: "owned-conversation",
    operationId: createOperationId(),
    kind: "run",
    payload: "Alice private message",
  };
  yield* scaffoldNative("protection.agent.anonymous", async () => {
    await expect(anonymous["relkit.agent.run"](request)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  const receipt = yield* scaffoldNative("protection.agent.accept", () =>
    client["relkit.agent.run"](request),
  );
  expect(receipt.threadId).toBe(request.threadId);
  const snapshot = yield* settledProtectedAgent(client, request.agentId, request.threadId);
  yield* observeSettledAgent(client, request.agentId, request.threadId, snapshot.checkpoint);
  expect(snapshot.currentRuns).toMatchObject([{ runId: receipt.runId, status: "succeeded" }]);
  expect(snapshot.currentMessages[0]).toMatchObject({
    role: "user",
    parts: [{ text: "Alice private message" }],
  });
  expect(snapshot.currentMessages.at(-1)).toMatchObject({
    role: "assistant",
    parts: [{ text: "Offline owned response", state: "complete" }],
  });
  for (const other of others) {
    const foreign = yield* protectionClient(host, other);
    yield* scaffoldNative("protection.agent.foreign", async () => {
      await expect(
        foreign["relkit.agent.load"]({ agentId: request.agentId, threadId: request.threadId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    const isolated = yield* scaffoldNative("protection.agent.threads", () =>
      foreign["relkit.agent.threads"]({ agentId: request.agentId }),
    );
    expect(isolated.threads).toEqual([]);
  }
});

/** Borrows the original agent observation stream and joins native cancellation after checking checkpoint recovery and its completed snapshot.
 * @param client - Original authenticated HTTP protocol client.
 * @param agentId - Accepted compiler agent identity.
 * @param threadId - Actual admitted conversation identity.
 * @param checkpoint - Original provider checkpoint whose deliberately stale epoch exercises native recovery.
 * @returns Completion after the native completed frame and scope-owned iterator release.
 */
const observeSettledAgent = Effect.fn("GeneratedProtection.agent.observe")(
  function* (
    client: Effect.Success<ReturnType<typeof protectionClient>>,
    agentId: string,
    threadId: string,
    checkpoint: Effect.Success<ReturnType<typeof settledProtectedAgent>>["checkpoint"],
  ) {
    const controller = yield* Effect.acquireRelease(
      Effect.sync(() => new AbortController()),
      (controller) => Effect.sync(() => controller.abort()),
    );
    const stream = yield* scaffoldNative("protection.agent.stream", () =>
      client["relkit.agent.observe"](
        {
          agentId,
          threadId,
          after: { ...checkpoint, providerEpoch: "deliberately-stale-provider" },
        },
        { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) },
      ),
    );
    const iterator = yield* Effect.acquireRelease(
      Effect.sync(() => stream[Symbol.asyncIterator]()),
      (iterator) =>
        scaffoldNative("protection.agent.close", async () => {
          controller.abort();
          await iterator.return?.();
        }).pipe(Effect.orDie),
    );
    const frame = yield* scaffoldNative("protection.agent.frame", () => iterator.next());
    expect(frame.done).toBe(false);
    if (frame.done || frame.value.kind !== "gap")
      throw new Error("Original agent observation omitted its recovery snapshot");
    expect(frame.value.reason).toBe("provider-reset");
    expect(frame.value.snapshot.currentRuns).toMatchObject([{ status: "succeeded" }]);
    expect(frame.value.snapshot.currentMessages.at(-1)).toMatchObject({
      parts: [{ text: "Offline owned response", state: "complete" }],
    });
  },
  (effect) => effect.pipe(Effect.scoped),
);

/** Waits for the original native accepted execution under a bounded Effect clock.
 * @param client - Actual authenticated native protocol client.
 * @param agentId - Original compiler agent identity.
 * @param threadId - Caller-owned stable conversation identity.
 * @returns Original native settled snapshot; no synthetic model or provider result.
 */
const settledProtectedAgent = Effect.fn("GeneratedProtection.agent.settled")(function* (
  client: Effect.Success<ReturnType<typeof protectionClient>>,
  agentId: string,
  threadId: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = yield* scaffoldNative("protection.agent.load", () =>
      client["relkit.agent.load"]({ agentId, threadId }),
    );
    if (snapshot.thread.status === "idle") return snapshot;
    yield* Effect.sleep(25);
  }
  throw new Error("Original protected agent did not settle before its finite acceptance bound");
});
