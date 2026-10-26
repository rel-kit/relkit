/** Retains the original redaction flows helpers and exact synthetic credential assertions. */
import { Effect } from "../../../packages/runtime-effect/node_modules/effect/dist/index.js";
import { z } from "../../../packages/schema/src/index.ts";
import { defineEventFunction } from "../../../packages/events/src/index.ts";
import { defineAgent } from "../../../integrations/packages/langchain/src/index.ts";
import {
  type InvocationContextOptions,
  type InvocationHooks,
  type InvocationTarget,
} from "../../../packages/engine/src/index.ts";
import {
  type LogRecord,
  type ObservabilityCollector,
} from "../../../packages/observability/src/index.ts";
import { createTestAgent } from "../../../integrations/packages/langchain/src/testing/agents.js";
import { createTestEvent, createTestJob } from "../../../packages/testing/src/index.ts";
import {
  createLoggerLayer,
  type HumanLogSink,
  type JsonLogSink,
} from "../../../packages/runtime-effect/src/logger.ts";
import { secrets, flowInput, retry, secretLog } from "./redaction-records.fixture.js";
import { assertNoSecrets } from "./redaction-runtime.fixture.js";
export async function emitLoggerRecord(
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

export async function flushTelemetry(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export async function runAgent(collector: ObservabilityCollector) {
  const agent = defineAgent({
    id: "security.agent",
    input: z.object({
      password: z.string(),
      authorization: z.string(),
      cookie: z.string(),
      OPENAI_API_KEY: z.string(),
    }),
    output: z.object({ answer: z.string() }),
    model: "default",
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
  try {
    await harness.invoke(flowInput);
    const trace = harness.trace.read();
    assertNoSecrets("agent trace capture", trace);
    return trace;
  } finally {
    await harness.close();
  }
}

export async function runJob(collector: ObservabilityCollector): Promise<void> {
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

export async function runEvent(collector: ObservabilityCollector): Promise<void> {
  const event = await createTestEvent({
    eventId: "security.event",
    version: 1,
    payloadSchema: z.object({
      password: z.string(),
      authorization: z.string(),
      cookie: z.string(),
      OPENAI_API_KEY: z.string(),
    }),
    target: defineEventFunction({
      id: "security.event-handler",
      event: "security.event" as never,
      handler: async (input, context) => {
        await flowTarget("security.event-handler").handler(input, context);
      },
    }),
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

export function flowTarget(
  id: string,
): InvocationTarget<typeof flowInput, { readonly ok: boolean }> {
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

export function hooks(collector: ObservabilityCollector): InvocationHooks {
  return { observability: collector, context: flowContext(collector) };
}

export function flowContext(collector: ObservabilityCollector): InvocationHooks["context"] {
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
