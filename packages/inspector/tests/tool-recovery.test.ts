/** Storage startup/retry ownership cannot leak leases or spin after the bounded recovery budget. */
import { expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Logger, Ref, Scope } from "effect";
import { TestClock } from "effect/testing";
import { InspectionConnectionError } from "relkit/inspector-api/connection";
import type { InspectionFilesOperations } from "relkit/inspector-api/connection";
import { inspectionLoop } from "../src/tool-loop.js";
import { acquireLiveEvents } from "../src/live-events.js";
import { InspectorHistoryNative } from "../src/history-native.service.js";
import type { InspectorToolState } from "../src/tool-state.types.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";

const unavailable = () => Effect.die("Discovery fixture must not use native I/O");
const files: InspectionFilesOperations = {
  projectId: () => Effect.succeed("project"),
  list: unavailable,
  read: unavailable,
  publish: unavailable,
  removeOwned: unavailable,
};
const remote: InspectorRemoteOperations = { request: unavailable, json: unavailable };
const options = { hostname: "127.0.0.1", port: 3210, projectRoot: "/fixture" };

/** Each tool has independent state; disconnected discovery still permits existing local history. */
const state = () =>
  Ref.make<InspectorToolState>({
    selection: { state: "disconnected", rejected: 0 },
    history: undefined,
    sessionId: undefined,
    through: 0,
    error: undefined,
    incomplete: true,
    droppedRecords: 0,
  });

it.effect("a mixed discovery failure and defect never becomes a recoverable retry", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const current = yield* state();
      const events = yield* acquireLiveEvents;
      const cause = Cause.combine(
        Cause.fail(
          new InspectionConnectionError({
            operation: "discovery.unavailable",
            cause: new Error("expected"),
          }),
        ),
        Cause.die(new Error("unexpected defect")),
      );
      const fiber = yield* Effect.forkChild(
        inspectionLoop(
          current,
          {
            select: () =>
              Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.failCause(cause))),
          },
          remote,
          files,
          options,
          events,
        ),
      );
      yield* Deferred.await(entered);
      yield* TestClock.adjust(1100);
      const exit = fiber.pollUnsafe();
      yield* Fiber.interrupt(fiber);
      expect(exit && Exit.isFailure(exit)).toBe(true);
      if (exit && Exit.isFailure(exit)) expect(exit.cause.reasons).toHaveLength(2);
    }),
  ),
);

it.effect("three failed openings release every partial lease and back off history retries", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counts = { attempts: 0, released: 0 };
      const entered = yield* Deferred.make<void>();
      const native = failedOpenings(entered, counts);
      const current = yield* state();
      const events = yield* acquireLiveEvents;
      const fiber = yield* Effect.forkChild(
        Effect.scoped(
          inspectionLoop(
            current,
            { select: () => Effect.succeed({ state: "disconnected", rejected: 0 }) },
            remote,
            files,
            options,
            events,
          ),
        ).pipe(Effect.provide(native)),
      );
      yield* Deferred.await(entered);
      yield* TestClock.adjust(5000);
      expect(counts.attempts).toBe(3);
      expect(counts.released).toBe(3);
      expect(yield* Ref.get(current)).toMatchObject({
        history: undefined,
        error: "history.writer-conflict",
        incomplete: true,
      });
      yield* TestClock.adjust(5000);
      expect(counts.attempts).toBe(3);
      // A released lock (for example a stopped stale inspector) is picked up without a restart.
      yield* TestClock.adjust(25_000);
      expect(counts.attempts).toBe(4);
      expect(counts.released).toBe(4);
      yield* TestClock.adjust(5000);
      expect(counts.attempts).toBe(4);
      yield* Fiber.interrupt(fiber);
    }),
  ),
);

it.effect("a lock conflict after history reopened names its holder again", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counts = { attempts: 0, released: 0 };
      const entered = yield* Deferred.make<void>();
      const warnings: string[] = [];
      const logger = Logger.layer([
        Logger.make((event) => {
          if (event.logLevel === "Warn") warnings.push(String(event.message));
        }),
      ]);
      const current = yield* state();
      const events = yield* acquireLiveEvents;
      const fiber = yield* Effect.forkChild(
        Effect.scoped(
          inspectionLoop(
            current,
            { select: () => Effect.succeed({ state: "disconnected", rejected: 0 }) },
            remote,
            files,
            options,
            events,
          ),
        ).pipe(Effect.provide(Layer.merge(failedOpenings(entered, counts), logger))),
      );
      yield* Deferred.await(entered);
      yield* TestClock.adjust(5000);
      expect(warnings).toHaveLength(2);
      expect(warnings[1]).toContain("retrying every 30s");

      // History opens (the lock was released) while still disconnected, then is lost again.
      const scope = yield* Scope.make();
      yield* Ref.update(current, (value) => ({
        ...value,
        history: { projectId: "project", scope, operations: {} as never },
      }));
      yield* TestClock.adjust(30_000);
      yield* Ref.update(current, (value) => ({ ...value, history: undefined }));
      yield* TestClock.adjust(1000);
      expect(warnings).toHaveLength(3);
      expect(warnings[2]).toContain("locked by another process");
      yield* Fiber.interrupt(fiber);
    }),
  ),
);

it.effect("cancellation during opening joins its partial native resource", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let released = 0;
      const entered = yield* Deferred.make<void>();
      const native = Layer.succeed(InspectorHistoryNative, {
        acquire: () =>
          Effect.acquireRelease(Deferred.succeed(entered, undefined), () =>
            Effect.sync(() => {
              released++;
            }),
          ).pipe(Effect.andThen(Effect.never)),
      });
      const current = yield* state();
      const events = yield* acquireLiveEvents;
      const fiber = yield* Effect.forkChild(
        Effect.scoped(
          inspectionLoop(
            current,
            { select: () => Effect.succeed({ state: "disconnected", rejected: 0 }) },
            remote,
            files,
            options,
            events,
          ),
        ).pipe(Effect.provide(native)),
      );
      yield* Deferred.await(entered);
      yield* Fiber.interrupt(fiber);
      expect(released).toBe(1);
      expect((yield* Ref.get(current)).history).toBeUndefined();
    }),
  ),
);

/** Models partial acquisition before a repeatable writer conflict. */
function failedOpenings(
  entered: Deferred.Deferred<void>,
  counts: { attempts: number; released: number },
) {
  return Layer.succeed(InspectorHistoryNative, {
    acquire: () =>
      Effect.acquireRelease(
        Effect.sync(() => {
          counts.attempts++;
        }),
        () =>
          Effect.sync(() => {
            counts.released++;
          }),
      ).pipe(
        Effect.andThen(Deferred.succeed(entered, undefined)),
        Effect.andThen(
          Effect.fail(
            new InspectionConnectionError({
              operation: "history.writer-conflict",
              cause: new Error("locked"),
            }),
          ),
        ),
      ),
  });
}
