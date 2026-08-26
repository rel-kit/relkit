import { expect, test } from "bun:test";
import { GRAPH_VERSION } from "@zsys/contracts";
import type { ApplicationGraph } from "@zsys/graph";
import { generateClient, generateClientContractDocument, generateContract } from "./src/index.ts";
import { clientRoutes, responseType } from "./src/generate-types.ts";

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

test("generates a stable oRPC contract and shared client entry", () => {
  const first = generateClient(graph(false));
  const second = generateClient(graph(true));

  expect(first).toBe(second);
  expect(first).toContain('export { createClient, ORPCError } from "@zsys/client";');
  const contract = generateContract(graph(false));
  expect(contract).toBe(generateContract(graph(true)));
  expect(contract).toContain('\"orders.get\": oc.errors({ \"orders.not-found\"');
  expect(contract).toContain(
    'schema<{ \"authorization\": string; \"id\": string; \"sku\": string; \"tag\"?: string }>()',
  );
});

test("keeps REST-only path metadata out of the function-backed procedure input", () => {
  const generated = generateContract(unmappedPathGraph());
  const document = generateClientContractDocument(unmappedPathGraph(), "sha256:test");
  expect(generated).toContain('\"reports.read\": oc.input(schema<{ \"payload\": string }>()');
  expect(document).toContain('\"path\":\"/reports/:reportId\"');
});

test("keeps the envelope status optional when an error has no HTTP mapping", () => {
  const inputGraph = graph(false);
  const target = inputGraph.nodes.find((node) => node.kind === "function") as any;
  const trigger = inputGraph.nodes.find((node) => node.kind === "trigger") as any;
  target.errors.push({
    kind: "error",
    id: "orders.unavailable",
    data: { type: "object", properties: {} },
    retry: "later",
  });
  trigger.config.responses.push({
    kind: "error",
    id: "error.orders.unavailable.500",
    errorId: "orders.unavailable",
    status: 500,
  });

  const route = clientRoutes(inputGraph)[0]!;
  const response = route.responses.find((entry) => entry.errorId === "orders.unavailable")!;
  expect(responseType(route, response)).toContain('"status"?: number');
});

test("preserves catch-all REST metadata in the client-safe document", () => {
  const document = generateClientContractDocument(catchAllGraph(), "sha256:test");
  expect(document).toContain('\"path\":\"/files/*parts\"');
  expect(document).toContain('\"path\":\"/docs/*parts?\"');
});

function catchAllGraph(): ApplicationGraph {
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

function unmappedPathGraph(): ApplicationGraph {
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [
      {
        kind: "function",
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

function graph(reverse: boolean): ApplicationGraph {
  const nodes = [
    {
      kind: "function",
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
