import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "../../packages/contracts/src/index.ts";
import { createEventListenerTarget } from "../../packages/events/src/index.ts";
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
import { bindDescriptorIdentity } from "../../packages/invocation/dist/index.js";
import app from "../../examples/commerce/relkit.config.ts";
import orderCreated from "../../examples/commerce/src/events/order-created.event.ts";
import orderReceipt from "../../examples/commerce/src/events/order-receipt.event.ts";
import authorizeOrder from "../../examples/commerce/src/functions/authorize-order.function.ts";
import createOrder from "../../examples/commerce/src/functions/orders/create-order.function.ts";
import getOrder from "../../examples/commerce/src/functions/orders/get-order.function.ts";
import orders from "../../examples/commerce/src/services/orders.service.ts";
import orderSupport from "../../examples/commerce/src/agents/order-support.agent.ts";
import lookupOrder from "../../examples/commerce/src/tools/lookup-order.tool.ts";
import normalizeOrderId from "../../examples/commerce/src/transforms/orders/normalize-id.transform.ts";
import orderAuth from "../../examples/commerce/src/middleware/order-auth.middleware.ts";
import { ALL as authRoute } from "../../examples/commerce/src/routes/api/auth/[[...auth]]/route.ts";
import { compileProject } from "../compiler/fixture-runner.ts";

const APP_ROOT = resolve(import.meta.dir, "../../examples/commerce");
const ORDER_INPUT = {
  orderId: "order-1",
  sku: "sku-1",
  quantity: 2,
  customerEmail: "customer@example.com",
};

bindDescriptorIdentity(authorizeOrder, "authorize-order");
bindDescriptorIdentity(createOrder, "orders.create-order");
bindDescriptorIdentity(getOrder, "orders.get-order");
bindDescriptorIdentity(orders.getOrder, "orders.get-order");
bindDescriptorIdentity(lookupOrder.target, "orders.get-order");

test("commerce-example keeps one graph and hash across every acceptance consumer", async () => {
  const compiled = await compileProject("commerce-example", APP_ROOT);
  const graph = JSON.parse(compiled.graphBytes) as ApplicationGraph;
  const graphHash = hashGraph(graph);
  const registration = createRegistrationPlan(graph, { projectRoot: "/fixture" });
  const deployment = fromGraph(graph, {
    image: {
      name: "registry.example/commerce-example",
      tag: "acceptance",
      health: {
        livenessPath: "/_relkit/v1/health/live",
        readinessPath: "/_relkit/v1/health/ready",
        port: 3000,
      },
    },
  });
  const pulumi = renderPulumiProgram(deployment, {
    projectRoot: "/tmp/commerce-example-acceptance",
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
  expect(app.buckets.default.adapter.adapter).toBe("s3");
  expect(app.caches.default.adapter.adapter).toBe("redis");
  expect(app.models.default.ownership).toBe("external");
  expect(app.env.OPENAI_API_KEY.sensitive).toBe(true);
  expect(app.env.metadata.OPENAI_API_KEY?.requiredIn).toEqual(["production"]);
  expect(app.telemetry?.bodyCapture?.mode).toBe("off");

  const observability = createInspectableObservabilityHooks();
  const requestRecords: RequestRecord[] = [];
  const clients = fixtureClients();
  const targets = new Map<string, InvocationTarget>([
    ["orders.create-order", createOrder],
    ["orders.get-order", getOrder],
    ["authorize-order", authorizeOrder],
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
    const graphResponse = await http.request("http://fixture/_relkit/v1/graph");
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
        authorization: "Bearer fixture",
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
    ["orders.create-order", "http"],
    ["orders.get-order", "http"],
  ]);
  expect(requestRecords).toHaveLength(3);
  expect(requestRecords.map(({ rawPath }) => rawPath)).toEqual([
    "/_relkit/v1/graph",
    "/orders",
    "/orders/order-1",
  ]);
  expect(requestRecords.every((record) => record.graphHash === graphHash)).toBe(true);
  expect(observability.read().some((event) => event.type === "invocation.completed")).toBe(true);

  const event = await createTestEvent({
    event: orderCreated,
    triggerId: "receipts.on-order-created",
    target: createEventListenerTarget(
      orderReceipt,
      [orderCreated],
      "relkit.event.receipts.on-order-created.handler",
    ) as unknown as InvocationTarget,
    delivery: "durable",
    expansion: ["orders.created@1"],
    clients: {
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
  expect(
    agent.trace
      .read()
      .spans.some((span) => span.kind === "tool" && span.functionId.startsWith("unbound.")),
  ).toBe(true);
});

function assertApplicationCoverage(graph: ApplicationGraph, plan: RegistrationPlan): void {
  const nodes = new Set(graph.nodes.map(({ id }) => id));
  expect([...nodes]).toEqual(
    expect.arrayContaining([
      "commerce-api",
      "APP_ENV",
      "BUCKET_ENDPOINT",
      "CACHE_URL",
      "OPENAI_API_KEY",
      "assets",
      "prices",
      "orders",
      "orders.create-order",
      "orders.get-order",
      "receipts.send-job",
      "orders.created",
      "receipts.on-order-created",
      "lookup-order",
      "order-support",
      "provider.buckets.default",
      "provider.cache.default",
      "provider.events.default",
      "provider.jobs.default",
      "provider.models.default",
      "provider.observability.default",
    ]),
  );
  expect(plan.httpTriggers.map(({ id }) => id).sort()).toEqual([
    "route.all.api.auth.optional-catch-all-auth",
    "route.delete.orders.by-order-id",
    "route.get.account.profile",
    "route.get.database.users",
    "route.get.docs.optional-catch-all-parts",
    "route.get.files.catch-all-parts",
    "route.get.orders",
    "route.get.orders.by-order-id",
    "route.get.orders.search",
    "route.head.orders.by-order-id",
    "route.options.orders.by-order-id",
    "route.patch.orders.by-order-id",
    "route.post.orders",
    "route.post.uploads",
    "route.put.orders.by-order-id",
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
  expect(plan.tools.map(({ id }) => id)).toEqual(["cancel-order", "lookup-order"]);
  expect(plan.agents.map(({ id }) => id)).toEqual(["order-support"]);
  expect(plan.functions.map(({ id }) => id)).toEqual(
    expect.arrayContaining([
      "orders.create-order",
      "orders.get-order",
      "send-receipt",
      "relkit.agent.order-support.invoke",
    ]),
  );
}

function manifestFor(plan: RegistrationPlan): RuntimeManifest {
  return {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: plan.graphHash,
    functions: {},
    routes: {
      "route.all.api.auth.optional-catch-all-auth": { handler: authRoute.handler },
    },
    middleware: { "order-auth": orderAuth },
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
