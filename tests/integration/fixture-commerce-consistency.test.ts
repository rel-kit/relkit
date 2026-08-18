import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { providerRecipe } from "../../packages/app/src/index.ts";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "../../packages/contracts/src/index.ts";
import { fromGraph } from "../../packages/deploy/src/index.ts";
import { renderPulumiProgram } from "../../packages/deploy-pulumi/src/program.ts";
import {
  invokeFunction,
  type DependencyClientSources,
  type InvocationTarget,
} from "../../packages/engine/src/index.ts";
import {
  createRegistrationPlan,
  hashGraph,
  type ApplicationGraph,
  type RegistrationPlan,
} from "../../packages/graph/src/index.ts";
import { generateClient } from "../../packages/client-generator/src/index.ts";
import { generateOpenApiJson } from "../../packages/openapi/src/index.ts";
import {
  createApp,
  type HttpInvocationOptions,
  type RuntimeManifest,
} from "../../packages/runtime-hono/src/index.ts";
import { createInspectableObservabilityHooks } from "../../packages/engine/src/index.ts";
import type { RequestRecord } from "../../packages/observability/src/index.ts";
import {
  createTestAgent,
  createTestEvent,
  createTestHttpClient,
} from "../../packages/testing/src/index.ts";
import app from "../../apps/fixture-commerce/src/app.ts";
import orderCreated from "../../apps/fixture-commerce/src/events/order-created.event.ts";
import handleOrderCreated from "../../apps/fixture-commerce/src/functions/handle-order-created.function.ts";
import authorizeOrder from "../../apps/fixture-commerce/src/functions/authorize-order.function.ts";
import createOrder from "../../apps/fixture-commerce/src/functions/create-order.function.ts";
import getOrder from "../../apps/fixture-commerce/src/functions/get-order.function.ts";
import orderSupport from "../../apps/fixture-commerce/src/agents/order-support.agent.ts";
import lookupOrder from "../../apps/fixture-commerce/src/tools/lookup-order.tool.ts";
import { normalizeOrderId } from "../../apps/fixture-commerce/src/routes/orders.route.ts";
import { compileProject } from "../compiler/fixture-runner.ts";

const APP_ROOT = resolve(import.meta.dir, "../../apps/fixture-commerce");
const ORDER_INPUT = {
  orderId: "order-1",
  sku: "sku-1",
  quantity: 2,
  customerEmail: "customer@example.com",
};

