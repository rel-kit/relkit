import type { Effect, Semaphore } from "effect";
import type { JobQueue } from "../jobs/queue.js";
import type { JobStore } from "../jobs/store.js";
import type { EventDeliveryBinding, EventDeliveryOptions } from "./delivery-types.js";
import type { normalizeRetry } from "./delivery-utils.js";
import type { LocalOperationError } from "../local-effect.js";
import type { EventDelivery } from "./delivery-types.js";

/** Maps each operation to a lazy typed workflow while preserving its payload. */
type Operation<F> = F extends (...args: infer Args) => infer Value
  ? (...args: Args) => Effect.Effect<Awaited<Value>, LocalOperationError>
  : never;

/** One trigger's durable operations and immutable identity. */
export type EventDeliveryEffects = { readonly triggerId: string } & {
  readonly [
    K in "accept" | "deliver" | "runNext" | "retry" | "recover" | "drain" | "snapshot" | "close"
  ]: Operation<EventDelivery[K]>;
};

/** Dependencies shared by durable handler acquisition and acknowledgement. */
export interface DeliveryRunnerOptions {
  readonly queue: JobQueue;
  readonly store: JobStore;
  readonly binding: EventDeliveryBinding;
  readonly triggerId: string;
  readonly executions: Semaphore.Semaphore;
  readonly retryPolicy: ReturnType<typeof normalizeRetry>;
  readonly clock: () => number;
  readonly options: EventDeliveryOptions;
  readonly ensureOpen: () => Effect.Effect<void, LocalOperationError>;
}
