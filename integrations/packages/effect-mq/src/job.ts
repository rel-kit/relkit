import { Duration, Effect, Schema } from "effect";
import { Job, Worker } from "effect-mq";

export interface EffectMqJobOptions {
  readonly name: string;
  readonly queue?: string;
  readonly attempts?: number;
  readonly backoff?: {
    readonly type: "fixed" | "exponential";
    readonly delay: Duration.Input;
    readonly factor?: number;
  };
  readonly handler: (
    input: unknown,
    signal: AbortSignal,
    context: Worker.JobContext,
  ) => Promise<unknown>;
  readonly worker?: Parameters<typeof Worker.layer>[0];
}

export interface EffectMqJobDefinition {
  readonly job: ReturnType<typeof Job.make>;
  readonly workerLayer: ReturnType<typeof Worker.layer>;
  readonly handlerLayer: unknown;
}

/** Builds a schema-first native Job.make definition without exposing app schemas. */
export function createEffectMqJob(options: EffectMqJobOptions): EffectMqJobDefinition {
  assertName(options.name);
  const job = Job.make(options.name, {
    payload: { input: Schema.Unknown },
    success: Schema.Unknown,
    error: Schema.Unknown,
    ...(options.queue === undefined ? {} : { queue: options.queue }),
    defaults: {
      attempts: options.attempts ?? 1,
      ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
    },
  });
  const handlerLayer = job.toLayer((payload) =>
    Effect.flatMap(Worker.CurrentJob, (context) =>
      Effect.tryPromise({
        try: (signal) => options.handler(payload.input, signal, context),
        catch: (error) => error,
      }),
    ),
  );
  return Object.freeze({
    job,
    workerLayer: Worker.layer(options.worker),
    handlerLayer,
  });
}

export function createEffectMqWorkerLayer(
  options?: Parameters<typeof Worker.layer>[0],
): ReturnType<typeof Worker.layer> {
  return Worker.layer(options);
}

function assertName(value: string): void {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError("effect-mq job name is invalid");
}
