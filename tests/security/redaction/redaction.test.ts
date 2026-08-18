import { Effect } from "../../../packages/runtime-effect/node_modules/effect/dist/index.js";
import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "../../../packages/inspector-api/node_modules/hono/dist/index.js";
import { z } from "../../../packages/schema/src/index.ts";
import { defineAgent } from "../../../packages/agents/src/index.ts";
import {
  type InvocationContextOptions,
  type InvocationHooks,
  type InvocationTarget,
} from "../../../packages/engine/src/index.ts";
import { API_BASE_PATH } from "../../../packages/contracts/src/index.ts";
import type { RegistrationPlan } from "../../../packages/graph/src/index.ts";
import {
  createObservabilityCollector,
  createObservabilityIndex,
  createObservabilityQuery,
  createObservabilitySegmentStore,
  createObservabilityStream,
  type LogRecord,
  type ObservabilityCollector,
  type ObservabilityRecord,
} from "../../../packages/observability/src/index.ts";
import {
  createTestAgent,
  createTestEvent,
  createTestJob,
} from "../../../packages/testing/src/index.ts";
import {
  createApp,
  type InternalEndpointOptions,
  type RuntimeManifest,
} from "../../../packages/runtime-hono/src/index.ts";
import {
  createLoggerLayer,
  type HumanLogSink,
  type JsonLogSink,
} from "../../../packages/runtime-effect/src/logger.ts";
import { installObservabilityEndpoints } from "../../../packages/inspector-api/src/index.ts";

const secrets = Object.freeze({
  password: "super-secret-password",
  authorization: "Bearer top-secret-token",
  cookie: "session=secret-cookie",
  apiKey: "sk-secret",
});
const flowInput = Object.freeze({
  password: secrets.password,
  authorization: secrets.authorization,
  cookie: secrets.cookie,
  OPENAI_API_KEY: secrets.apiKey,
});
const source = { file: "tests/security/redaction/redaction.test.ts", line: 1, column: 1 } as const;
const retry = {
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
} as const;

