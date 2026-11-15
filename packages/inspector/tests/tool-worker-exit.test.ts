/**
 * A history worker that stops on its own, with no command pending, is noticed at once: the status
 * says history is unavailable and why, the tool starts a new worker, and the status is ready again
 * without the application session changing.
 */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Ref } from "effect";
import { TestClock } from "effect/testing";
import type { InspectionFilesOperations } from "relkit/inspector-api/connection";
import type { LocalWorkerEffects } from "relkit/observability/local/worker-contract";
import { inspectionLoop } from "../src/tool-loop.js";
import { acquireLiveEvents } from "../src/live-events.js";
import { inspectorBackend } from "../src/tool-backend.js";
import { InspectorHistoryNative } from "../src/history-native.service.js";
import type { InspectorToolState, InspectorToolStateRef } from "../src/tool-state.types.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";
import type { ObservabilityStream } from "relkit/observability";

const unavailable = () => Effect.die("Fixture must not use native I/O");
const files: InspectionFilesOperations = {
  projectId: () => Effect.succeed("project"),
  list: unavailable,
  read: unavailable,
  publish: unavailable,
  removeOwned: unavailable,
};
const remote: InspectorRemoteOperations = { request: unavailable, json: unavailable };
const options = { hostname: "127.0.0.1", port: 3210, projectRoot: "/fixture" };

/** @returns The tool's status endpoint body. */
const status = (state: InspectorToolStateRef, events: ObservabilityStream) =>
  Effect.promise(async () => {
    const handler = inspectorBackend(state, remote, "t", options, events);
    const request = new Request("http://localhost/_relkit/v1/storage", {
      headers: { "x-relkit-inspector-token": "t" },
    });
    return (await Effect.runPromise(handler(request))).json();
  });

it.effect("a stopped worker is reported at once and replaced", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const failures: ((error: Error) => void)[] = [];
      const opened = yield* Deferred.make<void>();
      const native = Layer.succeed(InspectorHistoryNative, {
        acquire: (_root, _projectId, onFailure) =>
          Effect.gen(function* () {
            failures.push(onFailure ?? (() => undefined));
            yield* Deferred.succeed(opened, undefined);
            return {
              pid: 4000 + failures.length,
              call: () => Effect.succeed(undefined),
              close: () => Effect.void,
            } satisfies LocalWorkerEffects;
          }),
      });
      const current = yield* Ref.make<InspectorToolState>({
        selection: { state: "disconnected", rejected: 0 },
        history: undefined,
        sessionId: undefined,
        through: 0,
        error: undefined,
        incomplete: false,
        droppedRecords: 0,
      });
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
      yield* Deferred.await(opened);
      yield* TestClock.adjust(50);
      expect(yield* status(current, events)).toMatchObject({
        state: "ready",
        collection: "waiting-for-application",
      });

      failures[0]!(new Error("Telemetry worker exited (null)"));
      expect(yield* status(current, events)).toMatchObject({
        state: "degraded",
        collection: "history-unavailable",
        error: "history.worker-exited",
      });

      yield* TestClock.adjust(2000);
      expect(failures).toHaveLength(2);
      const after = yield* status(current, events);
      expect(after).toMatchObject({ state: "ready", collection: "waiting-for-application" });
      expect(after.error).toBeUndefined();
      yield* Fiber.interrupt(fiber);
    }),
  ),
);
