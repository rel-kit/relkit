import { Hono } from "../../packages/inspector-api/node_modules/hono";
// @ts-expect-error The workspace package exposes this runtime subpath without a relative declaration path.
import { cors } from "../../packages/inspector-api/node_modules/hono/dist/middleware/cors/index.js";
import { PROTOCOL_VERSION } from "../../packages/contracts/src/index.ts";
import {
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

const graph = {
  contractVersion: 1,
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
      id: "orders.project-order-change",
      input: { type: "object", properties: { eventId: schema("string") } },
      output: { type: "object" },
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
      payload: { type: "object", properties: { orderId: schema("string") } },
      sensitiveFields: ["customerEmail"],
      source: source("src/events/order-created.event.ts", 3),
    },
    {
      kind: "event",
      id: "orders.updated",
      version: 1,
      payload: { type: "object", properties: { orderId: schema("string") } },
      source: source("src/events/order-updated.event.ts", 3),
    },
    {
      kind: "event",
      id: "orders.cancelled",
      version: 1,
      payload: { type: "object", properties: { orderId: schema("string") } },
      source: source("src/events/order-cancelled.event.ts", 3),
    },
    {
      kind: "trigger",
      id: "orders.project-any-change",
      triggerType: "event",
      targetFunctionId: "orders.project-order-change",
      config: {
        expansion: ["orders.cancelled@1", "orders.created@1", "orders.updated@1"],
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
      modelProfile: "default",
      input: { type: "object", properties: { question: schema("string") } },
      output: { type: "object", properties: { answer: schema("string") } },
      toolIds: ["orders.get.tool"],
      generatedFunction: { functionId: "zsys.agent.support.order.invoke", generated: true },
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
    protocol: "zsys.events.admin",
    protocolVersion: PROTOCOL_VERSION,
    id,
    version: 1,
    payload: { type: "object", properties: { orderId: schema("string") } },
    ...(id === "orders.created" ? { sensitiveFields: ["customerEmail"] } : {}),
    source: source(`src/events/${id.split(".").at(-1)}.event.ts`, 3),
  })),
];

const eventTrigger = {
  protocol: "zsys.events.admin",
  version: PROTOCOL_VERSION,
  id: FIXTURE_IDS.trigger,
  targetFunctionId: "orders.project-order-change",
  selector: { kind: "anyOf" },
  expansion: ["orders.cancelled@1", "orders.created@1", "orders.updated@1"],
  delivery: "durable",
  profile: "default",
  retry: { maxAttempts: 3 },
  concurrency: 1,
};

const eventPublications = [
  {
    protocol: "zsys.events.admin",
    protocolVersion: PROTOCOL_VERSION,
    sequence: 1,
    timestamp: now,
    accepted: true,
    instanceId: "event-instance-1",
    eventId: FIXTURE_IDS.event,
    version: 1,
    occurredAt: now,
    publishedAt: now,
    traceId: "trace-initial",
    attributes: {},
  },
];

