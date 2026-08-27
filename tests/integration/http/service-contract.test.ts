import { expect, test } from "bun:test";
import {
  defineFunction,
  defineService,
  defineServiceMiddleware,
} from "../../../packages/app/src/index.ts";
import {
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
} from "../../../packages/contracts/src/index.ts";
import {
  invokeFunction,
  createInspectableObservabilityHooks,
} from "../../../packages/engine/src/index.ts";
import {
  createRegistrationPlan,
  type ApplicationGraph,
} from "../../../packages/graph/src/index.ts";
import { generateClient } from "../../../packages/client-generator/src/index.ts";
import { generateOpenApi, type OpenApiDocument } from "../../../packages/openapi/src/index.ts";
import {
  API_REFERENCE_PATH,
  OPENAPI_PATH,
  createApp,
  type RuntimeManifest,
} from "../../../packages/runtime-hono/src/index.ts";
import { z } from "../../../packages/schema/src/index.ts";

const source = { file: "src/routes/orders.ts", line: 1, column: 1 } as const;

test("keeps nested HTTP transport, service policy, docs, and client contracts aligned", async () => {
  const events: string[] = [];
  const middleware = defineServiceMiddleware({
    id: "orders.context",
    handler: async ({ input }, next) => {
      events.push("middleware:before");
      expect(input).toMatchObject({ orderId: "order-1", productId: "product-2" });
      await next({ tenant: "acme" });
      events.push("middleware:after");
    },
  });
  const target = defineFunction({
    id: "orders.get",
    input: z.object({
      orderId: z.string(),
      productId: z.string(),
      note: z.string(),
      tag: z.string(),
    }),
    output: z.object({
      orderId: z.string(),
      productId: z.string(),
      tags: z.array(z.string()),
      tenant: z.string(),
    }),
    handler: (input, context) => {
      events.push("handler");
      expect(input).toEqual({
        orderId: "order-1",
        productId: "product-2",
        note: "gift",
        tag: "red",
      });
      expect(Object.isFrozen(context.service)).toBe(true);
      expect(() =>
        Object.defineProperty(context.service, "tenant", { value: "changed" }),
      ).toThrow();
      return {
        orderId: input.orderId,
        productId: input.productId,
        tags: [input.tag],
        tenant: String(context.service.tenant),
      };
    },
  });
  const service = defineService({
    id: "orders",
    title: "Orders",
    description: "Order operations",
    tags: ["orders"],
    functions: { get: target },
    middleware: [middleware],
  });
  const graph = serviceGraph();
  const plan = createRegistrationPlan(graph, { projectRoot: "/project" });
  const hooks = createInspectableObservabilityHooks();
  const manifest: RuntimeManifest = {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: plan.graphHash,
    functions: {},
    middleware: {},
    requestTransforms: {},
  };
  const app = createApp({
    plan,
    manifest,
    apiDocs: { mode: "test" },
    engine: {
      invoke: (options) =>
        invokeFunction(service.get, options.input, {
          source: "http",
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
          ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
          hooks: { observability: hooks },
        }),
    },
  });

  const response = await app.request(
    "http://localhost/orders/order-1/products/product-2?note=gift&tag=red",
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    orderId: "order-1",
    productId: "product-2",
    tags: ["red"],
    tenant: "acme",
  });
  expect(events).toEqual(["middleware:before", "handler", "middleware:after"]);

  const expected = generateOpenApi(graph);
  const live = await app.request(OPENAPI_PATH);
  expect(live.status).toBe(200);
  expect((await live.json()) as OpenApiDocument).toEqual(expected);
  expect(expected.tags).toEqual([{ name: "orders", description: "Order operations" }]);
  expect(expected.paths["/orders/{orderId}/products/{productId}"]?.get).toMatchObject({
    tags: ["orders"],
    parameters: [
      { in: "path", name: "orderId", required: true },
      { in: "path", name: "productId", required: true },
      { in: "query", name: "note", required: true },
      { in: "query", name: "tag", required: true },
    ],
  });
  expect(generateClient(graph)).toContain(
    'export { createClient, ORPCError } from "@relkit/client";',
  );
  expect((await app.request(API_REFERENCE_PATH)).status).toBe(200);
  expect(hooks.read().some((event) => event.type === "invocation.started")).toBe(true);
});

function serviceGraph(): ApplicationGraph {
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [
      {
        kind: "service",
        id: "orders",
        source,
        title: "Orders",
        description: "Order operations",
        tags: ["orders"],
        members: [{ name: "get", functionId: "orders.get" }],
        middleware: [],
      },
      {
        kind: "function",
        id: "orders.get",
        source,
        input: {
          type: "object",
          required: ["orderId", "productId", "note", "tag"],
          properties: {
            orderId: { type: "string" },
            productId: { type: "string" },
            note: { type: "string" },
            tag: { type: "string" },
          },
        },
        output: {
          type: "object",
          required: ["orderId", "productId", "tags", "tenant"],
          properties: {
            orderId: { type: "string" },
            productId: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            tenant: { type: "string" },
          },
        },
      },
      {
        kind: "trigger",
        id: "orders.get.route",
        source,
        triggerType: "http",
        targetFunctionId: "orders.get",
        config: {
          method: "GET",
          path: "/orders/:orderId/products/:productId",
          request: {
            kind: "input",
            fields: {
              orderId: { kind: "path", name: "orderId" },
              productId: { kind: "path", name: "productId" },
              note: { kind: "query", name: "note" },
              tag: { kind: "query", name: "tag" },
            },
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