test("recursively finds no synthetic secret in observable flows or sinks", async () => {
  const collector = createObservabilityCollector();
  const terminal: string[] = [];
  const jsonLogs: LogRecord[] = [];
  await emitLoggerRecord(collector, terminal, jsonLogs);
  await runAgent(collector);
  await runJob(collector);
  await runEvent(collector);
  await flushTelemetry();

  const runtime = createHttpRuntime(collector);
  const publicResponse = await runtime.request("http://zsys.test/security?token=top-secret-token", {
    method: "POST",
    headers: {
      authorization: secrets.authorization,
      cookie: secrets.cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify(flowInput),
  });
  assertNoSecrets("public HTTP response", await publicResponse.text());
  const flowRecords = collector.read();
  expect(
    flowRecords.some(
      (record) => record.signal === "span" && record.functionId?.startsWith("zsys.agent.") === true,
    ),
  ).toBe(true);
  expect(
    flowRecords.some((record) => record.signal === "invocation" && record.source === "job"),
  ).toBe(true);
  expect(
    flowRecords.some((record) => record.signal === "invocation" && record.source === "event"),
  ).toBe(true);
  expect(flowRecords.some((record) => record.signal === "request")).toBe(true);

  const root = await mkdtemp(join("/tmp", "zsys-security-redaction-"));
  let index: Awaited<ReturnType<typeof createObservabilityIndex>> | undefined;
  try {
    index = await createObservabilityIndex({ root, maxEntries: 200 });
    const store = await createObservabilitySegmentStore({ root, index });
    for (const record of [
      ...collector.read(),
      unsafeLog(),
      unsafeRequest(),
      unsafeTrace(),
      unsafeSpan(),
      unsafeJob(),
      unsafeEvent(),
    ])
      await store.append(record);
    await store.shutdown();

    const query = createObservabilityQuery(index, { maxDetailRecords: 100 });
    assertNoSecrets("in-memory collector", collector.read());
    const requestPage = await query.requests({ requestId: "security.request" });
    const logPage = await query.logs();
    const traceDetails = await query.trace("security.trace");
    expect(requestPage.items.length).toBeGreaterThan(0);
    expect(logPage.items.length).toBeGreaterThan(0);
    expect(traceDetails).toBeDefined();
    assertNoSecrets("request query", requestPage);
    assertNoSecrets("log query", logPage);
    assertNoSecrets("trace query", traceDetails);
    assertNoSecrets("terminal capture", terminal);
    assertNoSecrets("JSON log capture", jsonLogs);
    assertNoSecrets("NDJSON segments", await readTree(root));

    const inspector = new Hono();
    const stream = createObservabilityStream();
    stream.publish({ type: "log.emitted", data: unsafeLog() });
    installObservabilityEndpoints(inspector, { query, stream });
    const apiRuntime = createHttpRuntime(collector, {
      requests: requestPage,
      logs: logPage,
      traces: traceDetails?.records ?? [],
      stream: () => stream.replay().events,
    });
    for (const path of [
      `${API_BASE_PATH}/requests?requestId=security.request`,
      `${API_BASE_PATH}/requests/security.request`,
      `${API_BASE_PATH}/logs`,
      `${API_BASE_PATH}/traces/security.trace`,
    ])
      assertNoSecrets(`inspector API ${path}`, await (await inspector.request(path)).text());
    const sse = await inspector.request(`${API_BASE_PATH}/stream`, {
      headers: { "last-event-id": "0" },
    });
    const reader = sse.body!.getReader();
    const first = await reader.read();
    await reader.cancel();
    assertNoSecrets("SSE", new TextDecoder().decode(first.value));

    for (const path of [
      `${API_BASE_PATH}/requests`,
      `${API_BASE_PATH}/logs`,
      `${API_BASE_PATH}/traces`,
      `${API_BASE_PATH}/stream`,
    ]) {
      const response = await apiRuntime.request(`http://zsys.test${path}`);
      assertNoSecrets(`runtime API ${path}`, await response.text());
    }
  } finally {
    await index?.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function emitLoggerRecord(
  collector: ObservabilityCollector,
  terminal: string[],
  jsonLogs: LogRecord[],
): Promise<void> {
  const human: HumanLogSink = { write: (line) => terminal.push(line) };
  const json: JsonLogSink = { write: (record) => jsonLogs.push(record) };
  await Effect.runPromise(
    Effect.logInfo(
      `password=${secrets.password} authorization=${secrets.authorization} cookie=${secrets.cookie}`,
    ).pipe(
      Effect.annotateLogs({
        password: secrets.password,
        authorization: secrets.authorization,
        cookie: secrets.cookie,
        environment: { OPENAI_API_KEY: secrets.apiKey },
      }),
      Effect.provide(createLoggerLayer({ component: "security.test", human, json, collector })),
    ),
  );
}

async function flushTelemetry(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function runAgent(collector: ObservabilityCollector): Promise<void> {
  const agent = defineAgent({
    id: "security.agent",
    input: z.object({
      password: z.string(),
      authorization: z.string(),
      cookie: z.string(),
      OPENAI_API_KEY: z.string(),
    }),
    output: z.object({ answer: z.string() }),
    modelProfile: "default",
    instructions: "Return a safe answer.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
  });
  const harness = createTestAgent({
    agent,
    tools: [],
    engine: { invoke: async () => undefined },
    script: [{ type: "final", output: { answer: "safe" } }],
    capture: { mode: "development-redacted", maxBytes: 4_096, redactKeys: ["OPENAI_API_KEY"] },
    hooks: { observability: collector },
  });
  await harness.invoke(flowInput);
  assertNoSecrets("agent trace capture", harness.trace.read());
}

async function runJob(collector: ObservabilityCollector): Promise<void> {
  const job = await createTestJob({
    jobId: "security.job",
    target: flowTarget("security.job"),
    retry,
    hooks: hooks(collector),
  });
  try {
    await job.enqueue(flowInput);
    await job.drain();
    assertNoSecrets("job admin API", job.admin.query());
  } finally {
    await job.close();
  }
}

async function runEvent(collector: ObservabilityCollector): Promise<void> {
  const event = await createTestEvent({
    eventId: "security.event",
    version: 1,
    payloadSchema: z.object({
      password: z.string(),
      authorization: z.string(),
      cookie: z.string(),
      OPENAI_API_KEY: z.string(),
    }),
    target: {
      ...flowTarget("security.event-handler"),
      input: z.unknown(),
    },
    retry,
    hooks: hooks(collector),
  });
  try {
    await event.publish(flowInput);
    await event.drain();
  } finally {
    await event.close();
  }
}

function flowTarget(id: string): InvocationTarget<typeof flowInput, { readonly ok: boolean }> {
  return {
    id,
    input: z.object({
      password: z.string(),
      authorization: z.string(),
      cookie: z.string(),
      OPENAI_API_KEY: z.string(),
    }),
    output: z.object({ ok: z.boolean() }),
    handler: async (_input, context) => {
      context.log.info("flow.credentials", flowInput);
      return { ok: true };
    },
  };
}

function hooks(collector: ObservabilityCollector): InvocationHooks {
  return { observability: collector, context: flowContext(collector) };
}

function flowContext(collector: ObservabilityCollector): InvocationHooks["context"] {
  return ({ invocation, signal, env, time }: InvocationContextOptions) => {
    const write = (message: string, fields?: Readonly<Record<string, unknown>>) =>
      collector.collect(secretLog("flow", message, fields));
    return {
      invocation,
      signal,
      env,
      time,
      log: { trace: write, debug: write, info: write, warn: write, error: write },
      functions: {},
      jobs: {},
      events: {},
      buckets: {},
      cache: {},
      agents: {},
    };
  };
}

function createHttpRuntime(
  collector: ObservabilityCollector,
  internalEndpoints: InternalEndpointOptions = {},
) {
  return createApp({
    plan: {
      graphHash: "sha256:security",
      functions: [],
      httpTriggers: [
        {
          kind: "trigger",
          id: "security.route",
          source,
          triggerType: "http",
          targetFunctionId: "security.handler",
          config: {
            method: "POST",
            path: "/security",
            request: { kind: "input", fields: {} },
            responses: [],
            middleware: [],
            transforms: [],
          },
        },
      ],
      queues: [],
      schedules: [],
      eventTriggers: [],
      buckets: [],
      caches: [],
      tools: [],
      agents: [],
    } satisfies RegistrationPlan,
    manifest: {
      contractVersion: 1,
      generatorVersion: 1,
      graphHash: "sha256:security",
      functions: {},
      middleware: {},
      requestTransforms: {},
    } satisfies RuntimeManifest,
    generationId: "security-generation",
    observability: collector,
    internalEndpoints,
    middleware: { requestId: () => "security.request", traceId: () => "security.trace" },
    engine: { invoke: async () => ({ ok: true }) },
  });
}

function secretLog(
  component: string,
  message: string,
  fields: Readonly<Record<string, unknown>> = flowInput,
): ObservabilityRecord {
  return {
    version: 1,
    signal: "log",
    timestamp: "2026-08-16T00:00:00.000Z",
    level: "info",
    component,
    message,
    fields,
  } as unknown as ObservabilityRecord;
}

function unsafeLog(): ObservabilityRecord {
  return secretLog("security.unsafe", "credentials", {
    ...flowInput,
    environment: { OPENAI_API_KEY: secrets.apiKey },
  });
}

function unsafeRequest(): ObservabilityRecord {
  return {
    version: 1,
    signal: "request",
    requestId: "security.request",
    traceId: "security.trace",
    generationId: "security-generation",
    graphHash: "sha256:security",
    invocationId: "security.invocation",
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:00:00.001Z",
    durationMs: 1,
    method: "POST",
    rawPath: "/security?token=top-secret-token",
    normalizedRoute: "security.route",
    routeId: "security.route",
    functionId: "security.handler",
    status: 200,
    outcome: "success",
    timeline: [],
    headers: { authorization: secrets.authorization, cookie: secrets.cookie },
    requestBody: flowInput,
  } as unknown as ObservabilityRecord;
}

function unsafeTrace(): ObservabilityRecord {
  return {
    version: 1,
    signal: "trace",
    traceId: "security.trace",
    startedAt: "2026-08-16T00:00:00.000Z",
    spanCount: 1,
    outcome: "success",
    attributes: flowInput,
  } as unknown as ObservabilityRecord;
}

function unsafeSpan(): ObservabilityRecord {
  return {
    version: 1,
    signal: "span",
    spanId: "security.span",
    invocationId: "security.invocation",
    traceId: "security.trace",
    name: "security.handler",
    status: "completed",
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:00:00.001Z",
    attributes: flowInput,
  } as unknown as ObservabilityRecord;
}

function unsafeJob(): ObservabilityRecord {
  return {
    version: 1,
    signal: "job",
    jobId: "security.job",
    instanceId: "security.job.1",
    functionId: "security.job",
    profile: "default",
    state: "completed",
    attempt: 1,
    acceptedAt: "2026-08-16T00:00:00.000Z",
    input: flowInput,
  } as unknown as ObservabilityRecord;
}

function unsafeEvent(): ObservabilityRecord {
  return {
    version: 1,
    signal: "event",
    kind: "publication",
    eventId: "security.event",
    eventVersion: 1,
    instanceId: "security.event.1",
    state: "published",
    occurredAt: "2026-08-16T00:00:00.000Z",
    payload: flowInput,
  } as unknown as ObservabilityRecord;
}

async function readTree(root: string): Promise<readonly string[]> {
  const values: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) values.push(await readFile(child, "utf8"));
    }
  }
  await visit(root);
  return values;
}

function assertNoSecrets(label: string, value: unknown): void {
  const leaks: string[] = [];
  const visit = (current: unknown, path: string): void => {
    if (typeof current === "string") {
      for (const [name, secret] of Object.entries(secrets))
        if (current.includes(secret)) leaks.push(`${path}.${name}`);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (current !== null && typeof current === "object")
      Object.entries(current).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(value, "$");
  if (leaks.length > 0)
    throw new Error(`${label} contains raw synthetic secret at ${leaks.join(", ")}`);
}
