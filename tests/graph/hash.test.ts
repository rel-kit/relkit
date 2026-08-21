import { describe, expect, test } from "bun:test";
import {
  canonicalGraphJson,
  hashGraph,
  type GraphCanonicalizationOptions,
} from "../../packages/graph/src/index.ts";

type TestGraph = {
  readonly contractVersion: number;
  readonly appId: string;
  readonly nodes: readonly Record<string, unknown>[];
  readonly edges: readonly Record<string, unknown>[];
  readonly generationId: string;
  readonly timestamp: string;
  readonly pid: number;
  readonly randomId: string;
};

function makeGraph(root: string, reverse: boolean): TestGraph {
  const windows = root.includes(":\\");
  const file = (name: string) => (windows ? `${root}\\src\\${name}` : `${root}/src/${name}`);
  const functionNode = {
    kind: "function",
    id: "orders.get",
    source: { file: file("functions.ts"), line: 8, column: 1 },
    output: { ok: true, timeoutMs: 10 },
    generationId: reverse ? "generation-b" : "generation-a",
  };
  const appNode = {
    kind: "app",
    id: "orders",
    source: { file: file("app.ts"), line: 1, column: 1 },
    config: { timezone: "UTC" },
    metadata: { timestamp: reverse ? "later" : "earlier" },
  };
  const nodes = reverse ? [functionNode, appNode] : [appNode, functionNode];
  const edges = reverse
    ? [{ to: "orders.get", from: "orders.route", kind: "targets-function", role: "primary" }]
    : [{ role: "primary", kind: "targets-function", from: "orders.route", to: "orders.get" }];
  return {
    contractVersion: 2,
    appId: "orders",
    nodes,
    edges,
    generationId: reverse ? "generation-b" : "generation-a",
    timestamp: reverse ? "later" : "earlier",
    pid: reverse ? 2 : 1,
    randomId: reverse ? "random-b" : "random-a",
  };
}

describe("canonical graph hashing", () => {
  test("normalizes roots/separators, sorts nodes/edges, and excludes ephemeral metadata", () => {
    const first = makeGraph("/tmp/zsys-a", false);
    const second = makeGraph("C:\\zsys-b", true);
    const firstOptions: GraphCanonicalizationOptions = { projectRoot: "/tmp/zsys-a" };
    const secondOptions: GraphCanonicalizationOptions = { projectRoot: "C:\\zsys-b" };
    const firstJson = canonicalGraphJson(first, firstOptions);
    const secondJson = canonicalGraphJson(second, secondOptions);

    expect(secondJson).toBe(firstJson);
    expect(hashGraph(second, secondOptions)).toBe(hashGraph(first, firstOptions));
    expect(hashGraph(first, firstOptions)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(firstJson).toContain('"file":"src/app.ts"');
    expect(firstJson).toContain('"timeoutMs":10');
    expect(firstJson).toContain('"timezone":"UTC"');
    expect(firstJson).not.toMatch(/"(?:generationId|timestamp|pid|randomId)"/);
    expect(firstJson).not.toContain("/tmp/zsys-a");
  });

  test("keeps ordered service edges in declaration order", () => {
    const graph = {
      contractVersion: 2,
      nodes: [
        {
          kind: "service",
          id: "orders",
          source: { file: "src/orders.ts", line: 1, column: 1 },
          members: [
            { name: "get", functionId: "orders.get" },
            { name: "save", functionId: "orders.save" },
          ],
          middleware: [],
        },
      ],
      edges: [
        { kind: "contains-function", from: "orders", to: "orders.save", member: "save", order: 1 },
        { kind: "contains-function", from: "orders", to: "orders.get", member: "get", order: 0 },
      ],
    };
    const canonical = JSON.parse(canonicalGraphJson(graph)) as { edges: { order: number }[] };
    expect(canonical.edges.map(({ order }) => order)).toEqual([0, 1]);
  });
});
