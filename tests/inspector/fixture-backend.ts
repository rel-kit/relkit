import { Hono } from "../../packages/inspector-api/node_modules/hono";
// @ts-expect-error The workspace package exposes this runtime subpath without a relative declaration path.
import { cors } from "../../packages/inspector-api/node_modules/hono/dist/middleware/cors/index.js";
import { PROTOCOL_VERSION } from "../../packages/contracts/src/index.ts";
import {
  assembleRequestExecution,
  createObservabilityStream,
  type ObservabilityQuery,
  type ObservabilityQueryRequest,
  type ObservabilityStream,
} from "../../packages/observability/src/index.ts";
import {
  installInspectorEndpoints,
  type InspectorActionServices,
  type InspectorActiveGeneration,
} from "../../packages/inspector-api/src/index.ts";

export const FIXTURE_GRAPH_HASH = "sha256:commerce-inspector-fixture-v1";
export const FIXTURE_GENERATION_ID = "commerce-generation-1";
export const FIXTURE_BASE_URL = "http://127.0.0.1:3212";
const INITIAL_TRACE_ID = "11111111111111111111111111111111";
const AGENT_TRACE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const FIXTURE_IDS = Object.freeze({
  route: "orders.create.http",
  function: "orders.create",
  job: "receipts.send-job",
  jobInstance: "receipts-job-dead-letter-1",
  event: "orders.created",
  trigger: "orders.project-any-change",
  bucket: "assets",
  cache: "prices",
  tool: "orders.get.tool",
  agent: "support.order",
});

const now = "2026-01-01T00:00:00.000Z";
const source = (file: string, line: number) => ({ file, line, column: 1 });
const schema = (type: string): Record<string, unknown> => ({ type });
const bucketFixtures = [
  { key: "docs/readme.txt", type: "text/plain", body: "Hello from the bucket inspector." },
  { key: "docs/config.json", type: "application/json", body: '{"enabled":true}' },
  { key: "unsafe/page.html", type: "text/html", body: "<script>alert(1)</script>" },
  { key: "unsafe/vector.svg", type: "image/svg+xml", body: "<svg onload='alert(1)'/>" },
  { key: "documents/sample.pdf", type: "application/pdf", body: "%PDF-1.4 fixture" },
  { key: "images/pixel.png", type: "image/png", body: "fixture-png" },
  { key: "binary/data.bin", type: "application/octet-stream", body: "\u0000\u0001\u0002" },
  { key: "binary/oversized.bin", type: "application/octet-stream", body: "x".repeat(1_048_577) },
  ...Array.from({ length: 51 }, (_, index) => ({
    key: `seed/object-${String(index + 1).padStart(2, "0")}.txt`,
    type: "text/plain",
    body: `seed ${index + 1}`,
  })),
];
const cacheFixtures = Array.from({ length: 55 }, (_, index) => ({
  key: JSON.stringify(`price:${String(index + 1).padStart(2, "0")}`),
  value: { cents: (index + 1) * 100 },
  ttlMs: index === 0 ? 12_000 : null,
}));

