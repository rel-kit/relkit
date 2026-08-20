import { expect, test } from "bun:test";
import type { ApplicationGraph } from "@zsys/graph";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateClient } from "./src/index.ts";
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

test("generates stable typed methods from mapped HTTP routes", () => {
  const first = generateClient(graph(false));
  const second = generateClient(graph(true));

  expect(first).toBe(second);
  expect(first).toContain(
    'export type OrdersGetInput = { "authorization": string; "id": string; "sku": string; "tag"?: string };',
  );
  expect(first).toContain("export type OrdersGetSuccess = OrdersGetResponse0;");
  expect(first).toContain("export type OrdersGetError = OrdersGetResponse1 | OrdersGetResponse2;");
  expect(first).toContain('export type OrdersGetStatus = OrdersGetResult["status"];');
  expect(first).toContain("readonly baseUrl?: string;");
  expect(first).toContain("readonly fetch?: typeof globalThis.fetch;");
  expect(first).toContain('appendQuery(query, \"tag\"');
  expect(first).toContain('setHeader(headers, \"authorization\"');
  expect(first).toContain('setBodyValue(payload, [\"sku\"]');
  expect(first).not.toContain("hono");
  expect(first).not.toContain("@zsys/runtime");
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

test("encodes every catch-all segment and omits an absent optional catch-all", async () => {
  const generated = generateClient(catchAllGraph());
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(generated);
  const root = await mkdtemp(join(tmpdir(), "zsys-client-catch-all-"));
  try {
    const file = join(root, "client.mjs");
    await writeFile(file, javascript);
    const module = (await import(pathToFileURL(file).href)) as {
      createClient: (options: Record<string, unknown>) => Record<string, Function>;
    };
    const urls: string[] = [];
    const client = module.createClient({
      baseUrl: "https://example.test",
      fetch: async (url: string) => (urls.push(url), new Response("{}", { status: 200 })),
    });

    await client.filesRead!({ parts: ["a/b", "c d"] });
    await client.docsRead!();
    expect(urls).toEqual(["https://example.test/files/a%2Fb/c%20d", "https://example.test/docs"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  expect(generated).toContain('export type FilesReadInput = { "parts": readonly string[] };');
  expect(generated).toContain('export type DocsReadInput = { "parts"?: readonly string[] };');
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
    contractVersion: 1,
    nodes: [
      functionNode("files.read"),
      functionNode("docs.read"),
      route("files.read", "/files/*parts", false),
      route("docs.read", "/docs/*parts?", true),
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
    contractVersion: 1,
    appId: "commerce",
    nodes: reverse ? nodes.reverse() : nodes,
    edges: [],
  } as unknown as ApplicationGraph;
}
