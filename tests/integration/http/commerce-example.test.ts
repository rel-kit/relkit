import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "../../../packages/contracts/src/index.ts";
import {
  invokeFunction,
  type InvocationTarget,
} from "../../../packages/runtime-hono/node_modules/@zsys/engine/dist/index.js";
import { generateClient } from "../../../packages/client-generator/src/index.ts";
import { compileProject } from "../../compiler/fixture-runner.ts";
import {
  createRegistrationPlan,
  type ApplicationGraph,
  type RegistrationPlan,
} from "../../../packages/graph/src/index.ts";
import { generateOpenApiJson } from "../../../packages/openapi/src/index.ts";
import {
  API_REFERENCE_PATH,
  createApp,
  OPENAPI_PATH,
  type HttpInvocationOptions,
  type RateLimitCounter,
  type RuntimeManifest,
} from "../../../packages/runtime-hono/src/index.ts";
import { createTestHttpClient } from "../../../packages/testing/src/index.ts";
import normalizeOrderId from "../../../examples/commerce/src/transforms/orders/normalize-id.transform.ts";
import orderAuth from "../../../examples/commerce/src/middleware/order-auth.middleware.ts";
import browsePath from "../../../examples/commerce/src/functions/browse-path.function.ts";
import deleteOrder from "../../../examples/commerce/src/functions/orders/delete-order.function.ts";
import getOrder from "../../../examples/commerce/src/functions/orders/get-order.function.ts";
import searchOrders from "../../../examples/commerce/src/functions/orders/search-orders.function.ts";
import updateOrder from "../../../examples/commerce/src/functions/orders/update-order.function.ts";
import uploadAssets from "../../../examples/commerce/src/functions/upload-assets.function.ts";

const APP_ROOT = resolve(import.meta.dir, "../../../examples/commerce");
const targets: Readonly<Record<string, InvocationTarget<any, any>>> = {
  "browse-path": browsePath,
  "orders.delete-order": deleteOrder,
  "orders.get-order": getOrder,
  "orders.search-orders": searchOrders,
  "orders.update-order": updateOrder,
  "upload-assets": uploadAssets,
};

