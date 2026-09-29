import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";

const stringSchema = { type: "string" };
const input = {
  type: "object",
  required: ["id", "sku", "authorization"],
  properties: {
    id: stringSchema,
    sku: stringSchema,
    authorization: stringSchema,
    tag: stringSchema,
  },
};

export function catchAllGraph(): ApplicationGraph {
  const functionNode = (id: string) => ({
    kind: "function" as const,
    id,
    source: { file: "src/functions/read.ts", line: 1, column: 1 },
    input: {
      type: "object",
      required: ["parts"],
      properties: { parts: { type: "array", items: { type: "string" } } },
    },
    output: { type: "object" },
  });
  const route = (id: string, path: string, optional: boolean) => ({
    kind: "trigger" as const,
    id,
    triggerType: "http" as const,
    targetFunctionId: id,
    source: { file: "src/routes/route.ts", line: 1, column: 1 },
    config: {
      method: "GET",
      path,
      request: {
        kind: "input",
        fields: {
          parts: optional
            ? { kind: "optional", value: { kind: "path-segments", name: "parts" } }
            : { kind: "path-segments", name: "parts" },
        },
      },
      responses: [{ kind: "success", id: "success.200", status: 200 }],
      middleware: [],
      transforms: [],
    },
  });
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [
      functionNode("files.read"),
      functionNode("docs.read"),
      route("files.read", "/files/*parts", false),
      route("docs.read", "/docs/*parts?", true),
    ],
    edges: [],
  };
}

export function unmappedPathGraph(): ApplicationGraph {
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [
      {
        kind: "function",
        invocationMode: "callable",
        id: "reports.read",
        source: { file: "src/functions/read.ts", line: 1, column: 1 },
        input: {
          type: "object",
          required: ["payload"],
          properties: { payload: { type: "string" } },
        },
        output: { type: "object" },
      },
      {
        kind: "trigger",
        id: "reports.read",
        triggerType: "http",
        targetFunctionId: "reports.read",
        source: { file: "src/routes/read.ts", line: 1, column: 1 },
        config: {
          method: "POST",
          path: "/reports/:reportId",
          request: {
            kind: "input",
            fields: { payload: { kind: "body", name: "payload" } },
          },
          responses: [{ kind: "success", id: "success.200", status: 200 }],
          middleware: [],
          transforms: [],
        },
      },
    ],
    edges: [],
  };
}

export function graph(reverse: boolean): ApplicationGraph {
  const nodes = [
    {
      kind: "function",
      invocationMode: "callable",
      id: "orders.get",
      source: { file: "src/functions/get.ts", line: 1, column: 1 },
      input,
      output: {
        type: "object",
        required: ["totalCents"],
        properties: { totalCents: { type: "number" } },
      },
      errors: [
        {
          kind: "error",
          id: "orders.not-found",
          data: { type: "object", properties: { id: stringSchema } },
          http: { status: 404 },
          retry: "never",
        },
      ],
    },
    {
      kind: "trigger",
      id: "orders.get",
      triggerType: "http",
      targetFunctionId: "orders.get",
      source: { file: "src/routes/get.ts", line: 1, column: 1 },
      config: {
        method: "GET",
        path: "/orders/:id",
        request: {
          kind: "input",
          fields: {
            id: { kind: "path", name: "id" },
            sku: { kind: "body", name: "sku" },
            authorization: { kind: "header", name: "authorization" },
            tag: { kind: "optional", value: { kind: "query", name: "tag" } },
          },
        },
        responses: [
          { kind: "success", id: "success.200", status: 200, schema: null },
          {
            kind: "error",
            id: "error.orders.not-found.404",
            errorId: "orders.not-found",
            status: 404,
            schema: null,
          },
          { kind: "validation-error", id: "validation.422", status: 422, schema: null },
        ],
        middleware: [],
        transforms: [],
      },
    },
  ];
  return {
    contractVersion: GRAPH_VERSION,
    appId: "commerce",
    nodes: reverse ? nodes.reverse() : nodes,
    edges: [],
  } as unknown as ApplicationGraph;
}