test("fixture-commerce keeps one graph and hash across every acceptance consumer", async () => {
  const compiled = await compileProject("fixture-commerce", APP_ROOT);
  const graph = JSON.parse(compiled.graphBytes) as ApplicationGraph;
  const graphHash = hashGraph(graph);
  const registration = createRegistrationPlan(graph, { projectRoot: "/fixture" });
  const deployment = fromGraph(graph, {
    image: {
      name: "registry.example/fixture-commerce",
      tag: "acceptance",
      health: {
        livenessPath: "/_zsys/v1/health/live",
        readinessPath: "/_zsys/v1/health/ready",
        port: 3000,
      },
    },
    modelProfiles: { default: { provider: "openai", model: "gpt-4o-mini" } },
  });
  const pulumi = renderPulumiProgram(deployment, {
    projectRoot: "/tmp/fixture-commerce-acceptance",
    stackName: "acceptance",
  });

  expect(compiled.exitCode).toBe(0);
  expect(compiled.graphHash).toBe(graphHash);
  expect(registration.graphHash).toBe(graphHash);
  expect(deployment.graphHash).toBe(graphHash);
  expect(JSON.parse(pulumi.planJson).graphHash).toBe(graphHash);
  expect(pulumi.indexTs).toContain("export const graphHash = plan.graphHash;");
  expect(compiled.manifest).toContain(`manifestGraphHash = ${JSON.stringify(graphHash)}`);
  expect(compiled.normalization.outputs.openapi).toBe(generateOpenApiJson(graph));
  expect(compiled.normalization.outputs.client).toBe(generateClient(graph));

  assertApplicationCoverage(graph, registration);
  expect(providerRecipe(app.providers.development)).toBe("local");
  expect(providerRecipe(app.providers.test)).toBe("test");
  expect(providerRecipe(app.providers.production)).toBe("aws");
  expect(app.env.OPENAI_API_KEY.sensitive).toBe(true);
  expect(app.observability?.bodyCapture?.mode).toBe("off");

  const observability = createInspectableObservabilityHooks();
  const requestRecords: RequestRecord[] = [];
  const clients = fixtureClients();
  const targets = new Map<string, InvocationTarget>([
    [createOrder.id, createOrder],
    [getOrder.id, getOrder],
    [authorizeOrder.id, authorizeOrder],
  ]);
  const calls: HttpInvocationOptions[] = [];
  const http = createApp({
    plan: registration,
    manifest: manifestFor(registration),
    engine: {
      invoke: async (request) => {
        calls.push(request);
        const target = targets.get(request.functionId);
        if (target === undefined) throw new Error(`Missing fixture target ${request.functionId}`);
        return invokeFunction(target, request.input, {
          source: "http",
          ...(request.signal === undefined ? {} : { signal: request.signal }),
          ...(request.traceId === undefined ? {} : { traceId: request.traceId }),
          ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
          ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
          clients,
          hooks: { observability },
        });
      },
    },
    middleware: {
      requestId: () => "request-fixture-1",
      traceId: () => "trace-fixture-1",
      now: () => 0,
      observability: {
        collect: (record) => void requestRecords.push(record),
        readRecords: observability.readRecords,
      },
    },
  });
  const client = createTestHttpClient(http);

  try {
    const graphResponse = await http.request("http://fixture/_zsys/v1/graph");
    expect(graphResponse.status).toBe(200);
    expect((await graphResponse.json()).graphHash).toBe(graphHash);

    await expect(
      invokeFunction(createOrder, ORDER_INPUT, {
        source: "direct",
        now: () => Date.now(),
        clients,
        hooks: { observability },
      }),
    ).resolves.toEqual({ orderId: "order-1", receiptKey: "order-1.json", totalCents: 2_000 });

    const created = await client.post("/orders", {
      headers: {
        "content-type": "application/json",
        "idempotency-key": "order-1",
        "x-customer-email": "customer@example.com",
      },
      body: JSON.stringify({ sku: "sku-1", quantity: 2 }),
    });
    expect(created.status).toBe(201);

    const fetched = await client.get("/orders/order-1", {
      headers: { authorization: "Bearer fixture" },
    });
    expect(fetched.status).toBe(200);
    expect((await fetched.json()).orderId).toBe("order-1");
  } finally {
    await client.close();
  }

  expect(calls.map(({ functionId, source }) => [functionId, source])).toEqual([
    ["orders.create", "http"],
    ["orders.authorize", "http"],
    ["orders.get", "http"],
  ]);
  expect(requestRecords).toHaveLength(3);
  expect(requestRecords.map(({ rawPath }) => rawPath)).toEqual([
    "/_zsys/v1/graph",
    "/orders",
    "/orders/order-1",
  ]);
  expect(requestRecords.every((record) => record.graphHash === graphHash)).toBe(true);
  expect(observability.read().some((event) => event.type === "invocation.completed")).toBe(true);

  const event = await createTestEvent({
    event: orderCreated,
    triggerId: "receipts.on-order-created",
    target: handleOrderCreated as unknown as InvocationTarget,
    delivery: "durable",
    expansion: ["orders.created@1"],
    clients: {
      functions: { getOrder },
      jobs: { sendReceiptJob: { enqueue: async () => ({ accepted: true, instanceId: "job-1" }) } },
    },
    payloadSchema: orderCreated.payload,
  });
  try {
    await event.publish({ ...ORDER_INPUT, totalCents: 2_000 });
    await expect(event.drain()).resolves.toMatchObject([
      { state: "completed", triggerId: "receipts.on-order-created" },
    ]);
  } finally {
    await event.close();
  }

  const agent = createTestAgent({
    agent: orderSupport,
    tools: [lookupOrder],
    engine: {
      invoke: (request) =>
        invokeFunction(getOrder, request.input, {
          source: request.source,
          ...(request.parent === undefined ? {} : { parent: request.parent }),
        }),
    },
    script: [
      {
        type: "tool-call",
        callId: "call-1",
        toolId: lookupOrder.id,
        input: { orderId: "order-1" },
      },
      { type: "final", output: { answer: "confirmed" } },
    ],
  });
  await expect(agent.invoke({ question: "What is the order status?" })).resolves.toEqual({
    answer: "confirmed",
  });
  expect(agent.trace.read().spans.some((span) => span.functionId === "orders.get")).toBe(true);
});

function assertApplicationCoverage(graph: ApplicationGraph, plan: RegistrationPlan): void {
  const nodes = new Set(graph.nodes.map(({ id }) => id));
  expect([...nodes]).toEqual(
    expect.arrayContaining([
      "commerce-api",
      "APP_ENV",
      "PORT",
      "AWS_REGION",
      "OPENAI_API_KEY",
      "assets",
      "prices",
      "orders.create",
      "orders.get",
      "receipts.send-job",
      "orders.created",
      "receipts.on-order-created",
      "orders.get.tool",
      "support.order",
    ]),
  );
  expect(plan.httpTriggers.map(({ id }) => id).sort()).toEqual([
    "orders.create.http",
    "orders.get-route",
  ]);
  expect(plan.queues.map(({ id }) => id)).toEqual(["receipts.send-job"]);
  expect(plan.schedules.map(({ id }) => id)).toEqual(["receipts.send-job:receipts.reconcile"]);
  expect(plan.eventTriggers.map(({ id }) => id).sort()).toEqual([
    "orders.audit-changes",
    "orders.project-any-change",
    "receipts.on-order-created",
    "telemetry.capture-events",
  ]);
  expect(plan.buckets.map(({ id }) => id)).toEqual(["assets"]);
  expect(plan.caches.map(({ id }) => id)).toEqual(["prices"]);
  expect(plan.tools.map(({ id }) => id)).toEqual(["orders.get.tool"]);
  expect(plan.agents.map(({ id }) => id)).toEqual(["support.order"]);
  expect(plan.functions.map(({ id }) => id)).toEqual(
    expect.arrayContaining([
      "orders.create",
      "orders.get",
      "receipts.send",
      "zsys.agent.support.order.invoke",
    ]),
  );
}

function manifestFor(plan: RegistrationPlan): RuntimeManifest {
  return {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
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

function fixtureClients(): DependencyClientSources {
  return {
    cache: { prices: { getOrSet: async () => 1_000 } },
    events: {
      orderCreated: {
        publish: async () => ({ accepted: true, instanceId: "event-1" }),
      },
    },
    jobs: {
      sendReceiptJob: {
        enqueue: async () => ({ accepted: true, instanceId: "job-1" }),
      },
    },
  } as unknown as DependencyClientSources;
}
