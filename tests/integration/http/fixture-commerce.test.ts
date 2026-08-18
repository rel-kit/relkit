import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { generateClient } from "../../../packages/client-generator/src/index.ts";
import { compileProject } from "../../compiler/fixture-runner.ts";
import {
  createRegistrationPlan,
  type ApplicationGraph,
  type RegistrationPlan,
} from "../../../packages/graph/src/index.ts";
import { generateOpenApiJson } from "../../../packages/openapi/src/index.ts";
import {
  createApp,
  type HttpInvocationOptions,
  type RuntimeManifest,
} from "../../../packages/runtime-hono/src/index.ts";
import { createTestHttpClient } from "../../../packages/testing/src/index.ts";
import { normalizeOrderId } from "../../../apps/fixture-commerce/src/routes/orders.route.ts";

const APP_ROOT = resolve(import.meta.dir, "../../../apps/fixture-commerce");

test("serves the compiled fixture routes through one HTTP engine path", async () => {
  const compiled = await compileProject("fixture-commerce", APP_ROOT);
  const graph = JSON.parse(compiled.graphBytes) as ApplicationGraph;
  const plan = createRegistrationPlan(graph, { projectRoot: "/fixture" });
  const invocations: HttpInvocationOptions[] = [];
  const app = createApp({
    plan,
    manifest: manifestFor(plan),
    engine: {
      invoke: async (invocation) => {
        invocations.push(invocation);
        if (invocation.functionId === "orders.authorize") return { allowed: true };
        if (invocation.functionId === "orders.get") {
          const input = invocation.input as { readonly orderId: string };
          return { orderId: input.orderId, status: "confirmed", totalCents: 1_000 };
        }
        const input = invocation.input as {
          readonly orderId: string;
          readonly quantity: number;
        };
        return {
          orderId: input.orderId,
          receiptKey: `${input.orderId}.json`,
          totalCents: input.quantity * 1_000,
        };
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
  } finally {
    await client.close();
  }

  expect(compiled.diagnostics).toEqual([]);
  expect(generateOpenApiJson(graph)).toBe(compiled.normalization.outputs.openapi);
  expect(generateClient(graph)).toBe(compiled.normalization.outputs.client);
  expect(invocations.map(({ functionId, source }) => [functionId, source])).toEqual([
    ["orders.create", "http"],
    ["orders.authorize", "http"],
    ["orders.get", "http"],
  ]);
});

function manifestFor(plan: RegistrationPlan): RuntimeManifest {
  return {
    contractVersion: 1,
    generatorVersion: 1,
    graphHash: plan.graphHash,
    functions: {},
    middleware: {
      "orders.auth": {
        targetFunctionId: "orders.authorize",
        request: {
          kind: "input",
          fields: { authorization: { kind: "header", name: "authorization" } },
        },
        decision: { kind: "continue" },
      },
    },
    requestTransforms: { "orders.normalize-id": normalizeOrderId.schema },
  };
}
