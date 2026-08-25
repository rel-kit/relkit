import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  API_BASE_PATH,
  API_VERSION,
  canonicalJson,
} from "../../../packages/contracts/src/index.ts";
import {
  createRegistrationPlan,
  type RegistrationPlan,
} from "../../../packages/graph/src/index.ts";
import { generateClient } from "../../../packages/client-generator/src/index.ts";
import { generateOpenApiJson } from "../../../packages/openapi/src/index.ts";
import { createApp, type RuntimeManifest } from "../../../packages/runtime-hono/src/index.ts";
import { createTestHttpClient } from "../../../packages/testing/src/index.ts";
import { contractGraph } from "./contract-fixture.ts";

const fixtureRoot = resolve(import.meta.dir, "fixtures");

test("keeps runtime, OpenAPI, and generated client contracts aligned", async () => {
  const graph = contractGraph();
  const plan = createRegistrationPlan(graph, { projectRoot: "/project" });
  const calls: unknown[] = [];
  const app = service(plan, calls);
  const client = createTestHttpClient(app);
  try {
    const success = await client.get("/orders/order-1?note=gift");
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({ orderId: "order-1", totalCents: 100 });

    const missing = await client.get("/orders/missing?note=gift");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      outcome: "declared-error",
      code: "orders.not-found",
      status: 404,
    });

    const invalid = await client.get("/orders/order-1");
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ error: "validation" });
    expect(calls).toHaveLength(2);

    expect(generateOpenApiJson(graph)).toBe(await readFixture("orders.openapi.json"));
    expect(generateClient(graph)).toBe(await readFixture("orders.client.ts"));
    expect(generateOpenApiJson(contractGraph("/root-a"))).toBe(
      generateOpenApiJson(contractGraph("/root-b", true)),
    );
    expect(generateClient(contractGraph("/root-a"))).toBe(
      generateClient(contractGraph("/root-b", true)),
    );

    const live = await client.get(`${API_BASE_PATH}/health/live`);
    expect(live.headers.get("x-zsys-api-version")).toBe(String(API_VERSION));
    expect(await live.json()).toMatchObject({ protocol: "zsys.inspector", version: API_VERSION });
  } finally {
    await client.close();
  }

  const production = createApp({
    plan,
    manifest: manifestFor(plan),
    engine: { invoke: async () => ({ orderId: "order-1", totalCents: 100 }) },
    internalEndpoints: { mode: "production", enabled: true, bearerToken: "fixture-token" },
  });
  expect((await production.request(`${API_BASE_PATH}/health/live`)).status).toBe(401);
  const authorized = await production.request(`${API_BASE_PATH}/health/live`, {
    headers: { authorization: "Bearer fixture-token" },
  });
  expect(authorized.status).toBe(200);
  expect(authorized.headers.get("x-zsys-api-version")).toBe(String(API_VERSION));
});

function service(plan: RegistrationPlan, calls: unknown[]) {
  return createApp({
    plan,
    manifest: manifestFor(plan),
    engine: {
      invoke: async (invocation) => {
        calls.push(invocation);
        const input = invocation.input as { readonly orderId: string };
        if (input.orderId === "missing") {
          throw Object.assign(new Error("Order not found"), {
            name: "DeclaredError",
            id: "orders.not-found",
            data: { orderId: input.orderId },
            retry: "never",
            ref: { kind: "error", id: "orders.not-found" },
            http: { status: 404 },
          });
        }
        return { orderId: input.orderId, totalCents: 100 };
      },
    },
  });
}

function manifestFor(plan: RegistrationPlan): RuntimeManifest {
  return {
    contractVersion: 4,
    generatorVersion: 1,
    graphHash: plan.graphHash,
    functions: {},
    middleware: {},
    requestTransforms: {},
  };
}

async function readFixture(name: string): Promise<string> {
  const text = await readFile(resolve(fixtureRoot, name), "utf8");
  return name.endsWith(".json") ? `${canonicalJson(JSON.parse(text))}\n` : text;
}