const graph = {
  contractVersion: 5,
  appId: "commerce-api",
  nodes: [
    {
      kind: "env",
      id: "PORT",
      name: "PORT",
      type: "port",
      requiredIn: [],
      hasDefault: true,
      optional: false,
      sensitive: false,
      description: "Backend port.",
      source: source("src/env.ts", 4),
    },
    {
      kind: "env",
      id: "OPENAI_API_KEY",
      name: "OPENAI_API_KEY",
      type: "secret-string",
      requiredIn: ["production"],
      hasDefault: false,
      optional: false,
      sensitive: true,
      description: "Production model credential.",
      source: source("src/env.ts", 8),
    },
    {
      kind: "function",
      invocationMode: "callable",
      id: "orders.create",
      input: {
        type: "object",
        required: ["orderId", "customerEmail", "sku", "quantity"],
        properties: {
          orderId: schema("string"),
          customerEmail: schema("string"),
          sku: schema("string"),
          quantity: schema("integer"),
        },
      },
      output: {
        type: "object",
        properties: { orderId: schema("string"), totalCents: schema("integer") },
      },
      dependencies: {
        cache: ["prices"],
        events: ["orders.created"],
        jobs: ["receipts.send-job"],
      },
      timeoutMs: 10_000,
      concurrency: 100,
      source: source("src/functions/create-order.function.ts", 6),
    },
    {
      kind: "function",
      invocationMode: "callable",
      id: "orders.get",
      input: { type: "object", properties: { orderId: schema("string") } },
      output: {
        type: "object",
        properties: { orderId: schema("string"), status: schema("string") },
      },
      errors: [{ id: "orders.not-found", status: 404 }],
      source: source("src/functions/get-order.function.ts", 4),
    },
    {
      kind: "function",
      invocationMode: "event-only",
      id: "orders.project-order-change",
      input: { type: "object", properties: { orderId: schema("string") } },
      output: { "x-relkit-void": true },
      source: source("src/functions/project-order-change.function.ts", 4),
    },
    {
      kind: "trigger",
      id: "orders.create.http",
      triggerType: "http",
      targetFunctionId: "orders.create",
      config: {
        method: "POST",
        path: "/orders",
        request: {
          kind: "input",
          fields: {
            orderId: { kind: "header", name: "idempotency-key" },
            customerEmail: { kind: "header", name: "x-customer-email" },
            sku: { kind: "body", name: "sku" },
            quantity: { kind: "body", name: "quantity" },
          },
        },
        responses: [
          { status: 201, kind: "success" },
          { status: 400, kind: "validation" },
        ],
      },
      source: source("src/routes/create-order.route.ts", 3),
    },
    {
      kind: "trigger",
      id: "orders.get-route",
      triggerType: "http",
      targetFunctionId: "orders.get",
      config: {
        method: "GET",
        path: "/orders/:orderId",
        request: { kind: "input", fields: { orderId: { kind: "path", name: "orderId" } } },
        responses: [
          { status: 200, kind: "success" },
          { status: 404, kind: "error" },
        ],
      },
      source: source("src/routes/orders.route.ts", 8),
    },
    {
      kind: "job",
      id: "receipts.send-job",
      targetFunctionId: "orders.send-receipt",
      profile: "default",
      input: { type: "object", properties: { orderId: schema("string") } },
      retry: { maxAttempts: 3, initialDelayMs: 500, jitter: "none" },
      concurrency: 4,
      schedule: [{ id: "receipts.reconcile", cron: "0 * * * *", timezone: "UTC", nextRunAt: now }],
      source: source("src/jobs/send-receipt.job.ts", 3),
    },
    {
      kind: "event",
      id: "orders.created",
      version: 1,
      input: { type: "object", properties: { orderId: schema("string") } },
      sensitiveFields: ["customerEmail"],
      source: source("src/events/order-created.event.ts", 3),
    },
    {
      kind: "event",
      id: "orders.updated",
      version: 1,
      input: { type: "object", properties: { orderId: schema("string") } },
      source: source("src/events/order-updated.event.ts", 3),
    },
    {
      kind: "event",
      id: "orders.cancelled",
      version: 1,
      input: { type: "object", properties: { orderId: schema("string") } },
      source: source("src/events/order-cancelled.event.ts", 3),
    },
    {
      kind: "trigger",
      id: "orders.project-any-change",
      triggerType: "event",
      targetFunctionId: "orders.project-order-change",
      config: {
        eventId: "orders.created",
        eventVersion: 1,
        delivery: "durable",
        profile: "default",
        retry: { maxAttempts: 3 },
      },
      source: source("src/events/order-projector.event.ts", 5),
    },
    {
      kind: "bucket",
      id: "assets",
      profile: "default",
      visibility: "private",
      maxObjectBytes: 1_000_000,
      allowedContentTypes: ["application/json"],
      source: source("src/buckets/assets.bucket.ts", 3),
    },
    {
      kind: "bucket",
      id: "archive",
      profile: "custom",
      visibility: "private",
      source: source("src/buckets/archive.bucket.ts", 3),
    },
    {
      kind: "bucket",
      id: "broken",
      profile: "broken",
      visibility: "private",
      source: source("src/buckets/broken.bucket.ts", 3),
    },
    {
      kind: "cache",
      id: "prices",
      profile: "default",
      key: { type: "object", properties: { sku: schema("string") } },
      value: schema("integer"),
      defaultTtlMs: 60_000,
      maxTtlMs: 86_400_000,
      source: source("src/cache/prices.cache.ts", 3),
    },
    {
      kind: "tool",
      id: "orders.get.tool",
      targetFunctionId: "orders.get",
      description: "Read one order by ID",
      sideEffect: "read",
      approval: "never",
      timeoutMs: 2_000,
      source: source("src/tools/lookup-order.tool.ts", 3),
    },
    {
      kind: "agent",
      id: "support.order",
      model: "default",
      input: { type: "object", properties: { question: schema("string") } },
      output: { type: "object", properties: { answer: schema("string") } },
      toolIds: ["orders.get.tool"],
      generatedFunction: { functionId: "relkit.agent.support.order.invoke", generated: true },
      limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
      source: source("src/agents/order-support.agent.ts", 3),
    },
  ],
  edges: [
    { kind: "targets-function", from: "orders.create.http", to: "orders.create" },
    { kind: "targets-function", from: "orders.get-route", to: "orders.get" },
    {
      kind: "targets-function",
      from: "orders.project-any-change",
      to: "orders.project-order-change",
    },
    { kind: "publishes-event", from: "orders.create", to: "orders.created" },
    { kind: "enqueues-job", from: "orders.create", to: "receipts.send-job" },
    { kind: "uses-cache", from: "orders.create", to: "prices" },
    { kind: "listens-to-event", from: "orders.project-any-change", to: "orders.created" },
    { kind: "uses-tool", from: "support.order", to: "orders.get.tool" },
    { kind: "targets-function", from: "orders.get.tool", to: "orders.get" },
  ],
};

