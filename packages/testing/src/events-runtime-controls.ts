import { admitOwnedWork } from "./work-ownership.js";
import { pendingEventDeliveries, completedEventDeliveries } from "./events-inspection.js";
import { eventLifecycle } from "./events-lifecycle.js";
import type { TestEventControlState, TestEventControls } from "./events-runtime-controls.types.js";
export type { TestEventControlState, TestEventControls } from "./events-runtime-controls.types.js";
import { Context, Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import {
  observeExecution,
  runExecutionPromise,
  runExecutionSync,
} from "@relkit/contracts/operation";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type { EventControlsService } from "./event-controls.types.js";

import type { EventDeliveryResult } from "@relkit/providers-local";
import type { TestEventCloseOptions } from "./events-types.js";

/**
 * Builds delivery decisions around the acquired native event resources.
 * @param state - Owner-local native resources and admission state.
 * @returns A service owning fanout, retry, restart and complete release.
 */
function makeEventControls(state: TestEventControlState) {
  return Effect.gen(function* () {
    // The final harness close is registered later and joins work before this scope retires.
    const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
      Scope.close(scope, Exit.void),
    );
    const context = yield* Effect.context<never>();
    const { restart, close } = eventLifecycle(state, scope, context);
    /**
     * Registers the full workflow before caller interruption can stop waiting.
     * @typeParam A Domain workflow result.
     * @param work Ordered event decisions and native operation seams.
     * @returns The admitted Effect, joined by restart and close.
     */
    const admitted = <A>(work: Effect.Effect<A, unknown>) =>
      admitOwnedWork(state.work, scope, context, work);
    /**
     * Recovers persisted fanout gaps before one authoritative delivery attempt.
     * @param triggerId Optional declared trigger restricting native selection.
     * @returns Native attempt outcome after ledger and post-ack failure checks.
     */
    const runNext = Effect.fn("Testing.event.runNext")(function* (triggerId?: string) {
      yield* Effect.forEach([...state.unfanned.values()], state.openFanout, {
        concurrency: 1,
        discard: true,
      });
      const result = yield* Effect.tryPromise({
        try: () => state.router().runNext(triggerId),
        catch: (cause) => cause,
      });
      if (result === undefined) return undefined;
      const envelope = state.envelopes.find((item) => item.instanceId === result.eventInstanceId);
      if (envelope !== undefined) state.remember(result, envelope);
      if (result.state === "completed")
        yield* Effect.try({
          try: () => state.failures.check("event.after-ack"),
          catch: (cause) => cause,
        });
      return result;
    });
    /** Drains delivery attempts in native order while the owner accepts work. */
    const drain = Effect.fn("Testing.event.drain")(function* () {
      const results: EventDeliveryResult[] = [];
      while (!state.work.closed) {
        const result = yield* runNext();
        if (result === undefined) {
          yield* Effect.tryPromise({ try: () => state.router().drain(), catch: (cause) => cause });
          return Object.freeze(results);
        }
        results.push(result);
      }
      return Object.freeze(results);
    })();
    return TestEventExecution.of({
      publish: (...args) =>
        observeExecution("testing", "event.publish", admitted(state.publish(...args))),
      pending: (id) =>
        Effect.try({ try: () => pendingEventDeliveries(state, id), catch: (cause) => cause }),
      completed: (id) =>
        Effect.try({ try: () => completedEventDeliveries(state, id), catch: (cause) => cause }),
      runNext: (id) => observeExecution("testing", "event.runNext", admitted(runNext(id))),
      drain: observeExecution("testing", "event.drain", admitted(drain)),
      restart: observeExecution("testing", "event.restart", restart),
      close: (options) => close(options?.failed === true),
    });
  });
}

/** Delivery admission, retry/fanout and release belong to one event owner. */
export class TestEventExecution extends Context.Service<TestEventExecution, EventControlsService>()(
  "relkit/testing/EventExecution",
) {}

/**
 * Owns the native delivery lifecycle; alternate Layers retain this service contract.
 * @param state Acquired native router/log and owner-local fanout ledger.
 * @returns A scoped control Layer whose finalizer attempts every release.
 */
export function eventControlsLayer(state: TestEventControlState) {
  return Layer.effect(
    TestEventExecution,
    Effect.acquireRelease(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(Effect.succeed(state.owner), (owner) =>
          Effect.sync(() => owner.cleanup(true)),
        );
        yield* Effect.acquireRelease(state.open, () => state.release.pipe(Effect.orDie));
        return yield* makeEventControls(state);
      }),
      (service) => service.close().pipe(Effect.orDie),
    ),
  );
}

/**
 * Exposes synchronous inspection and Promise work through one owned runtime.
 * @param state Native resources acquired by the event harness.
 * @returns Native-compatible controls with idempotent scoped shutdown.
 */
export async function createTestEventControls(
  state: TestEventControlState,
): Promise<TestEventControls> {
  const owner = ManagedRuntime.make(
    eventControlsLayer(state).pipe(Layer.provideMerge(testingLoggerLayer(state.logger))),
  );
  let service;
  try {
    service = await runExecutionPromise(owner, TestEventExecution);
  } catch (error) {
    await disposeTestingOwner(owner).catch(() => undefined);
    throw error;
  }
  let closing: Promise<void> | undefined;
  return Object.freeze({
    publishNative: (...args: Parameters<TestEventControls["publishNative"]>) =>
      run(service.publish(...args)),
    pending: (id?: string) => query(service.pending(id)),
    completed: (id?: string) => query(service.completed(id)),
    runNext: (id?: string) => run(service.runNext(id)),
    drain: () => run(service.drain),
    restart: () => run(service.restart),
    close: (options?: TestEventCloseOptions) =>
      (closing ??= runExecutionPromise(owner, service.close(options)).finally(() =>
        disposeTestingOwner(owner),
      )),
  });
  /**
   * Rejects new work once the public owner starts its release.
   * @typeParam A Native workflow result.
   * @param effect Admitted publication or delivery workflow.
   * @returns Completion or the established closed-owner error.
   */
  function run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
    return closing === undefined
      ? runExecutionPromise(owner, effect)
      : Promise.reject(new Error("Test event is closed"));
  }
  /**
   * Preserves native closed-state errors for synchronous delivery inspection.
   * @typeParam A Native count result.
   * @param effect Query over the owner's retained native router state.
   * @returns The existing count while admission remains open.
   */
  function query<A>(effect: Effect.Effect<A, unknown>): A {
    if (closing !== undefined) throw new Error("Test event is closed");
    return runExecutionSync(owner, effect);
  }
}
