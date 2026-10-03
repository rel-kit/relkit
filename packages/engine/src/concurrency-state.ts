import { observeExecution } from "@relkit/runtime-effect";
import { Deferred, Effect, Ref } from "effect";
import { effectiveConcurrencyLimit } from "./concurrency-limits.js";
import {
  abortReason,
  decrement,
  discardCancelled,
  triggerKey,
  validateRequest,
} from "./concurrency-state-utils.js";
import type {
  ConcurrencyAdmissionOptions,
  ConcurrencyAdmissionRequest,
  FunctionState,
  Waiter,
} from "./concurrency.types.js";
import { engineTry, runEnginePromise, runEngineSync } from "./engine-runtime.js";
import type { InvocationLease } from "./invoke-types.js";
export type {
  ConcurrencyAdmissionOptions,
  ConcurrencyAdmissionRequest,
} from "./concurrency.types.js";

export { effectiveConcurrencyLimit } from "./concurrency-limits.js";

/** FIFO, generation-local admission for function and trigger concurrency. */
export class AdmissionState {
  readonly generationId: string;
  private readonly generation: ConcurrencyAdmissionOptions["generation"];
  private readonly state = Ref.makeUnsafe(new Map<string, FunctionState>());

  private get functions(): Map<string, FunctionState> {
    return Ref.getUnsafe(this.state);
  }

  /** Allocate generation-local coordinated admission state.
   * @param options - Explicit configuration and dependencies for this operation.
   * @returns undefined
   */
  constructor(options: ConcurrencyAdmissionOptions = {}) {
    this.generationId = options.generationId ?? "generation";
    this.generation = options.generation;
  }

  /** Acquire through the compatibility Promise boundary.
   * @param request - Function/trigger limits and caller cancellation.
   * @returns An idempotent lease, granted in FIFO order.
   */
  acquire(request: ConcurrencyAdmissionRequest): Promise<InvocationLease> {
    return runEnginePromise(this.acquireEffect(request));
  }

  /** Wait for jointly available function and trigger capacity.
   * @param request - Admission identity, limits and cancellation signal.
   * @returns A lazy effect yielding a lease; interruption removes the waiter.
   */
  readonly acquireEffect = Effect.fn("Engine.admission.acquire")(
    (request: ConcurrencyAdmissionRequest) =>
      observeExecution(
        "engine",
        "admission.acquire",
        Effect.gen({ self: this }, function* () {
          yield* engineTry(() => validateRequest(request));
          if (request.signal.aborted) return yield* Effect.fail(abortReason(request.signal));
          const state = this.stateFor(request.functionId);
          if (state.waiting === 0 && this.canAdmit(state, request))
            return yield* engineTry(() => this.grant(state, request));
          const waiter: Waiter = {
            request,
            result: yield* Deferred.make<InvocationLease, unknown>(),
            state,
            onAbort: () => undefined,
            cancelled: false,
          };
          waiter.onAbort = () => this.cancel(waiter, abortReason(request.signal));
          state.queue.push(waiter);
          state.waiting += 1;
          request.signal.addEventListener("abort", waiter.onAbort, { once: true });
          if (request.signal.aborted) this.cancel(waiter, abortReason(request.signal));
          return yield* Deferred.await(waiter.result).pipe(
            Effect.ensuring(
              Effect.sync(() => this.cancel(waiter, new Error("Admission cancelled"))),
            ),
          );
        }),
      ),
  );

  /** Read admitted capacity for one function.
   * @param functionId - Stable function identity used for generation lookup.
   * @returns Number of active unreleased leases.
   */
  activeCount(functionId: string): number {
    return this.functions.get(functionId)?.active ?? 0;
  }

  /** Read pending capacity without counting active leases.
   * @param functionId - Stable function identity used for generation lookup.
   * @returns Number of uncancelled queued requests.
   */
  waitingCount(functionId: string): number {
    return this.functions.get(functionId)?.waiting ?? 0;
  }