const eventContracts = [
  ...["orders.created", "orders.updated", "orders.cancelled"].map((id) => ({
    protocol: "relkit.events.admin",
    protocolVersion: PROTOCOL_VERSION,
    id,
    version: 1,
    input: { type: "object", properties: { orderId: schema("string") } },
    ...(id === "orders.created" ? { sensitiveFields: ["customerEmail"] } : {}),
    source: source(`src/events/${id.split(".").at(-1)}.event.ts`, 3),
  })),
];

const eventTrigger = {
  protocol: "relkit.events.admin",
  version: PROTOCOL_VERSION,
  id: FIXTURE_IDS.trigger,
  targetFunctionId: "orders.project-order-change",
  eventId: "orders.created",
  eventVersion: 1,
  delivery: "durable",
  profile: "default",
  retry: { maxAttempts: 3 },
  concurrency: 1,
};

const eventPublications = [
  {
    protocol: "relkit.events.admin",
    protocolVersion: PROTOCOL_VERSION,
    sequence: 1,
    timestamp: now,
    accepted: true,
    instanceId: "event-instance-1",
    eventId: FIXTURE_IDS.event,
    version: 1,
    occurredAt: now,
    publishedAt: now,
    traceId: INITIAL_TRACE_ID,
    attributes: {},
  },
];

const eventDeliveries = [
  {
    protocol: "relkit.events.admin",
    version: PROTOCOL_VERSION,
    deliveryId: "delivery-dead-letter-1",
    eventInstanceId: "event-instance-1",
    eventId: FIXTURE_IDS.event,
    eventVersion: 1,
    triggerId: FIXTURE_IDS.trigger,
    state: "dead-lettered",
    attempt: 3,
    timestamp: now,
    failure: { code: "ORDER_PROJECTOR_FAILED", message: "safe fixture failure", retry: false },
  },
];

const initialRequests = [makeRequest("request-initial", INITIAL_TRACE_ID, now)];
const initialLogs = [
  makeLog(
    "1",
    INITIAL_TRACE_ID,
    "orders.create",
    "Initial fixture request recorded.",
    "request-initial",
  ),
];
const initialTraces = [
  ...makeTraceRecords(INITIAL_TRACE_ID, "request-initial", now),
  {
    version: 2,
    signal: "span",
    spanId: "aaaaaaaaaaaaaaaa",
    invocationId: "agent-invocation-1",
    traceId: AGENT_TRACE_ID,
    name: "relkit.agent.support.order.tool.orders.get.tool",
    kind: "internal",
    revision: 1,
    functionId: "relkit.agent.support.order.invoke",
    status: "completed",
    outcome: "success",
    startedAt: now,
    completedAt: now,
    durationMs: 4,
    attributes: {
      "relkit.agent.id": FIXTURE_IDS.agent,
      "relkit.tool.id": FIXTURE_IDS.tool,
      "relkit.tool.call.id": "tool-call-1",
      "relkit.model.profile": "default",
      "relkit.agent.step": 1,
    },
  },
];

export interface InspectorFixture {
  readonly app: Hono;
  readonly stream: ObservabilityStream;
  readonly baseUrl: string;
  readonly reset: () => void;
  readonly setInvalidCandidate: (enabled: boolean) => void;
  readonly state: () => { readonly invalidCandidate: boolean; readonly jobState: string };
}

