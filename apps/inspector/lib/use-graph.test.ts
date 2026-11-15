/** A graph response without data is the hook's not-available state, never a throw in render. */
import { expect, test } from "bun:test";
import type { InspectorGraph } from "./api-types";
import { graphLoaded } from "./use-graph";

const identity = {
  protocol: "relkit.inspector",
  version: 1,
  generationId: "generation-1",
  graphHash: "sha256:abc",
} as const;

test("an identity-only graph probe yields the not-available state", () => {
  expect(() => graphLoaded(identity as unknown as InspectorGraph)).not.toThrow();
  expect(graphLoaded(identity as unknown as InspectorGraph)).toEqual({
    source: undefined,
    graph: undefined,
    loading: false,
    error: true,
  });
});

test("a full graph projection loads", () => {
  const payload = {
    ...identity,
    graph: { nodes: [{ id: "hello.route", kind: "trigger" }], edges: [] },
  } as unknown as InspectorGraph;
  const loaded = graphLoaded(payload);
  expect(loaded.error).toBe(false);
  expect(loaded.source).toBe(payload);
  expect(loaded.graph?.nodes.map((node) => node.id)).toEqual(["hello.route"]);
});
