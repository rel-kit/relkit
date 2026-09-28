import { Effect } from "effect";
import { expect, test } from "vitest";
import {
  emitAgentEdge,
  emitAgentEdgeEffect,
  type AgentObservedEdge,
} from "../src/observability.js";

test("observed edges use the Effect path and preserve best-effort delivery", async () => {
  const delivered: AgentObservedEdge[] = [];
  const edge = { relationship: "uses-tool", from: "agent", to: "tool" } as const;
  const hooks = {
    onObservedEdge: () => {
      throw new Error("observer unavailable");
    },
    observability: {
      emit: async (event: { edge: AgentObservedEdge }) => {
        delivered.push(event.edge);
      },
    },
  };
  Effect.runSync(emitAgentEdgeEffect(hooks, edge));
  emitAgentEdge(hooks, edge);
  await Promise.resolve();
  expect(delivered).toEqual([edge, edge]);
  expect(Object.isFrozen(delivered[0])).toBe(true);
});