export function createInspectorFixture(): InspectorFixture {
  let invalidCandidate = false;
  let jobState = "dead-lettered";
  let requestSequence = 1;
  let requests = [...initialRequests];
  let logs = [...initialLogs];
  let traces = [...initialTraces];
  let releasePaused: (() => void) | undefined;
  const stream = createObservabilityStream({ maxEvents: 100 });
  const actionServices: InspectorActionServices = {
    functions: {
      exists: async (id) => id === FIXTURE_IDS.function,
      invoke: async () => ({ ok: true, orderId: "order-100", totalCents: 1000 }),
    },
    jobs: {
      protocol: "relkit.jobs.admin",
      version: PROTOCOL_VERSION,
      status: async () => ({ state: jobState }),
      retry: async ({ instanceId }) => {
        jobState = "available";
        return { action: "retry", status: { instanceId, state: jobState } };
      },
      cancel: async ({ instanceId }) => {
        jobState = "cancelled";
        return { action: "cancel", status: { instanceId, state: jobState } };
      },
    },
    approvals: {
      get: async ({ toolCallId }) => ({
        invocationId: "agent-invocation-1",
        toolCallId,
        toolId: FIXTURE_IDS.tool,
        state: "pending",
      }),
      approve: async ({ invocationId, toolCallId, toolId }) => ({
        invocationId,
        toolCallId,
        toolId,
        state: "approved",
      }),
      deny: async ({ invocationId, toolCallId, toolId }) => ({
        invocationId,
        toolCallId,
        toolId,
        state: "denied",
      }),
    },
  };
  const app = new Hono();
  app.use("*", cors({ origin: "*", exposeHeaders: ["x-request-id", "x-trace-id"] }));
  installInspectorEndpoints(app, {
    mode: "development",
    activeGeneration: () => makeGeneration(),
    query: makeQuery(() => ({ requests, logs, traces })),
    stream,
  });
  app.post("/orders", async (context) => {
    const body = await context.req.json<Record<string, unknown>>();
    const id = `request-live-${String(++requestSequence).padStart(4, "0")}`;
    const traceId = requestSequence.toString(16).padStart(32, "0");
    const request = makeRequest(id, traceId, now, body);
    requests = [request, ...requests];
    const records = makeTraceRecords(traceId, id, now);
    traces = [...records, ...traces];
    const log = makeLog(
      String(Math.max(0, ...logs.map((record) => Number(record.cursor))) + 1),
      traceId,
      FIXTURE_IDS.function,
      "Order request completed.",
      id,
    );
    logs = [log, ...logs];
    stream.publish({ type: "request.completed", data: request });
    stream.publish({ type: "span.completed", data: records[1]! });
    stream.publish({ type: "log.emitted", data: log });
    return context.json(
      { orderId: "order-100", receiptKey: "receipts/order-100.json", totalCents: 1000 },
      201,
      { "x-request-id": id },
    );
  });
  app.get("/orders/:orderId", (context) =>
    context.json({ orderId: context.req.param("orderId"), status: "confirmed", totalCents: 1000 }),
  );
  app.post("/__fixture__/paused", async (context) => {
    const requestId = "request-paused-0001";
    const traceId = "22222222222222222222222222222222";
    const activeRequest = makeActiveRequest(requestId, traceId, now);
    const activeRecords = makeActiveTraceRecords(traceId, requestId, now);
    requests = [activeRequest, ...requests.filter((item) => item.requestId !== requestId)];
    traces = [...activeRecords, ...traces.filter((item) => item.traceId !== traceId)];
    stream.publish({ type: "request.started", data: activeRequest });
    for (const record of activeRecords.filter((item) => item.signal === "span"))
      stream.publish({ type: "span.started", data: record });
    await new Promise<void>((resolve) => {
      releasePaused = resolve;
    });
    releasePaused = undefined;
    const completedRequest = makeRequest(requestId, traceId, now);
    const completedRecords = makeTraceRecords(traceId, requestId, now);
    const continuation = makeContinuationRecords(requestId, traceId, now);
    requests = [completedRequest, ...requests.filter((item) => item.requestId !== requestId)];
    traces = [
      ...completedRecords,
      ...continuation,
      ...traces.filter(
        (item) => item.traceId !== traceId && item.traceId !== continuation[0]!.traceId,
      ),
    ];
    stream.publish({ type: "request.completed", data: completedRequest });
    for (const record of completedRecords.filter((item) => item.signal === "span"))
      stream.publish({ type: "span.completed", data: record });
    return context.json({ ok: true, requestId }, 201, { "x-request-id": requestId });
  });
  app.post("/__fixture__/release", (context) => {
    releasePaused?.();
    return context.json({ released: releasePaused !== undefined });
  });
  app.post("/__fixture__/outcome/:outcome", (context) => {
    const outcome = context.req.param("outcome");
    if (!isFixtureOutcome(outcome)) return context.json({ error: "unsupported outcome" }, 400);
    const requestId = `request-${outcome}`;
    const traceId =
      outcome === "defect"
        ? "44444444444444444444444444444444"
        : outcome === "timeout"
          ? "55555555555555555555555555555555"
          : "66666666666666666666666666666666";
    const fixture = makeOutcomeRecords(requestId, traceId, outcome, now);
    requests = [fixture.request, ...requests.filter((item) => item.requestId !== requestId)];
    traces = [...fixture.records, ...traces.filter((item) => item.traceId !== traceId)];
    stream.publish({ type: "request.completed", data: fixture.request });
    for (const record of fixture.records.filter((item) => item.signal === "span"))
      stream.publish({ type: "span.completed", data: record });
    return context.json({ requestId, traceId });
  });
  app.post("/__fixture__/reset", (context) => {
    reset();
    return context.json({ ok: true });
  });
  app.post("/__fixture__/logs", (context) => {
    logs = Array.from({ length: 65 }, (_, index) => ({
      ...makeLog(
        String(100 + index),
        INITIAL_TRACE_ID,
        "orders.create",
        index % 2 ? "Order processed" : "Cache lookup",
      ),
      timestamp: now,
      level: ["debug", "info", "warn", "error"][index % 4]!,
      fields: {
        customer: "Alice",
        detail: "Retained metadata ".repeat(30),
        ...(index % 4 === 3
          ? {
              error: {
                name: "Error",
                message: "Connection refused",
                cause: { message: "Upstream unavailable" },
              },
            }
          : {}),
      },
    }));
    return context.json({ ok: true });
  });
  app.get("/_relkit/v1/storage", (context) =>
    context.json(
      { protocol: "relkit.observability.query", version: 1, state: "ready", failed: 0, dropped: 0 },
      200,
      { "x-relkit-api-version": "1" },
    ),
  );
  app.post("/__fixture__/candidate", async (context) => {
    const body = await context.req.json<{ invalid?: boolean }>();
    invalidCandidate = body.invalid === true;
    stream.publish({
      type: "diagnostic.changed",
      data: invalidCandidate
        ? {
            version: 1,
            signal: "diagnostic",
            code: "RELKIT_FIXTURE_COMPILE_ERROR",
            severity: "error",
            message: "Candidate source is invalid.",
            file: "src/routes/orders.route.ts",
            line: 8,
            column: 1,
          }
        : {
            version: 1,
            signal: "diagnostic",
            code: "RELKIT_FIXTURE_CANDIDATE_READY",
            severity: "info",
            message: "Candidate is ready.",
          },
    });
    return context.json({ invalidCandidate });
  });

  function reset(): void {
    releasePaused?.();
    releasePaused = undefined;
    invalidCandidate = false;
    jobState = "dead-lettered";
    requestSequence = 1;
    requests = [...initialRequests];
    logs = [...initialLogs];
    traces = [...initialTraces];
  }

  function makeGeneration(): InspectorActiveGeneration {
    return {
      generationId: FIXTURE_GENERATION_ID,
      graphHash: FIXTURE_GRAPH_HASH,
      graph,
      diagnostics: [],
      ...(invalidCandidate
        ? {
            candidate: {
              generationId: "commerce-candidate-2",
              graphHash: "sha256:commerce-candidate-invalid",
              sourceVersion: 2,
              state: "candidate",
              status: "invalid",
              diagnostics: [
                {
                  code: "RELKIT_FIXTURE_COMPILE_ERROR",
                  severity: "error",
                  message: "Candidate source is invalid.",
                  file: "src/routes/orders.route.ts",
                  line: 8,
                  column: 1,
                },
              ],
            },
          }
        : {}),
      runtime: {
        functions: [
          { id: FIXTURE_IDS.function, functionId: FIXTURE_IDS.function, status: "ready" },
        ],
        jobs: () => [
          {
            id: FIXTURE_IDS.jobInstance,
            jobId: FIXTURE_IDS.job,
            instanceId: FIXTURE_IDS.jobInstance,
            state: jobState,
            attempt: 3,
            acceptedAt: now,
            failure: { code: "RECEIPT_DELIVERY_FAILED", message: "safe fixture failure" },
          },
        ],
        events: {
          query: async () => ({
            protocol: "relkit.events.admin",
            version: PROTOCOL_VERSION,
            events: eventContracts,
            triggers: [eventTrigger],
            capabilities: [
              {
                triggerId: FIXTURE_IDS.trigger,
                delivery: "durable",
                persistence: "local",
                restartRecovery: true,
                atLeastOnce: true,
                exactlyOnce: false,
                ordering: "unsupported",
                orderedByKey: false,
              },
            ],
            publications: eventPublications,
            deliveries: eventDeliveries,
          }),
        },
        buckets: [
          {
            id: FIXTURE_IDS.bucket,
            bucketId: FIXTURE_IDS.bucket,
            profile: "default",
            state: "ready",
            capabilities: ["read", "write"],
          },
          { id: "archive", bucketId: "archive", profile: "custom", state: "ready" },
          { id: "broken", bucketId: "broken", profile: "broken", state: "failed" },
        ],
        cache: [
          {
            id: FIXTURE_IDS.cache,
            cacheId: FIXTURE_IDS.cache,
            profile: "default",
            state: "ready",
            capabilities: ["increment"],
            entries: 2,
            hits: 4,
            misses: 1,
          },
        ],
        tools: [
          {
            id: FIXTURE_IDS.tool,
            toolId: FIXTURE_IDS.tool,
            state: "pending",
            invocationId: "agent-invocation-1",
            toolCallId: "tool-call-1",
            approval: "pending",
          },
        ],
        agents: [
          {
            id: FIXTURE_IDS.agent,
            agentId: FIXTURE_IDS.agent,
            state: "completed",
            status: "completed",
            invocationId: "agent-invocation-1",
            startedAt: now,
            completedAt: now,
          },
        ],
      },
      observedEdges: [
        { kind: "cache.get", from: FIXTURE_IDS.function, to: FIXTURE_IDS.cache },
        { kind: "event.publish", from: FIXTURE_IDS.function, to: FIXTURE_IDS.event },
      ],
      actions: actionServices,
      resources: {
        buckets: {
          supports: (bucketId) => bucketId === FIXTURE_IDS.bucket || bucketId === "broken",
          list: ({ bucketId, prefix = "", cursor, limit }) => {
            if (bucketId === "broken") throw new Error("seeded provider failure");
            const items = bucketFixtures.filter((item) => item.key.startsWith(prefix));
            const start = cursor === undefined ? 0 : Number(cursor);
            const selected = items.slice(start, start + limit);
            return {
              items: selected.map((item) => ({
                key: item.key,
                metadata: {
                  contentType: item.type,
                  size: new TextEncoder().encode(item.body).byteLength,
                },
              })),
              ...(start + selected.length < items.length
                ? { nextCursor: String(start + selected.length) }
                : {}),
            };
          },
          preview: ({ key, offset, limit }) => {
            const item = bucketFixtures.find((candidate) => candidate.key === key);
            if (item === undefined) return undefined;
            const bytes = new TextEncoder().encode(item.body);
            return {
              bytes: bytes.slice(offset, offset + limit),
              metadata: { contentType: item.type, size: bytes.byteLength },
              totalBytes: bytes.byteLength,
            };
          },
        },
        cache: {
          supports: (cacheId) => cacheId === FIXTURE_IDS.cache,
          scan: ({ search = "", cursor, limit }) => {
            const items = cacheFixtures.filter((item) => item.key.includes(search));
            const start = cursor === undefined ? 0 : Number(cursor);
            const selected = items.slice(start, start + limit);
            return {
              items: selected.map((item) => ({
                key: item.key,
                type: "string",
                ttlMs: item.ttlMs,
                bytes: JSON.stringify(item.value).length,
              })),
              ...(start + selected.length < items.length
                ? { nextCursor: String(start + selected.length) }
                : {}),
            };
          },
          value: ({ key, limit }) => {
            const item = cacheFixtures.find((candidate) => candidate.key === key);
            if (item === undefined) return undefined;
            const bytes = JSON.stringify(item.value).length;
            return {
              key,
              type: "string",
              ttlMs: item.ttlMs,
              bytes,
              ...(bytes > limit ? { truncated: true } : { value: item.value, truncated: false }),
            };
          },
        },
      },
    };
  }

  return {
    app,
    stream,
    baseUrl: FIXTURE_BASE_URL,
    reset,
    setInvalidCandidate: (enabled) => {
      invalidCandidate = enabled;
    },
    state: () => ({ invalidCandidate, jobState }),
  };
}

