import { createRequire } from "node:module";
import { parseTracePropagation } from "@relkit/contracts";
import type { TaskExecutionBinding, TaskExecutionEnvelope, TaskExecutor } from "@relkit/jobs/adapter";

export interface TriggerTaskDefinition {
  readonly id: string;
  readonly jobId?: string;
  readonly taskId?: string;
  readonly version: string;
  readonly buildId: string;
  readonly retries?: number;
  readonly trigger?: Readonly<Record<string, unknown>>;
  readonly policy?: unknown;
  readonly resources?: { readonly cpu: number; readonly memory: string; readonly nativeClass?: string };
}

export interface TriggerSdk {
  readonly createTask?: (options: Readonly<Record<string, unknown>>) => unknown;
  readonly task?: (options: Readonly<Record<string, unknown>>) => unknown;
  readonly tasks?: ((options: Readonly<Record<string, unknown>>) => unknown) | Readonly<Record<string, unknown>>;
}

export interface TriggerWorkerHandle {
  readonly tasks: readonly unknown[];
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export function loadTriggerSdk(): TriggerSdk {
  const require = createRequire(import.meta.url);
  try {
    return require("@trigger.dev/sdk/v3") as TriggerSdk;
  } catch {
    throw new Error("RELKIT_TRIGGER_SDK_UNAVAILABLE");
  }
}

export function createTriggerTask(
  sdk: TriggerSdk,
  definition: TriggerTaskDefinition,
  executor: TaskExecutor,
): unknown {
  const factory = sdk.createTask ?? sdk.task ?? (typeof sdk.tasks === "function" ? sdk.tasks : undefined);
  if (factory === undefined) throw new Error("RELKIT_TRIGGER_TASK_FACTORY_UNAVAILABLE");
  return factory({
    ...createTriggerTaskConfig(definition),
    run: async (payload: unknown, context: unknown) => {
      const envelope = envelopeFrom(payload, context, definition);
      return executor.execute(envelope, bindingFrom(envelope, context));
    },
  });
}

export function createTriggerTaskConfig(
  definition: TriggerTaskDefinition,
): Readonly<Record<string, unknown>> {
  const policy = record(definition.policy);
  const retry = record(policy?.retry);
  const concurrency = record(policy?.concurrency);
  const maxAttempts = definition.retries ?? number(retry?.maxAttempts);
  const config: Record<string, unknown> = {
    id: definition.id,
    ...(definition.trigger === undefined ? {} : { trigger: definition.trigger }),
    metadata: { relkitTaskVersion: definition.version, relkitBuildId: definition.buildId },
    ...(maxAttempts === undefined ? {} : { retry: { maxAttempts } }),
    ...(number(concurrency?.limit) === undefined ? {} : { queue: { concurrencyLimit: number(concurrency?.limit) } }),
  };
  if (definition.resources !== undefined) {
    if (definition.resources.nativeClass === undefined) throw new Error("Trigger resource classes require nativeClass");
    config.machine = definition.resources.nativeClass;
  }
  return Object.freeze(config);
}

export function createTriggerWorker(options: {
  readonly sdk?: TriggerSdk;
  readonly definitions: readonly TriggerTaskDefinition[];
  readonly executor: TaskExecutor;
  readonly register?: (tasks: readonly unknown[]) => Promise<void> | void;
}): TriggerWorkerHandle {
  const sdk = options.sdk ?? loadTriggerSdk();
  const tasks = Object.freeze(options.definitions.map((definition) => createTriggerTask(sdk, definition, options.executor)));
  let readyPromise: Promise<void> | undefined;
  return Object.freeze({
    tasks,
    ready: () => {
      readyPromise ??= Promise.resolve(options.register?.(tasks)).then(() => undefined);
      return readyPromise;
    },
    close: async () => undefined,
  });
}

function envelopeFrom(payload: unknown, context: unknown, definition: TriggerTaskDefinition): TaskExecutionEnvelope {
  const value = record(payload);
  const params = record(context);
  const ctx = record(params?.ctx);
  const native = record(value?.relkit) ?? value;
  const input = value?.input ?? value?.payload ?? null;
  const propagation = parseStoredPropagation(native?.propagation);
  const inputHash = textOptional(native?.inputHash);
  const inputSchemaHash = textOptional(native?.inputSchemaHash);
  const acceptedAt = textOptional(native?.acceptedAt);
  const parentRunId = textOptional(native?.parentRunId);
  const service = textOptional(native?.service);
  const serviceGeneration = textOptional(native?.serviceGeneration);
  const scope = textOptional(native?.scope);
  const occurrenceIdentity = textOptional(native?.occurrenceIdentity);
  return {
    runId: text(native?.runId ?? ctx?.run?.id, "Trigger run id"),
    jobId: text(native?.jobId ?? definition.jobId, "Trigger job id"),
    taskId: text(native?.taskId ?? definition.taskId ?? definition.id, "Trigger task id"),
    taskVersion: text(native?.taskVersion ?? definition.version, "Trigger task version"),
    buildId: text(native?.buildId ?? definition.buildId, "Trigger build id"),
    input: input as TaskExecutionEnvelope["input"],
    ...(inputHash === undefined ? {} : { inputHash }),
    ...(inputSchemaHash === undefined ? {} : { inputSchemaHash }),
    ...(acceptedAt === undefined ? {} : { acceptedAt }),
    ...(typeof native?.attempt === "number" ? { attempt: native.attempt } : typeof ctx?.attempt?.number === "number" ? { attempt: ctx.attempt.number } : {}),
    ...(parentRunId === undefined ? {} : { parentRunId }),
    ...(service === undefined ? {} : { service }),
    ...(serviceGeneration === undefined ? {} : { serviceGeneration }),
    ...(scope === undefined ? {} : { scope }),
    ...(occurrenceIdentity === undefined ? {} : { occurrenceIdentity }),
    ...(propagation === undefined ? {} : { propagation }),
  };
}

function bindingFrom(envelope: TaskExecutionEnvelope, context: unknown): TaskExecutionBinding {
  const value = record(context);
  const ctx = record(value?.ctx);
  const wait = ctx?.wait ?? ctx?.waitFor ?? record(ctx?.step)?.sleep;
  const progress = ctx?.reportProgress ?? ctx?.progress;
  const sleep = typeof wait === "function"
    ? {
        sleep: async (key: string, durationMs: number): Promise<void> => { await wait(key, durationMs); },
        sleepUntil: async (key: string, instant: string): Promise<void> => { await wait(key, instant); },
      }
    : undefined;
  const progressWriter = typeof progress === "function"
    ? { emit: async (item: import("@relkit/contracts").JsonValue): Promise<void> => { await progress(item); } }
    : undefined;
  const streams = record(ctx?.streams);
  const streamWriters = streams === undefined
    ? undefined
    : Object.fromEntries(Object.entries(streams).filter(([, writer]) => typeof writer === "function").map(([name, writer]) => [
        name,
        { emit: async (item: import("@relkit/contracts").JsonValue): Promise<void> => { await (writer as (value: unknown) => unknown)(item); } },
      ]));
  return {
    run: {
      runId: envelope.runId,
      jobId: envelope.jobId,
      taskId: envelope.taskId,
      taskVersion: envelope.taskVersion,
      buildId: envelope.buildId,
      ...(envelope.attempt === undefined ? {} : { attempt: envelope.attempt }),
      ...(envelope.acceptedAt === undefined ? {} : { acceptedAt: envelope.acceptedAt }),
      ...(envelope.parentRunId === undefined ? {} : { parentRunId: envelope.parentRunId }),
      ...(envelope.service === undefined ? {} : { service: envelope.service }),
      ...(envelope.serviceGeneration === undefined ? {} : { serviceGeneration: envelope.serviceGeneration }),
      ...(envelope.scope === undefined ? {} : { scope: envelope.scope }),
      ...(envelope.inputSchemaHash === undefined ? {} : { inputSchemaHash: envelope.inputSchemaHash }),
      ...(envelope.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: envelope.acceptanceIdentity }),
      ...(envelope.occurrenceIdentity === undefined ? {} : { occurrenceIdentity: envelope.occurrenceIdentity }),
      ...(envelope.propagation === undefined ? {} : { propagation: envelope.propagation }),
    },
    signal: value?.signal instanceof AbortSignal ? value.signal : new AbortController().signal,
    ...(sleep === undefined ? {} : { sleep }),
    ...(progressWriter === undefined ? {} : { progress: progressWriter }),
    ...(streamWriters === undefined ? {} : { streams: streamWriters }),
  };
}

function record(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : undefined;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(label + " is invalid");
  return value;
}

function textOptional(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function parseStoredPropagation(value: unknown): ReturnType<typeof parseTracePropagation> {
  if (typeof value !== "string") return parseTracePropagation(value);
  try { return parseTracePropagation(JSON.parse(value)); } catch { return undefined; }
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
