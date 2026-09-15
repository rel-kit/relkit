import type { TaskExecutor } from "@relkit/jobs/adapter";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { Job, Worker } from "effect-mq";
import { createEffectMqJob, type EffectMqJobDefinition } from "../job.js";
import { createEffectMqPostgresLayer } from "../postgres.js";
import { attempts, bindingFrom, envelopeFrom } from "./postgres-state-support.js";
import type { EffectMqTaskDefinition } from "./worker.js";

export interface EffectMqPostgresStateOptions {
  readonly postgresUrl: string;
  readonly tablePrefix?: string;
  readonly queue?: string;
  readonly definitions?: readonly EffectMqTaskDefinition[];
  readonly executor?: TaskExecutor;
  readonly startWorker?: boolean;
}

export interface EffectMqPostgresState {
  readonly jobs: Map<string, EffectMqJobDefinition["job"]>;
  readonly definitions: Map<string, EffectMqTaskDefinition>;
  readonly run: <A>(effect: Effect.Effect<A, unknown, unknown>, signal?: AbortSignal) => Promise<A>;
  readonly ready: () => Promise<void>;
  readonly ensureJob: (name: string) => EffectMqJobDefinition["job"];
  readonly workerStarted: boolean;
  readonly close: () => Promise<void>;
}

export function createEffectMqPostgresState(options: EffectMqPostgresStateOptions): EffectMqPostgresState {
  const jobs = new Map<string, EffectMqJobDefinition["job"]>();
  const definitions = new Map<string, EffectMqTaskDefinition>();
  const entries = (options.definitions ?? []).map((definition) => {
    definitions.set(definition.jobId, definition);
    const entry = createNativeJob(definition, options.executor, options.queue);
    jobs.set(definition.jobId, entry.job);
    return entry;
  });
  const store = createEffectMqPostgresLayer(options.postgresUrl, options.tablePrefix);
  const workerStarted = options.startWorker === true && entries.length > 0;
  const layer = workerStarted
    ? buildWorkerLayer(store, entries, options.queue)
    : store;
  const runtime = ManagedRuntime.make<any, any>(layer as any);
  let closed = false;
  return Object.freeze({
    jobs,
    definitions,
    workerStarted,
    run: <A>(effect: Effect.Effect<A, unknown, unknown>, signal?: AbortSignal): Promise<A> =>
      runtime.runPromise(effect as any, signal === undefined ? undefined : { signal }) as Promise<A>,
    ready: async () => { await runtime.context(); },
    ensureJob: (name: string): EffectMqJobDefinition["job"] => {
      const existing = jobs.get(name);
      if (existing !== undefined) return existing;
      const job = Job.make(name, { payload: { input: Schema.Unknown }, success: Schema.Unknown, error: Schema.Unknown });
      jobs.set(name, job);
      return job;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await runtime.dispose();
    },
  });
}

function createNativeJob(
  definition: EffectMqTaskDefinition,
  executor: TaskExecutor | undefined,
  queue: string | undefined,
): EffectMqJobDefinition {
  const attemptsValue = attempts(definition.policy);
  return createEffectMqJob({
    name: definition.jobId,
    ...(attemptsValue === undefined ? {} : { attempts: attemptsValue }),
    ...(queue === undefined ? {} : { queue }),
    handler: async (input, signal, context) => {
      if (executor === undefined) return undefined;
      const envelope = envelopeFrom(input, definition, context);
      return executor.execute(envelope, bindingFrom(envelope, signal));
    },
  });
}

function buildWorkerLayer(
  store: Layer.Layer<any, any, any>,
  entries: readonly EffectMqJobDefinition[],
  queue: string | undefined,
): Layer.Layer<any, any, any> {
  const first = entries[0];
  if (first === undefined) return store;
  const handlers = Layer.mergeAll(
    first.handlerLayer as Layer.Layer<any, any, any>,
    ...entries.slice(1).map((entry) => entry.handlerLayer as Layer.Layer<any, any, any>),
  );
  const worker = Worker.layer(queue === undefined ? undefined : { queues: { [queue]: { concurrency: 1 } } });
  return handlers.pipe(Layer.provideMerge(worker), Layer.provideMerge(store)) as Layer.Layer<any, any, any>;
}
