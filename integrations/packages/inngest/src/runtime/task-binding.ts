import { createRequire } from "node:module";
import { parseTracePropagation } from "@relkit/contracts";
import type { TaskExecutor } from "@relkit/jobs";
import type { TaskExecutionBinding, TaskExecutionEnvelope } from "@relkit/jobs/adapter";
import type { Context, Inngest, InngestFunction } from "inngest";
import { mapInngestPolicy } from "./policy.js";

type InngestConstructor = typeof import("inngest").Inngest;
type InngestServe = typeof import("inngest/bun").serve;

export interface InngestSdk {
  readonly Inngest: InngestConstructor;
  readonly serve: InngestServe;
}

export function loadInngestSdk(): InngestSdk {
  const require = createRequire(import.meta.url);
  const module = require("inngest") as { readonly Inngest: InngestConstructor };
  const bun = require("inngest/bun") as { readonly serve: InngestServe };
  return Object.freeze({ Inngest: module.Inngest, serve: bun.serve });
}

export interface InngestTaskDefinition {
  readonly functionId: string;
  readonly eventName: string;
  readonly retries?: number;
  readonly timeoutSeconds?: number;
  readonly concurrency?: number;
  readonly policy?: unknown;
}

export function createInngestFunctionConfig(
  definition: InngestTaskDefinition,
): Readonly<Record<string, unknown>> {
  const policy = mapInngestPolicy(definition.policy);
  return Object.freeze({
    id: definition.functionId,
    triggers: [{ event: definition.eventName }],
    retries: definition.retries ?? policy.retries ?? 0,
    ...(definition.timeoutSeconds === undefined && policy.timeoutSeconds === undefined
      ? {}
      : { timeouts: { finish: `${definition.timeoutSeconds ?? policy.timeoutSeconds}s` } }),
    ...(definition.concurrency === undefined && policy.concurrency === undefined
      ? {}
      : { concurrency: { limit: definition.concurrency ?? policy.concurrency, scope: "fn" } }),
  });
}

export function inngestFunctionId(jobId: string, taskId: string, taskVersion: string, buildId: string): string {
  return ["relkit", jobId, taskId, taskVersion, buildId].map((value) => value.replace(/[^a-zA-Z0-9_.-]/gu, "-")).join("-");
}

export interface InngestWorkerOptions {
  readonly client: Inngest.Any;
  readonly definitions: readonly InngestTaskDefinition[];
  readonly executor: TaskExecutor;
  readonly servePath?: string;
  readonly serveOrigin?: string;
}

export type InngestWorkerRegistrationOptions = Omit<InngestWorkerOptions, "client">;

export interface InngestWorkerHandle {
  readonly path: string;
  readonly handler: (request: Request) => Promise<Response>;
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export function createInngestFunction(
  client: Inngest.Any,
  definition: InngestTaskDefinition,
  executor: TaskExecutor,
): InngestFunction.Any {
  return client.createFunction(createInngestFunctionConfig(definition) as never, async (ctx: Context) => {
    const data = record(ctx.event.data) ?? {};
    const native = record(data.relkit);
    const input = data.input;
    if (native === undefined || input === undefined) throw new Error("RELKIT_INNGEST_EVENT_INVALID");
    const envelope = envelopeFrom(ctx, native, input);
    const controller = new AbortController();
    const binding: TaskExecutionBinding = {
      run: {
        runId: envelope.runId,
        jobId: envelope.jobId,
        taskId: envelope.taskId,
        taskVersion: envelope.taskVersion,
        buildId: envelope.buildId,
        ...(envelope.service === undefined ? {} : { service: envelope.service }),
        ...(envelope.serviceGeneration === undefined ? {} : { serviceGeneration: envelope.serviceGeneration }),
        ...(envelope.attempt === undefined ? {} : { attempt: envelope.attempt }),
        ...(envelope.acceptedAt === undefined ? {} : { acceptedAt: envelope.acceptedAt }),
        ...(envelope.scheduledFor === undefined ? {} : { scheduledFor: envelope.scheduledFor }),
        ...(envelope.parentRunId === undefined ? {} : { parentRunId: envelope.parentRunId }),
        ...(envelope.scope === undefined ? {} : { scope: envelope.scope }),
        ...(envelope.inputSchemaHash === undefined ? {} : { inputSchemaHash: envelope.inputSchemaHash }),
        ...(envelope.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: envelope.acceptanceIdentity }),
        ...(envelope.propagation === undefined ? {} : { propagation: envelope.propagation }),
      },
      signal: controller.signal,
      sleep: {
        sleep: async (key, durationMs) => {
          await ctx.step.sleep(key, duration(durationMs));
        },
        sleepUntil: async (key, instant) => {
          await ctx.step.sleepUntil(key, instant);
        },
      },
    };
    return executor.execute(envelope, binding);
  });
}

