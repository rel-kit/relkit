import { MemorySaver } from "@langchain/langgraph";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { defineCheckpointerDb } from "../src/define-persistence.js";
import { releaseAgentPersistenceEffect } from "../src/graph-persistence.js";

test("releases every resource with a bounded number of in-flight disposals", async () => {
  let active = 0;
  let peak = 0;
  const disposed: number[] = [];
  const descriptors = Array.from({ length: 24 }, (_, index) => ({
    kind: "agent",
    checkpointer: defineCheckpointerDb({
      id: `test.checkpointer.${index}`,
      client: () => new MemorySaver(),
      dispose: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        disposed.push(index);
        if (index === 2) throw new Error("dispose failed");
      },
    }),
  }));
  await Promise.all(descriptors.map(({ checkpointer }) => checkpointer.acquire({ env: {} })));

  const failure = await Effect.runPromise(Effect.flip(releaseAgentPersistenceEffect(descriptors)));
  expect(failure).toMatchObject({ _tag: "AgentPersistenceFailure", message: "dispose failed" });
  expect(disposed).toHaveLength(24);
  expect(peak).toBe(8);
});