function makeQuery(
  read: () => {
    requests: readonly Record<string, unknown>[];
    logs: readonly Record<string, unknown>[];
    traces: readonly Record<string, unknown>[];
  },
): ObservabilityQuery {
  return {
    requests: async (query = {}) => page(filter(read().requests, query), query),
    logs: async (query = {}) => {
      const items = filter(read().logs, query).filter(
        (item) =>
          (!query.search ||
            JSON.stringify(item).toLowerCase().includes(query.search.toLowerCase())) &&
          (!query.severity || item.level === query.severity) &&
          (!query.source || item.origin === query.source),
      );
      items.sort((a, b) =>
        query.order === "desc"
          ? Number(b.cursor) - Number(a.cursor)
          : Number(a.cursor) - Number(b.cursor),
      );
      return page(items, query);
    },
    traces: async (query = {}) => page(filter(read().traces, query), query),
    request: async (id) => {
      const request = read().requests.find((item) => item.requestId === id);
      if (request === undefined) return undefined;
      const related = [...read().requests, ...read().traces, ...read().logs].filter(
        (item) =>
          item.requestId === id || item.originRequestId === id || item.traceId === request.traceId,
      );
      const detail = assembleRequestExecution(related as never, id);
      return detail === undefined
        ? undefined
        : ({
            protocol: "relkit.observability.query",
            version: 1,
            ...detail,
          } as never);
    },
    log: async (cursor) => {
      const log = read().logs.find((item) => item.cursor === cursor);
      return log === undefined
        ? undefined
        : ({ protocol: "relkit.observability.query", version: 1, log } as never);
    },
    trace: async (id) => {
      const records = read().traces.filter((item) => item.traceId === id);
      const trace = records.find((item) => item.signal === "trace");
      return trace === undefined
        ? undefined
        : ({
            protocol: "relkit.observability.query",
            version: 1,
            trace,
            spans: records.filter((item) => item.signal === "span"),
            records,
          } as never);
    },
  };
}

