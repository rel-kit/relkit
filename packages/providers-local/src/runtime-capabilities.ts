import { join } from "node:path";
import type { ModelTurn } from "@zsys/agents";
import type { JsonValue } from "@zsys/contracts";
import { createJobQueue, type JobQueue } from "./jobs/queue.js";
import type { JobIdempotencyDefinition } from "./jobs/queue-utils.js";
import { createJobStore, type JobStore } from "./jobs/store.js";
import { createFakeModelProvider } from "./models/fake.js";

export interface LocalJobProvider {
  readonly createQueue: (context: {
    readonly jobId: string;
    readonly idempotency?: JobIdempotencyDefinition;
  }) => Promise<JobQueue>;
  readonly close: () => Promise<void>;
}

export function createLocalJobProvider(root: string, profile: string): LocalJobProvider {
  const stores = new Map<string, JobStore>();
  return Object.freeze({
    createQueue: async (context: {
      readonly jobId: string;
      readonly idempotency?: JobIdempotencyDefinition;
    }) => {
      const existing = stores.get(context.jobId);
      const store = existing ?? (await createJobStore(join(root, "jobs", profile, context.jobId)));
      stores.set(context.jobId, store);
      return createJobQueue(store, {
        ...(context.idempotency === undefined ? {} : { idempotency: context.idempotency }),
      });
    },
    close: async () => {
      await Promise.all([...stores.values()].map((store) => store.close()));
    },
  });
}

export function createLocalModelProvider(profile: string, config: Record<string, unknown> = {}) {
  return createFakeModelProvider({
    profile,
    ...(Array.isArray(config.script) ? { script: config.script as readonly ModelTurn[] } : {}),
  });
}

export function createLocalObservabilityProvider() {
  const records: JsonValue[] = [];
  return Object.freeze({
    collect: (record: JsonValue): void => {
      records.push(record);
    },
    emit: (record: JsonValue): void => {
      records.push(record);
    },
    read: (): readonly JsonValue[] => Object.freeze([...records]),
  });
}
