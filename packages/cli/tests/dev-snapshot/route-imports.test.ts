import { describe, expect, it } from "vitest";
import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { snapshotRouteImports } from "../../src/dev-snapshot/snapshot-route-imports.js";

const graph = {
  contractVersion: GRAPH_VERSION,
  nodes: [
    {
      kind: "function",
      id: "hello.greet",
      source: { file: "src/hello.function.ts", line: 1, column: 1 },
      invocationMode: "callable",
      input: {},
      output: {},
    },
    {
      kind: "trigger",
      id: "route.get.hello",
      source: { file: "src/route.ts", line: 1, column: 1 },
      triggerType: "http",
      targetFunctionId: "hello.greet",
      config: { method: "GET", path: "/hello" },
    },
  ],
  edges: [],
} as unknown as ApplicationGraph;

const routes = [{ id: "route.get.hello", targetFunctionId: "hello.greet" }];

describe("snapshotRouteImports", () => {
  it("indexes a deferred route entry and its transitive static chunks", () => {
    const result = snapshotRouteImports(
      {
        outputs: {
          "./index.js": { imports: [{ path: "./shared.js", kind: "import-statement" }] },
          "./hello.function-abc.js": {
            entryPoint: "src/hello.function.ts",
            imports: [{ path: "./shared.js", kind: "import-statement" }],
          },
          "./shared.js": { imports: [{ path: "effect", external: true }] },
        },
      },
      graph,
      routes,
      "/project",
    );

    expect(result).toEqual([
      {
        routeId: "route.get.hello",
        members: ["server/hello.function-abc.js", "server/shared.js"],
      },
    ]);
  });

  it("falls back to the eager server closure when no route chunk exists", () => {
    expect(
      snapshotRouteImports(
        {
          outputs: {
            "./index.js": { imports: [{ path: "./shared.js" }] },
            "./shared.js": { imports: [] },
          },
        },
        graph,
        routes,
        "/project",
      ),
    ).toEqual([{ routeId: "route.get.hello", members: ["server/index.js", "server/shared.js"] }]);
  });

  it("rejects incomplete and escaping output graphs", () => {
    expect(() =>
      snapshotRouteImports(
        { outputs: { "./index.js": { imports: [{ path: "./missing.js" }] } } },
        graph,
        routes,
        "/project",
      ),
    ).toThrow("Missing bundle output");
    expect(() =>
      snapshotRouteImports(
        { outputs: { "../index.js": { imports: [] } } },
        graph,
        routes,
        "/project",
      ),
    ).toThrow("Unsafe bundle output");
  });
});