function page(items: readonly Record<string, unknown>[], query: ObservabilityQueryRequest) {
  const cursor = integer(query.cursor) ?? 0;
  const limit = Math.min(query.limit ?? 50, 100);
  const selected = items.slice(cursor, cursor + limit);
  return {
    protocol: "relkit.observability.query" as const,
    version: 1 as const,
    items: selected,
    ...(cursor + selected.length < items.length
      ? { nextCursor: String(cursor + selected.length) }
      : {}),
  } as never;
}

function filter(items: readonly Record<string, unknown>[], query: ObservabilityQueryRequest) {
  const keys: readonly (keyof ObservabilityQueryRequest)[] = [
    "routeId",
    "functionId",
    "outcome",
    "requestId",
    "traceId",
  ];
  return items.filter((item) =>
    keys.every(
      (key) =>
        query[key] === undefined || item[key] === query[key] || item.correlationId === query[key],
    ),
  );
}

function integer(value: unknown): number | undefined {
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined;
}

function makeRequest(id: string, traceId: string, at: string, input: Record<string, unknown> = {}) {
  return {
    version: 2,
    signal: "request",
    phase: "completed",
    requestId: id,
    traceId,
    generationId: FIXTURE_GENERATION_ID,
    graphHash: FIXTURE_GRAPH_HASH,
    invocationId: `${id}:invocation`,
    startedAt: at,
    completedAt: at,
    durationMs: 12,
    method: "POST",
    rawPath: "/orders",
    normalizedRoute: "/orders",
    routeId: FIXTURE_IDS.route,
    functionId: FIXTURE_IDS.function,
    status: 201,
    requestBytes: JSON.stringify(input).length,
    responseBytes: 72,
    outcome: "success",
  };
}

