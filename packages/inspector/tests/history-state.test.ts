/**
 * 26.1: the storage status says what is true. An application outage leaves retained history
 * `ready` (collection `application-unreachable`); only a failure of history itself is `degraded`;
 * a tool with no session and no lost record does not report history as incomplete.
 */
import { expect, test } from "vitest";
import { Effect, Ref, Scope } from "effect";
import { inspectorBackend } from "../src/tool-backend.js";
import { collectionState, historyFailure, historyReadable } from "../src/history-state.js";
import { recoverInspection } from "../src/tool-history.js";
import { acquireLiveEvents } from "../src/live-events.js";
import { InspectionConnectionError } from "relkit/inspector-api/connection";
import type { InspectorHistoryOwner, InspectorToolState } from "../src/tool-state.types.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";

const history = {
  projectId: "project",
  scope: Effect.runSync(Scope.make()),
  operations: {} as InspectorHistoryOwner["operations"],
} satisfies InspectorHistoryOwner;

/** The tool's state as it starts: no session found yet, history open. */
const fresh: InspectorToolState = {
  selection: { state: "disconnected", rejected: 0 },
  history,
  sessionId: undefined,
  through: 0,
  error: undefined,
  incomplete: false,
  droppedRecords: 0,
};

const remote: InspectorRemoteOperations = {
  request: () => Effect.die("must not forward"),
  json: () => Effect.die("must not decode"),
};

/** Reads `/_relkit/v1/storage` as the pages do. */
function storage(state: InspectorToolState) {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const handler = inspectorBackend(
          yield* Ref.make(state),
          remote,
          "t",
          { hostname: "127.0.0.1", port: 3210 },
          yield* acquireLiveEvents,
        );
        const response = yield* handler(
          new Request("http://localhost/_relkit/v1/storage", {
            headers: { "x-relkit-inspector-token": "t" },
          }),
        );
        return (yield* Effect.promise(() => response.json())) as Record<string, unknown>;
      }),
    ),
  );
}

test("history failures are told from application failures", () => {
  expect(historyFailure("history.writer-conflict")).toBe(true);
  expect(historyFailure("collection.failed")).toBe(true);
  expect(historyFailure("remote.request")).toBe(false);
  expect(historyFailure("remote.timeout")).toBe(false);
  expect(historyFailure("collection.invalid")).toBe(false);
});

test("no session and no lost record: history is ready, complete and waiting", async () => {
  expect(await storage(fresh)).toMatchObject({
    state: "ready",
    collection: "waiting-for-application",
    incomplete: false,
    recordsLostBeforeHistory: { byApplicationProducer: 0, byInspectionBuffer: 0 },
  });
});

test("an application outage keeps retained history ready and says the application is unreachable", async () => {
  const outage = { ...fresh, error: "remote.request" };
  expect(historyReadable(outage)).toBe(true);
  const status = await storage(outage);
  expect(status).toMatchObject({
    state: "ready",
    collection: "application-unreachable",
    applicationError: "remote.request",
    incomplete: false,
  });
  // The pages read any `error` as a failure of history.
  expect(status).not.toHaveProperty("error");
  expect(collectionState({ ...fresh, error: "collection.invalid" })).toBe("application-invalid");
});

test("a failure of history itself is degraded", async () => {
  expect(await storage({ ...fresh, error: "history.writer-conflict" })).toMatchObject({
    state: "degraded",
    collection: "history-unavailable",
    error: "history.writer-conflict",
  });
  expect(await storage({ ...fresh, history: undefined })).toMatchObject({
    state: "degraded",
    collection: "history-unavailable",
  });
});

test("recovering from an outage does not mark history incomplete; a known loss stays", async () => {
  const outage = new InspectionConnectionError({
    operation: "remote.request",
    cause: new Error("connection refused"),
  });
  for (const incomplete of [false, true]) {
    const state = Ref.makeUnsafe<InspectorToolState>({ ...fresh, incomplete });
    await Effect.runPromise(
      Effect.scoped(recoverInspection(state, outage)).pipe(Effect.timeout("3 seconds")),
    );
    expect(Ref.getUnsafe(state)).toMatchObject({ error: "remote.request", incomplete });
  }
});
