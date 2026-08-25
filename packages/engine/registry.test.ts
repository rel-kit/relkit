import { describe, expect, test } from "bun:test";
import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import { hashGraph, type ApplicationGraph } from "@zsys/graph";
import {
  createFunctionRegistry,
  type FunctionHandler,
  type RuntimeManifestInput,
} from "./src/registry.ts";

const source = { file: "src/functions.ts", line: 1, column: 1 } as const;
const create = (() => ({ ok: true })) as FunctionHandler;
const get = (() => ({ value: 1 })) as FunctionHandler;

function graph(): ApplicationGraph {
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [
      { kind: "function", id: "orders.get", source, input: null, output: null },
      { kind: "function", id: "orders.create", source, input: null, output: null },
    ],
    edges: [],
  };
}

function manifest(currentGraph = graph()): RuntimeManifestInput {
  return {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: hashGraph(currentGraph),
    functions: { "orders.get": get, "orders.create": create },
  };
}

describe("function registry", () => {
  test("verifies the pair and exposes sorted immutable lookup", () => {
    const registry = createFunctionRegistry(graph(), manifest());

    expect([...registry.keys()]).toEqual(["orders.create", "orders.get"]);
    expect(registry.get("orders.create")).toBe(create);
    expect(registry.handlers).toEqual({ "orders.create": create, "orders.get": get });
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.handlers)).toBe(true);
    expect(() => ((registry as { handlers: unknown }).handlers = {})).toThrow();
  });

  test("rejects stale versions and graph-hash mismatches before registration", () => {
    const staleGraph = {
      ...graph(),
      contractVersion: GRAPH_VERSION - 1,
    } as unknown as ApplicationGraph;
    expect(() => createFunctionRegistry(staleGraph, manifest(staleGraph))).toThrow(
      "ZSYS_GRAPH_VERSION_UNSUPPORTED",
    );
    expect(() =>
      createFunctionRegistry(graph(), {
        ...manifest(),
        contractVersion: MANIFEST_VERSION - 1,
      } as unknown as RuntimeManifestInput),
    ).toThrow("ZSYS_MANIFEST_VERSION_UNSUPPORTED");
    const unboundGraph = {
      ...graph(),
      nodes: [
        { ...graph().nodes[0]!, errors: [{ id: "unbound.orders-not-found" }] },
        graph().nodes[1]!,
      ],
    } as ApplicationGraph;
    expect(() => createFunctionRegistry(unboundGraph, manifest())).toThrow("ZSYS_GRAPH_INVALID");
    expect(() =>
      createFunctionRegistry(graph(), { ...manifest(), graphHash: "sha256:wrong" }),
    ).toThrow("ZSYS_GRAPH_MANIFEST_MISMATCH");
    expect(() => createFunctionRegistry(graph(), { ...manifest(), generatorVersion: 99 })).toThrow(
      "ZSYS_MANIFEST_GENERATOR_UNSUPPORTED",
    );
  });

  test("rejects missing, extra, duplicate, and invalid handlers", () => {
    expect(() =>
      createFunctionRegistry(graph(), { ...manifest(), functions: { "orders.get": get } }),
    ).toThrow("ZSYS_MANIFEST_HANDLER_MISSING");
    expect(() =>
      createFunctionRegistry(graph(), {
        ...manifest(),
        functions: { "orders.create": create, "orders.get": get, "orders.other": get },
      }),
    ).toThrow("ZSYS_MANIFEST_HANDLER_EXTRA");
    expect(() =>
      createFunctionRegistry(graph(), {
        ...manifest(),
        functions: [
          ["orders.create", create],
          ["orders.create", create],
          ["orders.get", get],
        ],
      }),
    ).toThrow("ZSYS_MANIFEST_HANDLER_DUPLICATE");
    expect(() =>
      createFunctionRegistry(graph(), {
        ...manifest(),
        functions: { "orders.create": "not-a-handler" } as never,
      }),
    ).toThrow("ZSYS_MANIFEST_HANDLER_INVALID");
  });
});
