import type { GenerationLifecycle } from "./lifecycle.js";
import type { InvocationAdmissionRequest, InvocationLease } from "./invoke-types.js";
import { effectiveConcurrencyLimit, validateLimit } from "./concurrency-limits.js";

export { effectiveConcurrencyLimit } from "./concurrency-limits.js";

export interface ConcurrencyAdmissionRequest extends InvocationAdmissionRequest {
  /** Optional explicit function limit; `limit` remains the invocation seam. */
  readonly functionLimit?: number;
  readonly triggerId?: string;
  readonly triggerLimit?: number;
}

export interface ConcurrencyAdmissionOptions {
  /** The lifecycle belongs to this generation and is leased only after admission. */
  readonly generation?: Pick<GenerationLifecycle, "acquire">;
  readonly generationId?: string;
}

interface Waiter {
  readonly request: ConcurrencyAdmissionRequest;
  readonly resolve: (lease: InvocationLease) => void;
  readonly reject: (cause: unknown) => void;
  readonly state: FunctionState;
  onAbort: () => void;
  cancelled: boolean;
}

interface FunctionState {
  active: number;
  waiting: number;
  readonly queue: Waiter[];
  readonly triggers: Map<string, number>;
}

/** FIFO, generation-local admission for function and trigger concurrency. */
export class ConcurrencyAdmission {
  readonly generationId: string;
  private readonly generation: ConcurrencyAdmissionOptions["generation"];
  private readonly functions = new Map<string, FunctionState>();

  constructor(options: ConcurrencyAdmissionOptions = {}) {
    this.generationId = options.generationId ?? "generation";
    this.generation = options.generation;
  }

  acquire(request: ConcurrencyAdmissionRequest): Promise<InvocationLease> {
    validateRequest(request);
    if (request.signal.aborted) return Promise.reject(abortReason(request.signal));

    const state = this.stateFor(request.functionId);
    if (state.waiting === 0 && this.canAdmit(state, request)) {
      try {
        return Promise.resolve(this.grant(state, request));
      } catch (cause) {
        return Promise.reject(cause);
      }
    }

    return new Promise<InvocationLease>((resolve, reject) => {
      const waiter: Waiter = {
        request,
        resolve,
        reject,
        state,
        onAbort: () => undefined,
        cancelled: false,
      };
      waiter.onAbort = () => this.cancel(waiter, abortReason(request.signal));
      state.queue.push(waiter);
      state.waiting += 1;
      request.signal.addEventListener("abort", waiter.onAbort, { once: true });
      if (request.signal.aborted) this.cancel(waiter, abortReason(request.signal));
    });
  }

  activeCount(functionId: string): number {
    return this.functions.get(functionId)?.active ?? 0;
  }

  waitingCount(functionId: string): number {
    return this.functions.get(functionId)?.waiting ?? 0;
  }

  private stateFor(functionId: string): FunctionState {
    let state = this.functions.get(functionId);
    if (state === undefined) {
      state = { active: 0, waiting: 0, queue: [], triggers: new Map() };
      this.functions.set(functionId, state);
    }
    return state;
  }

  private canAdmit(state: FunctionState, request: ConcurrencyAdmissionRequest): boolean {
    const functionLimit = effectiveConcurrencyLimit(request.limit, request.functionLimit);
    if (functionLimit !== undefined && state.active >= functionLimit) return false;
    if (request.triggerLimit === undefined) return true;
    const trigger = triggerKey(request);
    return (state.triggers.get(trigger) ?? 0) < request.triggerLimit;
  }

  private grant(state: FunctionState, request: ConcurrencyAdmissionRequest): InvocationLease {
    const generationLease = this.generation?.acquire();
    state.active += 1;
    const trigger = request.triggerLimit === undefined ? undefined : triggerKey(request);
    if (trigger !== undefined) state.triggers.set(trigger, (state.triggers.get(trigger) ?? 0) + 1);
    let released = false;
    return Object.freeze({
      release: (): void => {
        if (released) return;
        released = true;
        state.active -= 1;
        if (trigger !== undefined) decrement(state.triggers, trigger);
        generationLease?.release();
        this.pump(request.functionId, state);
      },
    });
  }

  private cancel(waiter: Waiter, cause: unknown): void {
    if (waiter.cancelled) return;
    waiter.cancelled = true;
    waiter.state.waiting -= 1;
    waiter.request.signal.removeEventListener("abort", waiter.onAbort);
    waiter.reject(cause);
    this.pump(waiter.request.functionId, waiter.state);
    this.removeIfIdle(waiter.request.functionId, waiter.state);
  }

  private pump(functionId: string, state: FunctionState): void {
    discardCancelled(state);
    while (state.waiting > 0) {
      const waiter = state.queue[0];
      if (waiter === undefined || waiter.cancelled || !this.canAdmit(state, waiter.request)) return;
      state.queue.shift();
      state.waiting -= 1;
      waiter.request.signal.removeEventListener("abort", waiter.onAbort);
      try {
        waiter.resolve(this.grant(state, waiter.request));
      } catch (cause) {
        waiter.reject(cause);
        this.failQueued(state, cause);
        return;
      }
      discardCancelled(state);
    }
    this.removeIfIdle(functionId, state);
  }

  private failQueued(state: FunctionState, cause: unknown): void {
    for (const waiter of state.queue) {
      if (waiter.cancelled) continue;
      waiter.cancelled = true;
      state.waiting -= 1;
      waiter.request.signal.removeEventListener("abort", waiter.onAbort);
      waiter.reject(cause);
    }
    state.queue.length = 0;
  }

  private removeIfIdle(functionId: string, state: FunctionState): void {
    if (state.active === 0 && state.waiting === 0 && state.queue.length === 0) {
      this.functions.delete(functionId);
    }
  }
}

export function createConcurrencyAdmission(
  options: ConcurrencyAdmissionOptions = {},
): ConcurrencyAdmission {
  return new ConcurrencyAdmission(options);
}

function validateRequest(request: ConcurrencyAdmissionRequest): void {
  if (request.functionId.length === 0) throw new TypeError("functionId must not be empty");
  validateLimit(request.limit, "limit");
  validateLimit(request.functionLimit, "functionLimit");
  validateLimit(request.triggerLimit, "triggerLimit");
  if (request.triggerId !== undefined && request.triggerId.length === 0) {
    throw new TypeError("triggerId must not be empty");
  }
}

function triggerKey(request: ConcurrencyAdmissionRequest): string {
  return request.triggerId ?? request.source;
}

function decrement(values: Map<string, number>, key: string): void {
  const count = values.get(key) ?? 0;
  if (count <= 1) values.delete(key);
  else values.set(key, count - 1);
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Admission cancelled");
}

function discardCancelled(state: FunctionState): void {
  while (state.queue[0]?.cancelled) state.queue.shift();
}