export function createInngestWorker(options: InngestWorkerOptions): {
  readonly path: string;
  readonly handler: (request: Request) => Promise<Response>;
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
} {
  const path = options.servePath ?? "/api/inngest";
  const handler = createInngestServeHandler(options);
  const ready = async (): Promise<void> => {
    const target = new URL(`${options.serveOrigin ?? "http://127.0.0.1:3000"}${path}`);
    const response = await handler(new Request(target.toString(), { method: "PUT", headers: { host: target.host } }));
    if (!response.ok) throw new Error(`Inngest worker registration failed with status ${response.status}.`);
  };
  return Object.freeze({ path, handler, ready, close: async () => undefined });
}

export function createInngestServeHandler(options: InngestWorkerOptions): (request: Request) => Promise<Response> {
  const { serve } = loadInngestSdk();
  const functions = options.definitions.map((definition) =>
    createInngestFunction(options.client, definition, options.executor),
  );
  return serve({
    client: options.client,
    functions,
    servePath: options.servePath ?? "/api/inngest",
    ...(options.serveOrigin === undefined ? {} : { serveOrigin: options.serveOrigin }),
  });
}

function envelopeFrom(
  context: Context,
  native: Record<string, unknown>,
  input: unknown,
): TaskExecutionEnvelope {
  const wire = input as TaskExecutionEnvelope["input"];
  const inputHash = textOptional(native.inputHash);
  const inputSchemaHash = textOptional(native.inputSchemaHash);
  const acceptedAt = textOptional(native.acceptedAt);
  const nativeAttempt = number(native.attempt);
  const attempt = nativeAttempt === undefined
    ? context.attempt + 1
    : nativeAttempt > 0
      ? nativeAttempt
      : 1;
  const parentRunId = textOptional(native.parentRunId);
  const service = textOptional(native.service);
  const serviceGeneration = textOptional(native.serviceGeneration);
  const scope = textOptional(native.scope);
  const acceptanceIdentity = textOptional(native.acceptanceIdentity);
  const propagation = parseTracePropagation(native.propagation);
  return {
    runId: text(native.runId ?? context.runId),
    jobId: text(native.jobId),
    taskId: text(native.taskId),
    taskVersion: text(native.taskVersion),
    buildId: text(native.buildId),
    input: wire,
    ...(inputHash === undefined ? {} : { inputHash }),
    ...(inputSchemaHash === undefined ? {} : { inputSchemaHash }),
    ...(acceptedAt === undefined ? {} : { acceptedAt }),
    attempt,
    ...(parentRunId === undefined ? {} : { parentRunId }),
    ...(service === undefined ? {} : { service }),
    ...(serviceGeneration === undefined ? {} : { serviceGeneration }),
    ...(scope === undefined ? {} : { scope }),
    ...(acceptanceIdentity === undefined ? {} : { acceptanceIdentity }),
    ...(propagation === undefined ? {} : { propagation }),
  };
}

function duration(milliseconds: number): `${number}s` {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) throw new TypeError("Inngest sleep duration is invalid");
  return `${Math.max(1, Math.ceil(milliseconds / 1_000))}s`;
}

function record(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : undefined;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value === "") throw new TypeError("Inngest task metadata is invalid");
  return value;
}

function textOptional(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