const eventDeliveries = [
  {
    protocol: "zsys.events.admin",
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

const initialRequests = [makeRequest("request-initial", "trace-initial", now)];
const initialLogs = [
  makeLog("1", "trace-initial", "orders.create", "Initial fixture request recorded."),
];
const initialTraces = [
  ...makeTraceRecords("trace-initial", "request-initial", now),
  {
    version: 1,
    signal: "span",
    spanId: "agent-trace-1:tool",
    invocationId: "agent-invocation-1",
    traceId: "agent-trace-1",
    name: "orders.agent.tool.orders.get.tool",
    kind: "tool",
    functionId: "zsys.agent.support.order.invoke",
    agentId: FIXTURE_IDS.agent,
    toolId: FIXTURE_IDS.tool,
    toolCallId: "tool-call-1",
    profile: "default",
    step: 1,
    status: "completed",
    outcome: "success",
    startedAt: now,
    completedAt: now,
    durationMs: 4,
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
  const stream = createObservabilityStream({ maxEvents: 100 });
  const actionServices: InspectorActionServices = {
    functions: {
      exists: async (id) => id === FIXTURE_IDS.function,
      invoke: async () => ({ ok: true, orderId: "order-100", totalCents: 1000 }),
    },
    jobs: {
      protocol: "zsys.jobs.admin",
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
    const traceId = `trace-live-${String(requestSequence).padStart(4, "0")}`;
    const request = makeRequest(id, traceId, now, body);
    requests = [request, ...requests];
    const records = makeTraceRecords(traceId, id, now);
    traces = [...records, ...traces];
    const log = makeLog(
      String(requestSequence + 1),
      traceId,
      FIXTURE_IDS.function,
      "Order request completed.",
    );
    logs = [log, ...logs];
    stream.publish({ type: "request.completed", data: request });
    stream.publish({ type: "span.completed", data: records[1]! });
    stream.publish({ type: "log.emitted", data: log });
    return context.json(
      { orderId: "order-100", receiptKey: "receipts/order-100.json", totalCents: 1000 },
      201,
      { "x-request-id": id, "x-trace-id": traceId },
    );
  });
  app.get("/orders/:orderId", (context) =>
    context.json({ orderId: context.req.param("orderId"), status: "confirmed", totalCents: 1000 }),
  );
  app.post("/__fixture__/reset", (context) => {
    reset();
    return context.json({ ok: true });
  });
  app.post("/__fixture__/candidate", async (context) => {
    const body = await context.req.json<{ invalid?: boolean }>();
    invalidCandidate = body.invalid === true;
    stream.publish({
      type: "diagnostic.changed",
      data: invalidCandidate
        ? {
            version: 1,
            signal: "diagnostic",
            code: "ZSYS_FIXTURE_COMPILE_ERROR",
            severity: "error",
            message: "Candidate source is invalid.",
            file: "src/routes/orders.route.ts",
            line: 8,
            column: 1,
          }
        : {
            version: 1,
            signal: "diagnostic",
            code: "ZSYS_FIXTURE_CANDIDATE_READY",
            severity: "info",
            message: "Candidate is ready.",
          },
    });
    return context.json({ invalidCandidate });
  });

  function reset(): void {
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
                  code: "ZSYS_FIXTURE_COMPILE_ERROR",
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
            protocol: "zsys.events.admin",
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
    logs: async (query = {}) => page(filter(read().logs, query), query),
    traces: async (query = {}) => page(filter(read().traces, query), query),
    request: async (id) => {
      const request = read().requests.find((item) => item.requestId === id);
      return request === undefined
        ? undefined
        : ({
            protocol: "zsys.observability.query",
            version: 1,
            request,
            records: relatedRecords(read().traces, id),
          } as never);
    },
    log: async (cursor) => {
      const log = read().logs.find((item) => item.cursor === cursor);
      return log === undefined
        ? undefined
        : ({ protocol: "zsys.observability.query", version: 1, log } as never);
    },
    trace: async (id) => {
      const records = read().traces.filter((item) => item.traceId === id);
      const trace = records.find((item) => item.signal === "trace");
      return trace === undefined
        ? undefined
        : ({
            protocol: "zsys.observability.query",
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
    protocol: "zsys.observability.query" as const,
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

function relatedRecords(items: readonly Record<string, unknown>[], requestId: string) {
  return items.filter((item) => item.requestId === requestId || item.correlationId === requestId);
}

function integer(value: unknown): number | undefined {
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined;
}

function makeRequest(id: string, traceId: string, at: string, input: Record<string, unknown> = {}) {
  return {
    version: 1,
    signal: "request",
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
    timeline: [
      { kind: "match", at, targetId: FIXTURE_IDS.route, status: 201 },
      { kind: "function", at, targetId: FIXTURE_IDS.function, outcome: "success" },
      { kind: "child", at, targetId: "prices.getOrSet", outcome: "success" },
      { kind: "response", at, status: 201, outcome: "success" },
    ],
  };
}

function makeTraceRecords(traceId: string, requestId: string, at: string) {
  return [
    {
      version: 1,
      signal: "trace",
      traceId,
      rootInvocationId: `${requestId}:invocation`,
      startedAt: at,
      completedAt: at,
      durationMs: 12,
      spanCount: 2,
      outcome: "success",
      requestId,
    },
    {
      version: 1,
      signal: "span",
      spanId: `${traceId}:function`,
      invocationId: `${requestId}:invocation`,
      traceId,
      requestId,
      name: "orders.create",
      functionId: FIXTURE_IDS.function,
      status: "completed",
      startedAt: at,
      completedAt: at,
      durationMs: 12,
      outcome: "success",
    },
    {
      version: 1,
      signal: "span",
      spanId: `${traceId}:cache`,
      invocationId: `${requestId}:invocation`,
      traceId,
      requestId,
      name: "prices.getOrSet",
      parentSpanId: `${traceId}:function`,
      status: "completed",
      startedAt: at,
      completedAt: at,
      durationMs: 2,
      outcome: "success",
    },
    {
      version: 1,
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

function makeLog(cursor: string, traceId: string, functionId: string, message: string) {
  return {
    version: 1,
    signal: "log",
    cursor,
    timestamp: now,
    level: "info",
    component: "fixture",
    message,
    fields: {},
    traceId,
    functionId,
  };
}
