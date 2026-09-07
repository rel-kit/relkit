import { expect, test } from "bun:test";
import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { generateOpenApi, generateOpenApiJson } from "./src/index.ts";

function graph(path = "/users/:id/details", method = "GET", rawHandler = true): ApplicationGraph {
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [
      {
        kind: "trigger",
        id: "raw.details",
        triggerType: "http",
        targetFunctionId: "raw.details",
        source: { file: "src/routes/users/[id]/details/route.ts", line: 3, column: 1 },
        config: {
          method,
          path,
          rawHandler,
          title: "User details",
          description: "Direct HTTP response.",
          tags: ["users"],
          request: null,
          responses: [],
          middleware: [],
          transforms: [],
        },
      },
    ],
    edges: [],
  };
}

test.each(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])(
  "documents raw %s handlers without inventing a function or response schema",
  (method) => {
    const document = generateOpenApi(graph(undefined, method));
    expect(document.paths["/users/{id}/details"]?.[method.toLowerCase()]).toEqual({
      operationId: "raw.details",
      summary: "User details",
      description: "Direct HTTP response.",
      tags: ["users"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { default: { description: "Response returned by the route handler" } },
      "x-relkit": { routeId: "raw.details", middleware: [], transforms: [] },
    });
    expect(generateOpenApiJson(graph(undefined, method))).toBe(
      generateOpenApiJson(graph(undefined, method)),
    );
  },
);

test("supports static, root, catch-all and optional catch-all raw paths", () => {
  for (const path of ["/", "/health"]) {
    expect(generateOpenApi(graph(path)).paths[path]?.get?.parameters).toBeUndefined();
  }
  expect(generateOpenApi(graph("/files/*parts")).paths["/files/{parts}"]?.get?.parameters).toEqual([
    { name: "parts", in: "path", required: true, schema: { type: "string" } },
  ]);
  const optional = generateOpenApi(graph("/files/*parts?"));
  expect(optional.paths["/files"]?.get?.parameters).toBeUndefined();
  expect(optional.paths["/files/{parts}"]?.get?.operationId).toBe("raw.details.catch-all");
});

test("preserves missing-function and method-collision validation and excludes auth ALL", () => {
  expect(() => generateOpenApi(graph(undefined, "GET", false))).toThrow("targets missing function");
  const input = graph();
  expect(() => generateOpenApi({ ...input, nodes: [...input.nodes, ...input.nodes] })).toThrow(
    "Duplicate OpenAPI route",
  );
  expect(generateOpenApi(graph("/api/auth/*auth?", "ALL")).paths).toEqual({});
});
