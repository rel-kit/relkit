/** Checks one domain declaration across real HTTP invocation, OpenAPI and generated client contracts.
 * Explicit Scalar selection preserves the expected reference endpoint without adding it to core runtime imports.
 */
import { expect, test } from "bun:test";
import { defineFunction, defineService } from "../../../packages/app/src/index.ts";
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
import { runtimeCohort } from "../runtime-cohort.ts";
import { scalarReference } from "../../../packages/runtime-hono/src/scalar.ts";

import { serviceGraph } from "./service-contract-graph.ts";

test("keeps nested HTTP transport, domain attribution, docs, and client contracts aligned", async () => {
  const events: string[] = [];
  const service = orderService(events);
  const graph = serviceGraph;
  const plan = createRegistrationPlan(graph, { projectRoot: "/project" });
  const hooks = createInspectableObservabilityHooks();
  const manifest: RuntimeManifest = {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    middleware: {},
    requestTransforms: {},
  };
  const app = createApp({
    plan,
    manifest,
    apiDocs: { mode: "test", ui: "scalar", reference: scalarReference },
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
  expect(events).toEqual(["handler"]);

  await assertDocuments(app, graph);
  expect(hooks.read().some((event) => event.type === "invocation.started")).toBe(true);
});

/** Constructs the actual domain function and preserves its input assertions. */
function orderService(events: string[]) {
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
    handler: (input) => {
      events.push("handler");
      expect(input).toEqual({
        orderId: "order-1",
        productId: "product-2",
        note: "gift",
        tag: "red",
      });
      return {
        orderId: input.orderId,
        productId: input.productId,
        tags: [input.tag],
        tenant: "acme",
      };
    },
  });
  const service = defineService({
    id: "orders",
    title: "Orders",
    description: "Order operations",
    tags: ["orders"],
    functions: { get: target },
  });
  expect(service.get).toBe(target);
  return service;
}

/** Compares runtime documents and clients against the same declared graph. */
async function assertDocuments(app: ReturnType<typeof createApp>, graph: ApplicationGraph) {
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
}
