/** A live descriptor rebind must never disclose the previously selected project's history. */
import { expect, test } from "vitest";
import { Effect, Ref, Scope } from "effect";
import { inspectorBackend } from "../src/tool-backend.js";
import { acquireLiveEvents } from "../src/live-events.js";
import type { InspectorToolState } from "../src/tool-state.types.js";

test("a foreign selection fences queries and controls before the old writer finishes closing", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let calls = 0;
        const scope = yield* Scope.fork(yield* Effect.scope);
        const current = yield* Ref.make(
          foreignState(scope, () =>
            Effect.sync(() => {
              calls++;
              return { private: "old-project-data" };
            }),
          ),
        );
        const events = yield* acquireLiveEvents;
        const handler = inspectorBackend(
          current,
          {
            request: () => Effect.die("must not forward"),
            json: () => Effect.die("must not decode"),
          },
          "ui-private",
          { hostname: "127.0.0.1", port: 3210 },
          events,
        );
        for (const path of [
          "/_relkit/v1/logs",
          "/_relkit/v1/storage",
          "/health/ready",
          "/_relkit/v1/graph",
        ]) {
          const response = yield* handler(
            new Request(`http://localhost${path}`, {
              headers: { "x-relkit-inspector-token": "ui-private" },
            }),
          );
          expect(response.status).toBe(503);
          expect(yield* Effect.promise(() => response.text())).not.toContain("old-project-data");
        }
        expect(calls).toBe(0);
      }),
    ),
  );
});

/** Constructs the precise transient rebind state without acquiring another history owner. */
function foreignState(
  scope: Scope.Closeable,
  call: import("../src/history.types.js").InspectorHistoryOperations["call"],
): InspectorToolState {
  const descriptor = {
    protocol: 1 as const,
    projectId: `sha256:${"b".repeat(64)}`,
    sessionId: "312b0cb1-81bb-4b99-81b7-5812a720782b",
    token: "a".repeat(43),
    endpoint: "http://127.0.0.1:43000",
    process: { pid: 1, startedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
  };
  return {
    selection: {
      state: "connected",
      connection: { path: "/private/selected.json", descriptor },
      rejected: 0,
      handshake: {
        protocol: 1,
        projectId: descriptor.projectId,
        sessionId: descriptor.sessionId,
        capabilities: [],
      },
    },
    history: {
      scope,
      projectId: `sha256:${"a".repeat(64)}`,
      operations: { call },
    },
    sessionId: undefined,
    through: 0,
    error: undefined,
    incomplete: false,
    droppedRecords: 0,
  };
}
