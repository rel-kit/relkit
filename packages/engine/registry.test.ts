import { describe, expect, test } from "bun:test";
import {
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "@relkit/contracts";
import { hashGraph, type ApplicationGraph } from "@relkit/graph";
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
      {
        kind: "function",
        invocationMode: "callable",
        id: "orders.get",
        source,
        input: null,
        output: null,
      },
      {
        kind: "function",
        invocationMode: "callable",
        id: "orders.create",
        source,
        input: null,
        output: null,
      },
    ],
    edges: [],
  };
}

function manifest(currentGraph = graph()): RuntimeManifestInput {
  const graphHash = hashGraph(currentGraph);
  return {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash,
    activationFingerprint: {
      graphHash,
      manifestHash: "sha256:manifest",
      runtimeIntegrationsPlanHash: "sha256:runtime-integrations",
    },
    runtimeIntegrationsPlan: {
      version: RUNTIME_INTEGRATION_PLAN_VERSION,
      fileName: RUNTIME_INTEGRATION_PLAN_FILE,
      graphHash,
    },
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
      expect.objectContaining({ message: expect.stringContaining("Rebuild with `relkit build`") }),
    );
    expect(() =>
      createFunctionRegistry(graph(), {
        ...manifest(),
        contractVersion: MANIFEST_VERSION - 1,
      } as unknown as RuntimeManifestInput),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("RELKIT_MANIFEST_VERSION_UNSUPPORTED"),
      }),
    );
    const unboundGraph = {
      ...graph(),
      nodes: [
        { ...graph().nodes[0]!, errors: [{ id: "unbound.orders-not-found" }] },
        graph().nodes[1]!,
      ],
    } as ApplicationGraph;
    expect(() => createFunctionRegistry(unboundGraph, manifest())).toThrow("RELKIT_GRAPH_INVALID");
    expect(() =>
      createFunctionRegistry(graph(), { ...manifest(), graphHash: "sha256:wrong" }),
    ).toThrow("RELKIT_GRAPH_MANIFEST_MISMATCH");
    expect(() => createFunctionRegistry(graph(), { ...manifest(), generatorVersion: 99 })).toThrow(
      "RELKIT_MANIFEST_GENERATOR_UNSUPPORTED",
    );
    expect(() =>
      createFunctionRegistry(graph(), {
        ...manifest(),
        runtimeIntegrationsPlan: { ...manifest().runtimeIntegrationsPlan, graphHash: "sha256:old" },
      }),
    ).toThrow("RELKIT_RUNTIME_INTEGRATION_PLAN_REFERENCE_INVALID");
    expect(() =>
      createFunctionRegistry(graph(), {
        ...manifest(),
        activationFingerprint: { ...manifest().activationFingerprint, graphHash: "sha256:old" },
      }),
    ).toThrow("RELKIT_RUNTIME_ACTIVATION_FINGERPRINT_INVALID");
  });

  test("rejects missing, extra, duplicate, and invalid handlers", () => {
    expect(() =>
      createFunctionRegistry(graph(), { ...manifest(), functions: { "orders.get": get } }),
    ).toThrow("RELKIT_MANIFEST_HANDLER_MISSING");
    expect(() =>
      createFunctionRegistry(graph(), {
        ...manifest(),
        functions: { "orders.create": create, "orders.get": get, "orders.other": get },
      }),
    ).toThrow("RELKIT_MANIFEST_HANDLER_EXTRA");
    expect(() =>
      createFunctionRegistry(graph(), {
        ...manifest(),
        functions: [
          ["orders.create", create],
          ["orders.create", create],
          ["orders.get", get],
        ],
      }),
    ).toThrow("RELKIT_MANIFEST_HANDLER_DUPLICATE");
    expect(() =>
      createFunctionRegistry(graph(), {
        ...manifest(),
        functions: { "orders.create": "not-a-handler" } as never,
      }),
    ).toThrow("RELKIT_MANIFEST_HANDLER_INVALID");
  });
});