function makeActiveRequest(id: string, traceId: string, at: string) {
  return {
    version: 2,
    signal: "request",
    phase: "started",
    requestId: id,
    traceId,
    generationId: FIXTURE_GENERATION_ID,
    graphHash: FIXTURE_GRAPH_HASH,
    startedAt: at,
    method: "POST",
    rawPath: "/orders",
  };
}

function makeActiveTraceRecords(traceId: string, requestId: string, at: string) {
  return makeTraceRecords(traceId, requestId, at).map((record) => {
    const {
      completedAt: _completedAt,
      durationMs: _durationMs,
      outcome: _outcome,
      ...active
    } = record;
    if (record.signal === "trace") return { ...active, spanCount: 2 };
    if (record.signal === "invocation") return { ...active, status: "started" };
    return {
      ...active,
      status: "started",
      revision: 0,
      ...(record.name === "HTTP POST /orders" ? { events: record.events?.slice(0, 4) } : {}),
    };
  });
}

function makeContinuationRecords(originRequestId: string, parentTraceId: string, at: string) {
  const traceId = "33333333333333333333333333333333";
  const spanId = fixtureSpanId(traceId, "1");
  return [
    {
      version: 2,
      signal: "trace",
      traceId,
      rootSpanId: spanId,
      startedAt: at,
      completedAt: at,
      durationMs: 3,
      spanCount: 1,
      outcome: "success",
      originRequestId,
    },
    {
      version: 2,
      signal: "span",
      traceId,
      spanId,
      originRequestId,
      name: "relkit.event.orders.created.deliver",
      kind: "consumer",
      status: "completed",
      revision: 1,
      startedAt: at,
      completedAt: at,
      durationMs: 3,
      outcome: "success",
      links: [{ traceId: parentTraceId, spanId: fixtureSpanId(parentTraceId, "1") }],
      attributes: { "relkit.event.id": "orders.created", "relkit.delivery.attempt": 1 },
    },
  ];
}

type FixtureOutcome = "defect" | "timeout" | "cancelled";

function isFixtureOutcome(value: string): value is FixtureOutcome {
  return value === "defect" || value === "timeout" || value === "cancelled";
}

