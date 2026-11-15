/**
 * Records the Inspector collected but history did not store are counted and named, and a batch is
 * acknowledged to the application only once it is stored:
 * - a record the store refuses is stored apart from its batch, given up, named in history and
 *   counted, and the rest of the batch is stored;
 * - a batch that could not be stored stays unacknowledged; stored on a later pull of the same
 *   session, nothing is lost; when its session ends first, it is counted and named;
 * - `incomplete` stays true for the rest of the run once anything was lost.
 */
import { expect, it } from "@effect/vitest";
import { Effect, Fiber, Ref, Scope } from "effect";
import { TestClock } from "effect/testing";
import { InspectionConnectionError } from "relkit/inspector-api/connection";
import type { InspectionFilesOperations } from "relkit/inspector-api/connection";
import type { LocalRecord } from "relkit/observability/local/record";
import { LocalWorkerError } from "relkit/observability/local/worker-contract";
import type { ObservabilityStream } from "relkit/observability";
import { inspectionLoop } from "../src/tool-loop.js";
import { acquireLiveEvents } from "../src/live-events.js";
import { inspectorBackend } from "../src/tool-backend.js";
import type { InspectorSelection } from "../src/discovery.types.js";
import type { InspectorToolState, InspectorToolStateRef } from "../src/tool-state.types.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";

const unavailable = () => Effect.die("Fixture must not use native I/O");
const files: InspectionFilesOperations = {
  projectId: () => Effect.succeed("project"),
  list: unavailable,
  read: unavailable,
  publish: unavailable,
  removeOwned: unavailable,
};
const options = { hostname: "127.0.0.1", port: 3210, projectRoot: "/fixture" };

/** A connected selection of one application session. */
const connected = (sessionId: string) =>
  ({
    state: "connected",
    rejected: 0,
    connection: { path: "/private", descriptor: { projectId: "project", sessionId } },
    handshake: { sessionId, generationId: "g1", projectId: "project" },
  }) as unknown as InspectorSelection;

/** A log record whose message names it. */
const log = (message: string) => ({
  version: 2,
  signal: "log",
  timestamp: new Date().toISOString(),
  level: "info",
  component: "app",
  message,
  fields: {},
});

/** One application whose bridge holds three records per session until they are acknowledged. */
function application() {
  const acknowledged: { session: string; through: number }[] = [];
  const remote: InspectorRemoteOperations = {
    request: (connection, path, init) =>
      Effect.sync(() => {
        const session = connection.descriptor.sessionId;
        if (path === "/_relkit/bridge/v1/ack") {
          acknowledged.push({ session, ...(JSON.parse(String(init?.body)) as { through: number }) });
          return Response.json({});
        }
        const after = Number(new URL(path, "http://x").searchParams.get("after"));
        const held = acknowledged.filter((entry) => entry.session === session).at(-1)?.through ?? 0;
        const records = [1, 2, 3]
          .filter((sequence) => sequence > Math.max(after, held))
          .map((sequence) => ({ sequence, record: log(`${session}-${sequence}`) }));
        return Response.json({ records, gap: false, droppedRecords: 0, incomplete: false });
      }),
    json: (response) => Effect.promise(() => response.text()),
  };
  return { remote, acknowledged };
}

/** A failed history command as the worker client reports it. */
const failure = (reason: "response" | "worker") =>
  new InspectionConnectionError({
    operation: "history.unavailable",
    cause: new LocalWorkerError({ reason, message: "Conversion Error: Malformed JSON" }),
  });

/** History that stores everything except what `refuse` says, and keeps what it stored. */
function history(refuse: (records: readonly LocalRecord[]) => InspectionConnectionError | undefined) {
  const stored: LocalRecord[] = [];
  return {
    stored,
    operations: {
      call: (command: { type: string; records?: readonly LocalRecord[] }) =>
        Effect.suspend(() => {
          if (command.type !== "append") return Effect.succeed(undefined);
          const refused = refuse(command.records ?? []);
          if (refused) return Effect.fail(refused);
          stored.push(...(command.records ?? []));
          return Effect.succeed([]);
        }),
    },
  };
}

/** Runs the collection loop for the given state until the test clock has advanced. */
function run(
  state: InspectorToolStateRef,
  select: () => InspectorSelection,
  remote: InspectorRemoteOperations,
  events: ObservabilityStream,
) {
  return Effect.forkChild(
    inspectionLoop(state, { select: () => Effect.sync(select) }, remote, files, options, events),
  );
}

