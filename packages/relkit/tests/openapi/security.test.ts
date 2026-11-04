/** Route authentication and function access rules appear in OpenAPI security metadata. */
import { expect, test } from "vitest";
import type { ApplicationGraph } from "../../src/graph/index.js";
import { generateOpenApi } from "../../src/openapi/index.js";
import { graph } from "./generate-fixture.js";

/** The fixture graph with its route protected and its function given an access rule. */
function protectedGraph(options: { readonly auth: boolean; readonly access: boolean }) {
  const source = graph(false);
  return {
    ...source,
    nodes: source.nodes.map((node) =>
      node.kind === "function" && options.access
        ? { ...node, access: { roles: ["admin"], permissions: ["orders:read"], predicate: true } }
        : node.kind === "trigger" && options.auth
          ? { ...node, config: { ...node.config, auth: { kind: "required" } } }
          : node,
    ),
  } as ApplicationGraph;
}

test("a route with auth required and an access rule declares the session requirement", () => {
  const document = generateOpenApi(protectedGraph({ auth: true, access: true }));
  const operation = document.paths["/orders/{id}"]?.get;
  expect({
    security: operation?.security,
    unauthorized: operation?.responses["401"],
    forbidden: operation?.responses["403"]?.description,
    relkit: { auth: operation?.["x-relkit"].auth, access: operation?.["x-relkit"].access },
    components: document.components,
  }).toMatchSnapshot();
});

test("an access rule alone also requires the session", () => {
  const operation = generateOpenApi(protectedGraph({ auth: false, access: true })).paths[
    "/orders/{id}"
  ]?.get;
  expect(operation?.security).toEqual([{ session: [] }]);
  expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(["401", "403"]));
});

test("a public route declares no security", () => {
  const document = generateOpenApi(protectedGraph({ auth: false, access: false }));
  const operation = document.paths["/orders/{id}"]?.get;
  expect(operation).not.toHaveProperty("security");
  expect(operation?.responses).not.toHaveProperty("401");
  expect(document).not.toHaveProperty("components");
});