function makeOutcomeRecords(
  requestId: string,
  traceId: string,
  outcome: FixtureOutcome,
  at: string,
) {
  const status = outcome === "timeout" ? 504 : outcome === "cancelled" ? 499 : 500;
  const request = { ...makeRequest(requestId, traceId, at), outcome, status };
  const records = makeTraceRecords(traceId, requestId, at).map((record) => {
    if (record.signal === "trace") return { ...record, outcome };
    if (record.signal === "invocation") return { ...record, status: outcome };
    if (record.signal !== "span") return record;
    return {
      ...record,
      outcome,
      ...(record.name === "HTTP POST /orders"
        ? {
            attributes: {
              ...record.attributes,
              "http.response.status_code": status,
              "error.type": outcome === "timeout" ? "TimeoutError" : "RequestError",
              "error.message": `safe ${outcome} fixture`,
            },
            events: [...(record.events ?? []), { name: `http.${outcome}`, timestamp: at }],
            dropped: { attributes: 2, events: 1, links: 0, updates: 0 },
          }
        : {}),
    };
  });
  records.push({
    version: 2,
    signal: "span",
    traceId,
    spanId: fixtureSpanId(traceId, "4"),
    parentSpanId: "ffffffffffffffff",
    requestId,
    name: "retained.orphan",
    kind: "internal",
    revision: 1,
    status: "completed",
    startedAt: at,
    completedAt: at,
    durationMs: 1,
    outcome,
  });
  return { request, records };
}

function makeTraceRecords(traceId: string, requestId: string, at: string) {
  const rootSpanId = fixtureSpanId(traceId, "1");
  const invocationSpanId = fixtureSpanId(traceId, "2");
  const operationSpanId = fixtureSpanId(traceId, "3");
  return [
    {
      version: 2,
      signal: "trace",
      traceId,
      rootInvocationId: `${requestId}:invocation`,
      rootSpanId,
      startedAt: at,
      completedAt: at,
      durationMs: 12,
      spanCount: 2,
      outcome: "success",
      requestId,
    },
    {
      version: 2,
      signal: "span",
      spanId: rootSpanId,
      traceId,
      requestId,
      name: "HTTP POST /orders",
      kind: "server",
      revision: 1,
      status: "completed",
      startedAt: at,
      completedAt: at,
      durationMs: 12,
      outcome: "success",
      attributes: {
        "http.request.method": "POST",
        "http.route": "/orders",
        "http.response.status_code": 201,
        "relkit.request.id": requestId,
      },
      resourceAttributes: { "service.name": "commerce-api" },
      events: [
        { name: "http.request.received", timestamp: at },
        {
          name: "http.route.matched",
          timestamp: at,
          attributes: { "relkit.route.id": FIXTURE_IDS.route },
        },
        { name: "http.request.mapped", timestamp: at },
        { name: "http.request.validated", timestamp: at },
        {
          name: "http.response.headers",
          timestamp: at,
          attributes: { "http.response.status_code": 201 },
        },
        { name: "http.response.completed", timestamp: at },
      ],
      dropped: { attributes: 0, events: 0, links: 0, updates: 0 },
    },
    {
      version: 2,
      signal: "span",
      spanId: invocationSpanId,
      invocationId: `${requestId}:invocation`,
      traceId,
      requestId,
      name: "relkit.invoke.orders.create",
      functionId: FIXTURE_IDS.function,
      parentSpanId: rootSpanId,
      kind: "internal",
      revision: 1,
      status: "completed",
      startedAt: at,
      completedAt: at,
      durationMs: 12,
      outcome: "success",
    },
    {
      version: 2,
      signal: "span",
      spanId: operationSpanId,
      invocationId: `${requestId}:invocation`,
      traceId,
      requestId,
      name: "prices.getOrSet",
      parentSpanId: invocationSpanId,
      kind: "client",
      revision: 1,
      status: "completed",
      startedAt: at,
      completedAt: at,
      durationMs: 2,
      outcome: "success",
    },
    {
      version: 2,
      signal: "invocation",
      id: `${requestId}:invocation`,
      requestId,
      functionId: FIXTURE_IDS.function,
      traceId,
      source: "http",
      status: "success",
      attempt: 1,
      startedAt: at,
      completedAt: at,
      durationMs: 12,
    },
  ];
}

function fixtureSpanId(traceId: string, prefix: string): string {
  return `${prefix}${traceId.slice(-15)}`;
}

function makeLog(
  cursor: string,
  traceId: string,
  functionId: string,
  message: string,
  requestId?: string,
) {
  return {
    version: 2,
    signal: "log",
    cursor,
    timestamp: new Date().toISOString(),
    level: "info",
    origin: "application",
    spanId: fixtureSpanId(traceId, "2"),
    component: "fixture",
    message,
    fields: {},
    traceId,
    functionId,
    ...(requestId === undefined ? {} : { requestId }),
  };
}