  /** Get or create coordinated state for one function.
   * @param functionId - Stable function identity used for generation lookup.
   * @returns The generation-owned function state.
   */
  private stateFor(functionId: string): FunctionState {
    let state = this.functions.get(functionId);
    if (state === undefined) {
      state = { active: 0, waiting: 0, queue: [], triggers: new Map() };
      this.functions.set(functionId, state);
    }
    return state;
  }

  /** Check function and trigger limits together before granting capacity.
   * @param state - Generation-local capacity state.
   * @param request - Declared operation identity, limits and cancellation metadata.
   * @returns Whether both limits permit admission.
   */
  private canAdmit(state: FunctionState, request: ConcurrencyAdmissionRequest): boolean {
    const functionLimit = effectiveConcurrencyLimit(request.limit, request.functionLimit);
    if (functionLimit !== undefined && state.active >= functionLimit) return false;
    if (request.triggerLimit === undefined) return true;
    const trigger = triggerKey(request);
    return (state.triggers.get(trigger) ?? 0) < request.triggerLimit;
  }

  /** Acquire the generation lease and atomically reserve joint capacity.
   * @param state - Generation-local capacity state.
   * @param request - Declared operation identity, limits and cancellation metadata.
   * @returns An idempotent lease releasing both capacity counters.
   */
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

  /** Remove one waiting request and reject its Deferred exactly once.
   * @param waiter - Safe waiter diagnostic value.
   * @param cause - Original native rejection or execution cause.
   * @returns Nothing; remaining requests retain FIFO order.
   */
  private cancel(waiter: Waiter, cause: unknown): void {
    if (waiter.cancelled) return;
    waiter.cancelled = true;
    waiter.state.waiting -= 1;
    waiter.request.signal.removeEventListener("abort", waiter.onAbort);
    runEngineSync(Deferred.fail(waiter.result, cause));
    this.pump(waiter.request.functionId, waiter.state);
    this.removeIfIdle(waiter.request.functionId, waiter.state);
  }

  /** Grant FIFO requests while joint capacity permits.
   * @param functionId - Stable function identity used for generation lookup.
   * @param state - Generation-local capacity state.
   * @returns Nothing; generation failure rejects all remaining waiters.
   */
  private pump(functionId: string, state: FunctionState): void {
    discardCancelled(state);
    while (state.waiting > 0) {
      const waiter = state.queue[0];
      if (waiter === undefined || waiter.cancelled || !this.canAdmit(state, waiter.request)) return;
      state.queue.shift();
      state.waiting -= 1;
      waiter.request.signal.removeEventListener("abort", waiter.onAbort);
      waiter.cancelled = true;
      try {
        const lease = this.grant(state, waiter.request);
        runEngineSync(Deferred.succeed(waiter.result, lease));
      } catch (cause) {
        runEngineSync(Deferred.fail(waiter.result, cause));
        this.failQueued(state, cause);
        return;
      }
      discardCancelled(state);
    }
    this.removeIfIdle(functionId, state);
  }

  /** Reject every live waiter after admission authority fails.
   * @param state - Generation-local capacity state.
   * @param cause - Original native rejection or execution cause.
   * @returns Nothing; clears queued state without changing active leases.
   */
  private failQueued(state: FunctionState, cause: unknown): void {
    for (const waiter of state.queue) {
      if (waiter.cancelled) continue;
      waiter.cancelled = true;
      state.waiting -= 1;
      waiter.request.signal.removeEventListener("abort", waiter.onAbort);
      runEngineSync(Deferred.fail(waiter.result, cause));
    }
    state.queue.length = 0;
  }

  /** Release empty function bookkeeping after final settlement.
   * @param functionId - Stable function identity used for generation lookup.
   * @param state - Generation-local capacity state.
   * @returns Nothing; live function capacity remains retained.
   */
  private removeIfIdle(functionId: string, state: FunctionState): void {
    if (state.active === 0 && state.waiting === 0 && state.queue.length === 0) {
      this.functions.delete(functionId);
    }
  }
}
