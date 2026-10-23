/** Exercises native persistence resource lifecycle behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { describe, expect, test } from "vitest";
import { END, START, InMemoryStore, MemorySaver, StateSchema } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import {
  defineCheckpointerDb,
  defineGraph,
  defineGraphNode,
  defineMemoryDb,
  invokeAgent,
  isPersistenceResource,
  releaseAgentPersistence,
} from "../src/index.js";

describe("agent persistence resources", () => {
  test(
    "lazily creates and disposes an owned checkpointer once",
    caseLazilyCreatesAndDisposesAnOwnedCheckpointer,
  );

  test(
    "never disposes a borrowed native memory store",
    caseNeverDisposesABorrowedNativeMemoryStore,
  );

  test(
    "a synchronous factory throw rejects acquisition and permits a retry",
    caseASynchronousFactoryThrowRejectsAcquisitionAnd,
  );

  test(
    "requires explicit disposal when ownership is transferred",
    caseRequiresExplicitDisposalWhenOwnershipIsTransferred,
  );

  test(
    "acquires graph persistence only when execution starts",
    caseAcquiresGraphPersistenceOnlyWhenExecutionStarts,
  );
});

/** Verifies that lazily creates and disposes an owned checkpointer once.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseLazilyCreatesAndDisposesAnOwnedCheckpointer() {
  let creates = 0;
  let disposes = 0;
  const resource = defineCheckpointerDb({
    id: "ai.checkpoints",
    client: ({ env }) => {
      expect(env.DATABASE_URL).toBe("fixture://checkpoints");
      creates += 1;
      return new MemorySaver();
    },
    dispose: () => {
      disposes += 1;
    },
  });
  expect(isPersistenceResource(resource)).toBe(true);
  expect(creates).toBe(0);
  const context = { env: { DATABASE_URL: "fixture://checkpoints" } };
  const [first, second] = await Promise.all([resource.acquire(context), resource.acquire(context)]);
  expect(first).toBe(second);
  expect(creates).toBe(1);
  await resource.release();
  await resource.release();
  expect(disposes).toBe(1);
  await expect(resource.acquire(context)).rejects.toThrow(
    'checkpointer resource "ai.checkpoints" is released',
  );
}

/** Verifies that never disposes a borrowed native memory store.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseNeverDisposesABorrowedNativeMemoryStore() {
  const store = new InMemoryStore();
  let disposes = 0;
  const resource = defineMemoryDb({
    id: "ai.memory",
    client: store,
    dispose: () => {
      disposes += 1;
    },
  });
  expect(resource.ownership).toBe("borrowed");
  expect(await resource.acquire({ env: {} })).toBe(store);
  await resource.release();
  expect(disposes).toBe(0);
  expect(JSON.parse(JSON.stringify(resource))).toEqual({
    kind: "agent-persistence",
    resource: "memory",
    id: "ai.memory",
    ownership: "borrowed",
  });
}

/** Verifies that a synchronous factory throw rejects acquisition and permits a retry.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseASynchronousFactoryThrowRejectsAcquisitionAnd() {
  let attempts = 0;
  const resource = defineCheckpointerDb({
    id: "retry.checkpoints",
    client: () => {
      attempts += 1;
      if (attempts === 1) throw new Error("opening failed");
      return new MemorySaver();
    },
    dispose: () => undefined,
  });
  const first = resource.acquire({ env: {} });
  expect(attempts).toBe(1);
  await expect(first).rejects.toThrow("opening failed");
  await expect(resource.acquire({ env: {} })).resolves.toBeInstanceOf(MemorySaver);
  expect(attempts).toBe(2);
  await resource.release();
}

/** Verifies that requires explicit disposal when ownership is transferred.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
function caseRequiresExplicitDisposalWhenOwnershipIsTransferred() {
  expect(() =>
    defineCheckpointerDb({
      id: "owned.checkpoints",
      client: new MemorySaver(),
      ownership: "owned",
    }),
  ).toThrow("Owned checkpointer resource requires dispose");
}

/** Verifies that acquires graph persistence only when execution starts.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseAcquiresGraphPersistenceOnlyWhenExecutionStarts() {
  let creates = 0;
  let disposes = 0;
  const checkpointer = defineCheckpointerDb({
    id: "lazy.graph.checkpoints",
    client: () => {
      creates += 1;
      return new MemorySaver();
    },
    dispose: () => {
      disposes += 1;
    },
  });
  const state = new StateSchema({ value: z.string(), answer: z.string().optional() });
  const node = defineGraphNode({
    id: "run",
    input: z.object({ value: z.string() }),
    output: z.object({ answer: z.string() }),
    handler: ({ value }) => ({ answer: value }),
  });
  const graph = defineGraph({
    id: "lazy-persistence",
    state,
    input: z.object({ value: z.string() }),
    output: z.object({ answer: z.string() }),
    nodes: [node],
    edges: (edge) => edge.addEdge(START, "run").addEdge("run", END),
    checkpointer,
    limits: { maxSteps: 3, maxToolCalls: 1, timeoutMs: 1000 },
  });
  expect(creates).toBe(0);
  await expect(
    invokeAgent({
      agent: graph,
      input: { value: "ok" },
      threadId: "user:order:1",
      tools: {},
      engine: { invoke: () => Promise.reject(new Error("unused")) },
    }),
  ).resolves.toEqual({ answer: "ok" });
  expect(creates).toBe(1);
  await releaseAgentPersistence([graph]);
  expect(disposes).toBe(1);
}