test("serves the compiled commerce routes through one HTTP engine path", async () => {
  const compiled = await compileProject("commerce-example", APP_ROOT);
  const graph = JSON.parse(compiled.graphBytes) as ApplicationGraph;
  const plan = createRegistrationPlan(graph, { projectRoot: "/fixture" });
  const invocations: HttpInvocationOptions[] = [];
  const rateLimitCounter = memoryCounter();
  const app = createApp({
    plan,
    manifest: manifestFor(plan),
    apiDocs: { document: JSON.parse(compiled.normalization.outputs.openapi) },
    rateLimitRuntime: { resolveStore: () => rateLimitCounter },
    engine: {
      invoke: async (invocation) => {
        invocations.push(invocation);
        const target = targets[invocation.functionId];
        if (target !== undefined) return invokeFunction(target, invocation.input);
        if (invocation.functionId === "orders.create-order")
          return createOrderResult(invocation.input);
        throw new Error(`Unexpected function ${invocation.functionId}`);
      },
    },
  });
  const client = createTestHttpClient(app);

  try {
    const created = await client.post("/orders", {
      headers: {
        "content-type": "application/json",
        "idempotency-key": "order-1",
        "x-customer-email": "customer@example.com",
      },
      body: JSON.stringify({ sku: "sku-1", quantity: 2 }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({
      orderId: "order-1",
      receiptKey: "order-1.json",
      totalCents: 2_000,
    });

    const fetched = await client.get("/orders/order-1", {
      headers: { authorization: "Bearer fixture" },
    });
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toEqual({
      orderId: "order-1",
      status: "confirmed",
      totalCents: 1_000,
    });

    const searched = await client.get("/orders/search?status=confirmed");
    expect(await searched.json()).toEqual({ status: "confirmed", count: 1 });
    expect(invocations.at(-1)?.functionId).toBe("orders.search-orders");

    const limitedHeaders = { "x-api-key": "example-key" };
    expect((await client.get("/orders?status=open", { headers: limitedHeaders })).status).toBe(200);
    const second = await client.get("/orders?status=open", { headers: limitedHeaders });
    expect(second.headers.get("ratelimit-limit")).toBe("2");
    const blocked = await client.get("/orders?status=open", { headers: limitedHeaders });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: "rate-limit" });

    for (const method of ["PUT", "PATCH"] as const) {
      const response = await client.request("/orders/order-2", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: method === "PUT" ? "replaced" : "patched" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ orderId: "order-2" });
    }
    const deleted = await client.delete("/orders/order-2?reason=duplicate");
    expect(deleted.status).toBe(202);
    expect(await deleted.json()).toEqual({ orderId: "order-2", deleted: true });

    const head = await client.request("/orders/order-3", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await client.request("/orders/order-3", { method: "OPTIONS" })).status).toBe(200);

    expect(await (await client.get("/files/a%20b/c%2Fd")).json()).toEqual({ path: "/a b/c/d" });
    expect(await (await client.get("/docs")).json()).toEqual({ path: "/" });
    expect(await (await client.get("/docs/guides/start")).json()).toEqual({
      path: "/guides/start",
    });

    const upload = new FormData();
    upload.append("label", "receipts");
    upload.append("primary", new File(["primary"], "primary.png", { type: "image/png" }));
    upload.append("attachments", new File(["one"], "one.png", { type: "image/png" }));
    upload.append("attachments", new File(["two"], "two.png", { type: "image/png" }));
    const uploaded = await client.post("/uploads", { body: upload });
    expect(uploaded.status).toBe(200);
    expect(await uploaded.json()).toEqual({
      label: "receipts",
      files: ["primary.png", "one.png", "two.png"],
    });

    const invalidUpload = new FormData();
    invalidUpload.append("label", "receipts");
    invalidUpload.append("primary", new File(["image"], "image.png", { type: "image/png" }));
    invalidUpload.append("attachments", new File(["ok"], "ok.txt", { type: "text/plain" }));
    const invalid = await client.post("/uploads", { body: invalidUpload });
    expect(invalid.status).toBe(422);
    expect(JSON.stringify(await invalid.json()).length).toBeLessThan(1_024);

    const oversizedUpload = new FormData();
    oversizedUpload.append("label", "large");
    oversizedUpload.append(
      "primary",
      new File(["x".repeat(11 * 1024 * 1024)], "large.png", { type: "image/png" }),
    );
    const oversized = await client.post("/uploads", { body: oversizedUpload });
    expect(oversized.status).toBe(422);

    const openapi = await client.get(OPENAPI_PATH);
    expect(openapi.status).toBe(200);
    expect(await openapi.json()).toMatchObject({
      openapi: "3.1.0",
      paths: { "/uploads": {}, "/docs": {}, "/docs/{parts}": {} },
    });
    const scalar = await client.get(API_REFERENCE_PATH);
    expect(scalar.status).toBe(200);
    expect((await scalar.text()).toLowerCase()).toContain("scalar");
  } finally {
    await client.close();
  }

  expect(compiled.diagnostics).toEqual([
    expect.objectContaining({
      code: "ZSYS_EVENT_WILDCARD_RESTRICTED",
      severity: "warning",
      message: "Raw all-event selector is restricted to telemetry.",
    }),
  ]);
  expect(generateOpenApiJson(graph)).toBe(compiled.normalization.outputs.openapi);
  expect(generateClient(graph)).toBe(compiled.normalization.outputs.client);
  expect(invocations.every(({ source }) => source === "http")).toBe(true);
  expect(invocations.map(({ functionId }) => functionId)).toEqual(
    expect.arrayContaining([
      "orders.create-order",
      "orders.get-order",
      "orders.search-orders",
      "orders.update-order",
      "orders.delete-order",
      "browse-path",
      "upload-assets",
    ]),
  );
});

function createOrderResult(value: unknown) {
  const input = value as { readonly orderId: string; readonly quantity: number };
  return {
    orderId: input.orderId,
    receiptKey: `${input.orderId}.json`,
    totalCents: input.quantity * 1_000,
  };
}

function manifestFor(plan: RegistrationPlan): RuntimeManifest {
  return {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: plan.graphHash,
    functions: {},
    middleware: {
      "order-auth": {
        path: orderAuth.path,
        handler: async (_context: unknown, next: () => Promise<void>) => next(),
      },
    },
    requestTransforms: { "orders.normalize-id": normalizeOrderId.schema },
  };
}

function memoryCounter(): RateLimitCounter {
  const values = new Map<string, number>();
  return {
    get: async (key) => values.get(key),
    increment: async (key, delta) => {
      const value = (values.get(key) ?? 0) + delta;
      values.set(key, value);
      return value;
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}
