/** Relocated history preserves native validation codes and header negotiation without disclosing causes. */
import { expect, test } from "vitest";
import { Effect, Layer, Ref } from "effect";
import { LocalWorkerError } from "@relkit/observability/local/worker-contract";
import { InspectorHistory } from "../src/history.service.js";
import { InspectorHistoryNative } from "../src/history-native.service.js";
import { inspectorBackend } from "../src/tool-backend.js";
import { acquireLiveEvents } from "../src/live-events.js";

/** Acquires the real history service around a substituted worker response boundary. */
const handler = (code?: LocalWorkerError["code"]) =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const operations = yield* InspectorHistory.make("/history", "project").pipe(
      Effect.provide(
        Layer.succeed(InspectorHistoryNative, {
          acquire: () =>
            Effect.succeed({
              pid: undefined,
              close: () => Effect.void,
              call: () =>
                code === undefined
                  ? Effect.succeed({ items: [] })
                  : Effect.fail(
                      new LocalWorkerError({
                        reason: "response",
                        code,
                        message: "private native diagnostic",
                      }),
                    ),
            }),
        }),
      ),
    );
    const state = yield* Ref.make({
      selection: { state: "disconnected" as const, rejected: 0 },
      history: { projectId: "project", scope, operations },
      sessionId: undefined,
      through: 0,
      error: undefined,
      incomplete: false,
      droppedRecords: 0,
    });
    return inspectorBackend(
      state,
      {
        request: () => Effect.die("history must not forward"),
        json: () => Effect.die("history must not decode a live response"),
      },
      "ui-secret",
      { hostname: "127.0.0.1", port: 3210 },
      yield* acquireLiveEvents,
    );
  });

test.each([
  "RELKIT_OBSERVABILITY_QUERY_INVALID",
  "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
] as const)("history keeps native %s as a private 400 response", async (code) => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const serve = yield* handler(code);
        const response = yield* serve(
          new Request("http://localhost/_relkit/v1/logs?severity=bogus", {
            headers: { "x-relkit-inspector-token": "ui-secret" },
          }),
        );
        expect(response.status).toBe(400);
        const body = yield* Effect.promise(() => response.text());
        expect(JSON.parse(body)).toMatchObject({ error: code });
        expect(body).not.toContain("private native diagnostic");
      }),
    ),
  );
});

test.each([
  ["x-relkit-api-version", "2", "RELKIT_INSPECTOR_API_VERSION_UNSUPPORTED"],
  ["accept", "application/json; version=2", "RELKIT_INSPECTOR_API_VERSION_UNSUPPORTED"],
  ["x-relkit-api-protocol", "foreign", "RELKIT_INSPECTOR_PROTOCOL_UNSUPPORTED"],
])("history negotiates %s before querying", async (header, value, code) => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const serve = yield* handler();
        const response = yield* serve(
          new Request("http://localhost/_relkit/v1/logs", {
            headers: { "x-relkit-inspector-token": "ui-secret", [header!]: value! },
          }),
        );
        expect(response.status).toBe(400);
        expect(yield* Effect.promise(() => response.json())).toMatchObject({ error: code });
      }),
    ),
  );
});
