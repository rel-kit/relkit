import { createRequire } from "node:module";
import type { TaskExecutor } from "@relkit/jobs/adapter";
import { bindingFrom, envelopeFrom, number, record, text } from "./task-binding-support.js";

export interface TriggerTaskDefinition {
  readonly id: string;
  readonly jobId?: string;
  readonly taskId?: string;
  readonly version: string;
  readonly buildId: string;
  readonly retries?: number;
  readonly trigger?: Readonly<Record<string, unknown>>;
  readonly policy?: unknown;
  readonly resources?: {
    readonly cpu: number;
    readonly memory: string;
    readonly nativeClass?: string;
  };
}

export interface TriggerSdk {
  readonly createTask?: (options: Readonly<Record<string, unknown>>) => unknown;
  readonly task?: (options: Readonly<Record<string, unknown>>) => unknown;
  readonly tasks?:
    ((options: Readonly<Record<string, unknown>>) => unknown) | Readonly<Record<string, unknown>>;
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
  const factory =
    sdk.createTask ?? sdk.task ?? (typeof sdk.tasks === "function" ? sdk.tasks : undefined);
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
    ...(number(concurrency?.limit) === undefined
      ? {}
      : { queue: { concurrencyLimit: number(concurrency?.limit) } }),
  };
  if (definition.resources !== undefined) {
    if (definition.resources.nativeClass === undefined)
      throw new Error("Trigger resource classes require nativeClass");
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
  const tasks = Object.freeze(
    options.definitions.map((definition) => createTriggerTask(sdk, definition, options.executor)),
  );
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
