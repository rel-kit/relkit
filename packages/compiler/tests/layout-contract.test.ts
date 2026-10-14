/**
 * Checks the source-move comparison against policy and schema changes. These pure
 * fixtures deliberately include path/source-named user fields; only node source
 * coordinates may disappear, and kind-qualified identities must stay distinct.
 */
import { describe, expect, it } from "vitest";
import type { ApplicationGraph } from "@relkit/graph";
import { GRAPH_VERSION } from "@relkit/contracts";
import { layoutContract } from "../src/layout-contract.js";

/**
 * Builds an isolated graph with a nested source-looking schema property.
 * @param file - Physical source filename; no I/O is performed.
 * @param client - Realtime exposure whose change must remain observable.
 * @returns A complete graph with a stable service and channel contract.
 */
function graph(file: string, client: "public" | "protected" = "public"): ApplicationGraph {
  const source = { file, line: 1, column: 1 };
  return {
    contractVersion: GRAPH_VERSION,
    appId: "app",
    nodes: [
      { kind: "service", id: "orders", source, functions: [], events: [] },
      {
        kind: "channel",
        id: "orders.updates",
        source,
        client,
        profile: "local",
        params: { type: "object", properties: { source: { type: "string" } } },
        events: { updated: { path: "business-path", source: "business-source" } },
      },
    ],
    edges: [],
  };
}

it("allows source coordinates to move and leaves the original graph intact", () => {
  const flat = graph("src/orders/service.ts");
  const grouped = graph("src/services/orders/service.ts");
  expect(layoutContract(flat)).toEqual(layoutContract(grouped));
  expect(flat.nodes[0]?.source.file).toBe("src/orders/service.ts");
  expect(layoutContract(flat).appId).toBe(flat.appId);
});

it("detects exposure, identity, provider and nested schema changes", () => {
  const baseline = layoutContract(graph("src/orders/service.ts"));
  expect(layoutContract(graph("src/orders/service.ts", "protected"))).not.toEqual(baseline);
  const original = graph("src/orders/service.ts");
  const changed: ApplicationGraph = {
    ...original,
    nodes: original.nodes.map((node) =>
      node.kind === "channel"
        ? { ...node, profile: "remote", params: { source: "changed" } }
        : { ...node, id: "changed" },
    ),
  };
  expect(layoutContract(changed)).not.toEqual(baseline);
  expect(baseline.nodes).toContainEqual(
    expect.objectContaining({
      events: { updated: { path: "business-path", source: "business-source" } },
    }),
  );
});

it("retains ownership/deployment data and every dependency edge", () => {
  const original = graph("src/orders/service.ts");
  const changed: ApplicationGraph = {
    ...original,
    nodes: [
      ...original.nodes,
      {
        kind: "app",
        id: "app",
        source: { file: "relkit.config.ts", line: 1, column: 1 },
        deploymentRoles: [
          {
            role: "host",
            integrationId: "aws",
            protocolVersion: 1,
            configuration: { name: "application", path: "keep-this" },
          },
        ],
      },
    ],
    edges: [{ kind: "depends-on-service", from: "orders", to: "receipts" }],
  };
  const projection = layoutContract(changed);
  expect(projection.nodes).toContainEqual(
    expect.objectContaining({
      deploymentRoles: [
        {
          role: "host",
          integrationId: "aws",
          protocolVersion: 1,
          configuration: { name: "application", path: "keep-this" },
        },
      ],
    }),
  );
  expect(projection.edges).toEqual(changed.edges);
  expect(projection).not.toEqual(layoutContract(original));
});
