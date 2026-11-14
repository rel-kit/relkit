/** Records lost before history and live updates a slow interface missed are reported apart. */
import { expect, it } from "@effect/vitest";
import { Effect, Fiber, Ref, Scope } from "effect";
import { TestClock } from "effect/testing";
import type { InspectionFilesOperations } from "relkit/inspector-api/connection";
import { inspectionLoop } from "../src/tool-loop.js";
import { acquireLiveEvents } from "../src/live-events.js";
import { inspectorBackend } from "../src/tool-backend.js";
import type { InspectorSelection } from "../src/discovery.types.js";
import type { InspectorToolState, InspectorToolStateRef } from "../src/tool-state.types.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";
import type { ObservabilityStream } from "relkit/observability";

const unavailable = () => Effect.die("Loss fixture must not use native I/O");
const files: InspectionFilesOperations = {
  projectId: () => Effect.succeed("project"),
  list: unavailable,
  read: unavailable,
  publish: unavailable,
  removeOwned: unavailable,
};
const options = { hostname: "127.0.0.1", port: 3210, projectRoot: "/fixture" };
const selection = {
  state: "connected",
  rejected: 0,
  connection: { path: "/private", descriptor: { projectId: "project", sessionId: "s1" } },
  handshake: { sessionId: "s1", generationId: "g1", projectId: "project" },
} as unknown as InspectorSelection;

/** The application's bridge reports an overflowed inspection buffer and a lossy producer. */
const remote: InspectorRemoteOperations = {
  request: () =>
    Effect.succeed(
      Response.json({
        records: [],
        gap: false,
        droppedRecords: 5,
        droppedBytes: 4096,
        producerFailed: 1,
        producerDropped: 3,
        incomplete: true,
      }),
    ),
  json: (response) => Effect.promise(() => response.text()),
};

/** Collects once from the overflowed bridge. */
const collectedState = Effect.gen(function* () {
  const scope = yield* Scope.make();
  const state = yield* Ref.make<InspectorToolState>({
    selection,
    selectionSince: 0,
    history: {
      projectId: "project",
      scope,
      operations: { call: () => Effect.succeed([]) },
    },
    sessionId: undefined,
    through: 0,
    error: undefined,
    incomplete: true,
    droppedRecords: 0,
  });
  const events = yield* acquireLiveEvents;
  const fiber = yield* Effect.forkChild(
    inspectionLoop(
      state,
      { select: () => Effect.succeed(selection) },
      remote,
      files,
      options,
      events,
    ),
  );
  yield* TestClock.adjust(1000);
  yield* Fiber.interrupt(fiber);
  return { state, events };
});

/** @returns The tool's status endpoint body. */
const status = (state: InspectorToolStateRef, events: ObservabilityStream) =>
  Effect.promise(async () => {
    const handler = inspectorBackend(state, remote, "t", options, events);
    const request = new Request("http://localhost/_relkit/v1/storage", {
      headers: { "x-relkit-inspector-token": "t" },
    });
    return (await Effect.runPromise(handler(request))).json();
  });

it.effect("records lost by the producer and by the inspection buffer are named apart", () =>
  Effect.gen(function* () {
    const { state, events } = yield* collectedState;
    const body = yield* status(state, events);
    expect(body.recordsLostBeforeHistory).toEqual({
      byApplicationProducer: 3,
      byInspectionBuffer: 5,
    });
    expect(body.missedLiveUpdates).toBe(0);
    expect(body.producerFailed).toBe(1);
  }).pipe(Effect.scoped),
);

it.effect("an interface stream that overflows misses live updates but loses no record", () =>
  Effect.gen(function* () {
    const { state, events } = yield* collectedState;
    const slow = events.subscribe();
    for (let index = 0; index < 300; index++) events.publish({ type: "log.emitted", data: {} });
    slow.close();
    const body = yield* status(state, events);
    expect(body.missedLiveUpdates).toBeGreaterThan(0);
    expect(body.missedLiveUpdates).toBe(events.counters().subscriberDropped);
    expect(body.recordsLostBeforeHistory).toEqual({
      byApplicationProducer: 3,
      byInspectionBuffer: 5,
    });
  }).pipe(Effect.scoped),
);
