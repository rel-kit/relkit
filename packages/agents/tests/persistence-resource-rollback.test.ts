import { expect, test } from "vitest";
import { MemorySaver } from "@langchain/langgraph";
import { Effect } from "effect";
import { defineCheckpointerDb } from "../src/define-persistence.js";
import {
  resolveAgentPersistence,
  resolveAgentPersistenceEffect,
} from "../src/graph-persistence.js";

test("releases an owned checkpointer when later store validation fails", async () => {
  let disposals = 0;
  const checkpointer = defineCheckpointerDb({
    id: "rollback.checkpointer",
    client: () => new MemorySaver(),
    dispose: () => {
      disposals += 1;
    },
  });

  await expect(
    resolveAgentPersistence({ checkpointer, store: { batch: false } }, {}),
  ).rejects.toThrow("memory resource does not implement the LangGraph protocol");
  expect(disposals).toBe(1);
});

test("interrupted resolution releases an owned handle acquired after cancellation", async () => {
  let finishFactory = (_handle: MemorySaver) => {};
  const factory = new Promise<MemorySaver>((resolve) => {
    finishFactory = resolve;
  });
  let markStarted = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let markDisposed = () => {};
  const disposed = new Promise<void>((resolve) => {
    markDisposed = resolve;
  });
  const checkpointer = defineCheckpointerDb({
    id: "interrupted.checkpointer",
    client: () => {
      markStarted();
      return factory;
    },
    dispose: () => {
      markDisposed();
    },
  });
  const controller = new AbortController();
  const pending = Effect.runPromise(resolveAgentPersistenceEffect({ checkpointer }, {}), {
    signal: controller.signal,
  });
  await started;
  controller.abort();
  finishFactory(new MemorySaver());
  await expect(pending).rejects.toThrow();
  await disposed;
});

test("a failed concurrent resolution does not close a committed checkpointer", async () => {
  let disposals = 0;
  const checkpointer = defineCheckpointerDb({
    id: "shared.checkpointer",
    client: () => new MemorySaver(),
    dispose: () => {
      disposals += 1;
    },
  });
  const [failed, succeeded] = await Promise.allSettled([
    resolveAgentPersistence({ checkpointer, store: { batch: false } }, {}),
    resolveAgentPersistence({ checkpointer, store: { batch() {} } }, {}),
  ]);

  expect(failed.status).toBe("rejected");
  expect(succeeded.status).toBe("fulfilled");
  expect(disposals).toBe(0);
  await checkpointer.release();
  expect(disposals).toBe(1);
});
