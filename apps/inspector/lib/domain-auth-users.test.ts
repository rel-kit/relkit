/**
 * The auth domain lists the services whose functions declare access rules: the compiler emits a
 * `depends-on-service` edge from each such service to the authentication service.
 */
import { expect, test } from "bun:test";
import { normalizeGraphResponse } from "./graph-model";
import { domainContents } from "../app/domains/domain-tree";
import type { InspectorGraph } from "./api-types";

test("the auth domain is used by the services that protect their functions", () => {
  const graph = normalizeGraphResponse({
    protocol: "relkit.inspector",
    version: 1,
    generationId: "generation-one",
    graphHash: "sha256:fixture",
    graph: {
      appId: "logistics",
      nodes: [
        { kind: "service", id: "auth", capability: { kind: "better-auth" } },
        { kind: "service", id: "shipments" },
        { kind: "service", id: "fleet" },
        { kind: "function", id: "shipments.create", access: { roles: ["dispatcher"] } },
        { kind: "function", id: "fleet.list" },
      ],
      edges: [
        { kind: "depends-on-service", from: "shipments", to: "auth" },
        {
          kind: "exposes-function",
          from: "shipments",
          to: "shipments.create",
          member: "create",
          order: 0,
        },
        { kind: "exposes-function", from: "fleet", to: "fleet.list", member: "list", order: 0 },
      ],
      observedEdges: [],
    },
  } as InspectorGraph);
  const auth = domainContents(graph).find((domain) => domain.id === "auth");
  expect(auth?.usedBy).toEqual(["shipments"]);
});
