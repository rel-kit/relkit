/** The terminal says once when no `relkit dev` session is found, and on every connect and disconnect. */
import { expect, it } from "@effect/vitest";
import { Effect, Fiber, Logger, Ref, Scope } from "effect";
import { TestClock } from "effect/testing";
import { InspectionConnectionError } from "relkit/inspector-api/connection";
import type { InspectionFilesOperations } from "relkit/inspector-api/connection";
import { inspectionLoop } from "../src/tool-loop.js";
import { acquireLiveEvents } from "../src/live-events.js";
import { inspectorBackend } from "../src/tool-backend.js";
import type { InspectorSelection } from "../src/discovery.types.js";
import type { InspectorToolState } from "../src/tool-state.types.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";

const unavailable = () => Effect.die("Session fixture must not use native I/O");
const files: InspectionFilesOperations = {
  projectId: () => Effect.succeed("project"),
  list: unavailable,
  read: unavailable,
  publish: unavailable,
  removeOwned: unavailable,
};
/** Collection fails as a recoverable outage, so the loop keeps polling discovery. */
const remote: InspectorRemoteOperations = {
  request: () =>
    Effect.fail(
      new InspectionConnectionError({ operation: "collection.offline", cause: new Error("x") }),
    ),
  json: unavailable,
};
const options = { hostname: "127.0.0.1", port: 3210, projectRoot: "/fixture" };
const waiting =
  "No running `relkit dev` session for /fixture; waiting. Start `relkit dev` with `inspector: { enabled: true }` in the app config.";

const disconnected: InspectorSelection = { state: "disconnected", rejected: 0 };
/** @param sessionId - Live session. @returns An authenticated selection of it. */
const connected = (sessionId: string) =>
  ({
    state: "connected",
    rejected: 0,
    connection: { path: "/private", descriptor: { projectId: "project", sessionId } },
    handshake: { sessionId, generationId: "g1", projectId: "project" },
  }) as unknown as InspectorSelection;

/** Runs the loop over scripted discovery results, one per second, and returns what it logged. */
const run = (script: readonly InspectorSelection[], seconds: number) =>
  Effect.gen(function* () {
    const lines: string[] = [];
    const logger = Logger.layer([
      Logger.make((event) => {
        if (String(event.message).includes("relkit dev")) lines.push(String(event.message));
      }),
    ]);
    const scope = yield* Scope.make();
    const state = yield* Ref.make<InspectorToolState>({
      selection: disconnected,
      // A present history keeps the fixture away from the native writer.
      history: { projectId: "project", scope, operations: {} as never },
      sessionId: undefined,
      through: 0,
      error: undefined,
      incomplete: true,
      droppedRecords: 0,
    });
    const events = yield* acquireLiveEvents;
    let tick = 0;
    const discovery = {
      select: () => Effect.sync(() => script[Math.min(tick++, script.length - 1)]!),
    };
    const fiber = yield* Effect.forkChild(
      inspectionLoop(state, discovery, remote, files, options, events).pipe(Effect.provide(logger)),
    );
    for (let second = 0; second < seconds; second++) yield* TestClock.adjust(1000);
    yield* Fiber.interrupt(fiber);
    return { lines, state: yield* Ref.get(state) };
  });

it.effect("with no session the terminal says so once and how to start one", () =>
  Effect.gen(function* () {
    const { lines } = yield* run([disconnected], 10);
    expect(lines).toEqual([waiting]);
  }).pipe(Effect.scoped),
);

it.effect("every connect and disconnect is one line naming the session", () =>
  Effect.gen(function* () {
    const script = [disconnected, connected("s1"), connected("s1"), disconnected, disconnected];
    const { lines, state } = yield* run([...script, connected("s2")], 10);
    expect(lines).toEqual([
      waiting,
      "Connected to the `relkit dev` session s1 for /fixture.",
      "The `relkit dev` session s1 for /fixture stopped answering; waiting for a session.",
      "Connected to the `relkit dev` session s2 for /fixture.",
    ]);
    expect(state.selectionSince).toBeTypeOf("number");
  }).pipe(Effect.scoped),
);

it.effect("several live sessions name the candidates and --connection-file once", () =>
  Effect.gen(function* () {
    const ambiguous: InspectorSelection = { state: "ambiguous", sessions: ["a", "b"], rejected: 0 };
    const { lines } = yield* run([ambiguous], 5);
    expect(lines).toEqual([
      "2 running `relkit dev` sessions for /fixture (a, b); pass --connection-file to choose one.",
    ]);
  }).pipe(Effect.scoped),
);

it.effect("the status endpoint reports the application session apart from the UI stream", () =>
  Effect.gen(function* () {
    const { state } = yield* run([disconnected, connected("s1")], 3);
    const events = yield* acquireLiveEvents;
    const handler = inspectorBackend(yield* Ref.make(state), remote, "t", options, events);
    const request = new Request("http://localhost/_relkit/v1/storage", {
      headers: { "x-relkit-inspector-token": "t" },
    });
    const body = yield* Effect.promise(() =>
      Effect.runPromise(handler(request)).then((response) => response.json()),
    );
    expect(body.application).toEqual({
      state: "connected",
      sessionId: "s1",
      generationId: "g1",
      sessions: [],
      since: new Date(state.selectionSince!).toISOString(),
    });
  }).pipe(Effect.scoped),
);
