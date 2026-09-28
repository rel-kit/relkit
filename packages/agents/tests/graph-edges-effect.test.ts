import { END, START } from "@langchain/langgraph";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  assertGraphDestinationEffect,
  createGraphEdgeBuilderEffect,
  validateGraphRouteEffect,
} from "../src/graph-edges.js";

test("graph edge Effects build ordered edges and validate routes", () => {
  const ids = new Set(["step"]);
  const { builder, operations } = Effect.runSync(createGraphEdgeBuilderEffect(ids));
  builder.addEdge(START, "step").addEdge("step", END);
  expect(operations).toEqual([
    { kind: "edge", start: START, end: "step" },
    { kind: "edge", start: "step", end: END },
  ]);
  expect(Effect.runSync(assertGraphDestinationEffect("step", ids))).toBeUndefined();
  expect(Effect.runSync(validateGraphRouteEffect("yes", ids, { yes: "step" }))).toBeUndefined();
});

test("graph edge Effects tag invalid destinations", () => {
  const result = Effect.runSync(
    Effect.result(validateGraphRouteEffect("missing", new Set(["step"]))),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("GraphDefinitionFailure");
});
