import type { TaskExecutor } from "@relkit/jobs/adapter";

export interface EffectMqTaskDefinition {
  readonly id: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly version: string;
  readonly taskVersion?: string;
  readonly buildId: string;
  readonly policy?: unknown;
  readonly schedules?: readonly unknown[];
}

export interface EffectMqWorkerRegistrationOptions {
  readonly definitions: readonly EffectMqTaskDefinition[];
  readonly executor: TaskExecutor;
  readonly startWorker?: boolean;
  readonly register?: (definitions: readonly EffectMqTaskDefinition[]) => Promise<void> | void;
}

export interface EffectMqWorkerHandle {
  readonly definitions: readonly EffectMqTaskDefinition[];
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export function createEffectMqWorker(options: EffectMqWorkerRegistrationOptions): EffectMqWorkerHandle {
  let readyPromise: Promise<void> | undefined;
  const ready = (): Promise<void> => {
    readyPromise ??= Promise.resolve(options.register?.(options.definitions)).then(() => undefined);
    return readyPromise;
  };
  return Object.freeze({
    definitions: Object.freeze([...options.definitions]),
    ready,
    close: async () => undefined,
  });
}
