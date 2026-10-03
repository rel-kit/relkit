import type { Deferred, Effect } from "effect";
import type { InvocationAdmissionRequest, InvocationLease } from "./invoke-types.js";
import type { GenerationLifecycle } from "./lifecycle.js";

/** Joint function/trigger limits and cancellation for one FIFO admission request. */
export interface ConcurrencyAdmissionRequest extends InvocationAdmissionRequest {
  /** Optional explicit function limit; `limit` remains the invocation seam. */
  readonly functionLimit?: number;
  readonly triggerId?: string;
  readonly triggerLimit?: number;
}

/** Generation-local capacity configuration with admission-time generation leasing. */
export interface ConcurrencyAdmissionOptions {
  /** The lifecycle belongs to this generation and is leased only after admission. */
  readonly generation?: Pick<GenerationLifecycle, "acquire">;
  readonly generationId?: string;
}

/** Queued admission request whose Deferred is completed exactly once. */
export interface Waiter {
  readonly request: ConcurrencyAdmissionRequest;
  readonly result: Deferred.Deferred<InvocationLease, unknown>;
  readonly state: FunctionState;
  onAbort: () => void;
  cancelled: boolean;
}

/** Coordinated active and queued capacity shared by all triggers of one function. */
export interface FunctionState {
  active: number;
  waiting: number;
  readonly queue: Waiter[];
  readonly triggers: Map<string, number>;
}

/** Effect admission API; one live layer coordinates every trigger of a generation. */
export interface AdmissionOperations {
  readonly acquire: (
    request: ConcurrencyAdmissionRequest,
  ) => Effect.Effect<InvocationLease, unknown>;
  readonly activeCount: (functionId: string) => Effect.Effect<number>;
  readonly waitingCount: (functionId: string) => Effect.Effect<number>;
}
