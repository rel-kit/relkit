import { describe, expect, test } from "vitest";
import { GRAPH_VERSION } from "@relkit/contracts";
import {
  diffGraph,
  type ApplicationGraph,
  type FunctionNode,
  type TriggerNode,
} from "../src/index.js";
const source = { file: "src/functions.ts", line: 1, column: 1 } as const;
function baseGraph(): ApplicationGraph {
  return {
    contractVersion: GRAPH_VERSION,
    appId: "orders",
    nodes: [
      {
        kind: "function",
        invocationMode: "callable",
        id: "orders.create",
        source,
        input: { type: "object", required: ["id"] },
        output: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      },
      {
        kind: "trigger",
        id: "orders.listener",
        source,
        triggerType: "event",
        targetFunctionId: "orders.create",
        config: {
          eventId: "orders.created",
          eventVersion: 1,
          delivery: "durable",
        },
      },
    ],
    edges: [],
  };
}
describe("graph compatibility diff", () => {
  test("reports source moves as informational and output removal as breaking", () => {
    const before = baseGraph();
    const previousFunction = before.nodes[0] as FunctionNode;
    const moved = { ...before.nodes[0]!, source: { ...source, file: "src/orders.ts" } };
    const after: ApplicationGraph = {
      ...before,
      nodes: [moved, { ...before.nodes[1]!, source: { ...source, file: "src/orders.ts" } }],
    };
    const movedDiff = diffGraph(before, after);
    expect(movedDiff.changes.every((change) => change.classification === "informational")).toBe(
      true,
    );
    expect(movedDiff.hasBreakingChanges).toBe(false);
    expect(movedDiff.changes.map(({ change }) => change)).toEqual(["source-moved", "source-moved"]);
    const breaking: ApplicationGraph = {
      ...before,
      nodes: [
        {
          ...previousFunction,
          output: { type: "object", properties: {}, required: [] },
        },
        before.nodes[1]!,
      ],
    };
    const result = diffGraph(before, breaking);
    expect(result.changes).toContainEqual(
      expect.objectContaining({
        id: "orders.create",
        category: "function/error",
        classification: "breaking",
      }),
    );
  });
  test("classifies exact event contract changes as breaking", () => {
    const before = baseGraph();
    const listener = before.nodes[1] as TriggerNode;
    const after: ApplicationGraph = {
      ...before,
      nodes: [
        before.nodes[0]!,
        {
          ...listener,
          config: {
            ...(listener.config as Record<string, unknown>),
            eventId: "orders.updated",
          },
        },
      ],
    };
    const result = diffGraph(before, after);
    expect(result.changes).toContainEqual(
      expect.objectContaining({
        category: "event",
        fields: ["config"],
        classification: "breaking",
      }),
    );
  });
  test("uses compatible additions and breaking removals", () => {
    const before = baseGraph();
    const addition = {
      kind: "event" as const,
      id: "orders.updated",
      source,
      version: 1,
      input: { type: "object" },
      profile: "default",
    };
    const added = diffGraph(before, { ...before, nodes: [...before.nodes, addition] });
    expect(added.changes).toContainEqual(
      expect.objectContaining({ id: "orders.updated", classification: "compatible" }),
    );
    const removed = diffGraph({ ...before, nodes: [...before.nodes, addition] }, before);
    expect(removed.changes).toContainEqual(
      expect.objectContaining({ id: "orders.updated", classification: "breaking" }),
    );
  });
  test("classifies service membership and policy changes", () => {
    const service = {
      kind: "service" as const,
      id: "orders",
      source,
      title: "Orders",
      functions: [{ name: "create", functionId: "orders.create" }],
      events: [],
    };
    const before: ApplicationGraph = {
      contractVersion: GRAPH_VERSION,
      nodes: [service],
      edges: [],
    };
    const metadata = diffGraph(before, {
      ...before,
      nodes: [{ ...service, title: "Order service" }],
    });
    expect(metadata.changes[0]).toMatchObject({
      category: "service",
      classification: "compatible",
    });
    const membership = diffGraph(before, {
      ...before,
      nodes: [
        {
          ...service,
          functions: [...service.functions, { name: "save", functionId: "orders.save" }],
        },
      ],
    });
    expect(membership.changes[0]).toMatchObject({
      category: "service",
      classification: "breaking",
    });
  });
});
