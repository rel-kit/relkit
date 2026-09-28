import { Effect } from "effect";
import { expect, test } from "vitest";
import {
  graphWorkflow,
  graphWorkflowEffect,
  graphWorkflowRequiresPersistenceEffect,
} from "../src/graph-workflow.js";

test("graph workflow Effects project topology and detect nested persistence needs", () => {
  const empty = Effect.runSync(graphWorkflowEffect([], []));
  expect(empty.nodes).toEqual([]);
  expect(Object.isFrozen(empty)).toBe(true);
  expect(Effect.runSync(graphWorkflowRequiresPersistenceEffect(empty))).toBe(false);
  const nested = { ...empty, nodes: [{
    id: "wait", kind: "node" as const, input: null, output: null, resume: null, ends: [],
  }] };
  const parent = { ...empty, nodes: [{
    id: "nested", kind: "subgraph" as const, input: null, output: null, ends: [], workflow: nested,
  }] };
  expect(Effect.runSync(graphWorkflowRequiresPersistenceEffect(parent))).toBe(true);
  expect(graphWorkflow([], [])).toEqual(empty);
});

test("invalid workflow nodes expose a tagged Effect failure and original adapter error", () => {
  const failure = Effect.runSync(Effect.flip(graphWorkflowEffect([null as never], [])));
  expect(failure).toMatchObject({ _tag: "GraphWorkflowFailure" });
  expect(() => graphWorkflow([null as never], [])).toThrow(TypeError);
});