/** Tool state with an open history. */
const opened = (operations: ReturnType<typeof history>["operations"]) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    return yield* Ref.make<InspectorToolState>({
      selection: { state: "disconnected", rejected: 0 },
      history: { projectId: "project", scope, operations: operations as never },
      sessionId: undefined,
      through: 0,
      error: undefined,
      incomplete: false,
      droppedRecords: 0,
    });
  });

/** @returns The tool's status endpoint body. */
const status = (state: InspectorToolStateRef, remote: InspectorRemoteOperations, events: ObservabilityStream) =>
  Effect.promise(async () => {
    const handler = inspectorBackend(state, remote, "t", options, events);
    const request = new Request("http://localhost/_relkit/v1/storage", {
      headers: { "x-relkit-inspector-token": "t" },
    });
    return (await Effect.runPromise(handler(request))).json();
  });

const messages = (stored: readonly LocalRecord[]) =>
  stored.map((entry) => ("message" in entry.record ? entry.record.message : ""));

it.effect("a record the store refuses is given up alone, named and counted", () =>
  Effect.gen(function* () {
    const app = application();
    const store = history((records) =>
      records.some((entry) => "message" in entry.record && entry.record.message === "s1-2")
        ? failure("response")
        : undefined,
    );
    const state = yield* opened(store.operations);
    const events = yield* acquireLiveEvents;
    const fiber = yield* run(state, () => connected("s1"), app.remote, events);
    yield* TestClock.adjust(1000);
    yield* Fiber.interrupt(fiber);
    expect(messages(store.stored)).toEqual([
      "s1-1",
      "s1-3",
      expect.stringContaining("the history store refused 1 records (1 log)"),
    ]);
    expect(app.acknowledged).toEqual([{ session: "s1", through: 3 }]);
    const body = yield* status(state, app.remote, events);
    expect(body.recordsLostBeforeHistory).toEqual({
      byApplicationProducer: 0,
      byInspectionBuffer: 0,
      byHistoryStore: 1,
    });
    expect(body.incomplete).toBe(true);
  }).pipe(Effect.scoped),
);

it.effect("a batch history could not store is stored by a later pull and nothing is lost", () =>
  Effect.gen(function* () {
    const app = application();
    let broken = true;
    const store = history(() => (broken ? failure("worker") : undefined));
    const state = yield* opened(store.operations);
    const events = yield* acquireLiveEvents;
    const fiber = yield* run(state, () => connected("s1"), app.remote, events);
    yield* TestClock.adjust(50);
    expect(app.acknowledged).toEqual([]);
    expect((yield* Ref.get(state)).unstored).toMatchObject({ sessionId: "s1", records: 3 });
    broken = false;
    // Recovery drops the failed history; this fixture's history stays usable, so put it back.
    yield* TestClock.adjust(1000);
    const scope = yield* Scope.make();
    yield* Ref.update(state, (value) => ({
      ...value,
      history: { projectId: "project", scope, operations: store.operations as never },
    }));
    yield* TestClock.adjust(1000);
    yield* Fiber.interrupt(fiber);
    expect(messages(store.stored)).toEqual(["s1-1", "s1-2", "s1-3"]);
    expect(app.acknowledged).toEqual([{ session: "s1", through: 3 }]);
    const body = yield* status(state, app.remote, events);
    expect(body.recordsLostBeforeHistory.byHistoryStore).toBe(0);
    expect(body.incomplete).toBe(false);
  }).pipe(Effect.scoped),
);

it.effect("a batch whose session ended before history could store it is counted and named", () =>
  Effect.gen(function* () {
    const app = application();
    let broken = true;
    let session = "s1";
    const store = history(() => (broken ? failure("worker") : undefined));
    const state = yield* opened(store.operations);
    const events = yield* acquireLiveEvents;
    const fiber = yield* run(state, () => connected(session), app.remote, events);
    yield* TestClock.adjust(50);
    // The application restarts while history is down; then history comes back.
    session = "s2";
    broken = false;
    yield* TestClock.adjust(1000);
    const scope = yield* Scope.make();
    yield* Ref.update(state, (value) => ({
      ...value,
      history: { projectId: "project", scope, operations: store.operations as never },
    }));
    yield* TestClock.adjust(1000);
    yield* Fiber.interrupt(fiber);
    expect(messages(store.stored)).toEqual([
      expect.stringContaining("3 records (sequences 1-3) of application session s1"),
      "s2-1",
      "s2-2",
      "s2-3",
    ]);
    expect(app.acknowledged).toEqual([{ session: "s2", through: 3 }]);
    const body = yield* status(state, app.remote, events);
    expect(body.recordsLostBeforeHistory.byHistoryStore).toBe(3);
    // The new session lost nothing itself, but this run's history misses three records.
    expect(body.incomplete).toBe(true);
  }).pipe(Effect.scoped),
);
