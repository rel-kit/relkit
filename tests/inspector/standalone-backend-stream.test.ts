/** Exercises standalone SSE cursor failures through the native listener and browser reset decoder. */
import { expect, test } from "bun:test";
import { Cause, Effect, Exit, Ref, Result } from "effect";
import { createObservabilityStream } from "@relkit/observability";
import { inspectorBackend } from "../../packages/inspector/src/tool-backend.js";
import { connectStream } from "../../apps/inspector/lib/stream-reader.js";
import { InspectorApiError } from "../../apps/inspector/lib/api-types.js";
import type { InspectorToolState } from "../../packages/inspector/src/tool-state.types.js";

const state: InspectorToolState = {
  selection: { state: "disconnected", rejected: 0 },
  history: undefined,
  sessionId: undefined,
  through: 0,
  error: undefined,
  incomplete: false,
  droppedRecords: 0,
};

test.each([
  ["99", "RELKIT_OBSERVABILITY_STREAM_CURSOR_FUTURE", true],
  ["0", "RELKIT_OBSERVABILITY_STREAM_CURSOR_EXPIRED", true],
  ["invalid", "RELKIT_OBSERVABILITY_QUERY_INVALID", false],
] as const)(
  "standalone cursor %s retains JSON failure and reset policy",
  async (cursor, code, reset) => {
    const events = createObservabilityStream({ maxEvents: 1 });
    events.publish({ type: "log.emitted", data: {} });
    events.publish({ type: "log.emitted", data: {} });
    const current = await Effect.runPromise(Ref.make(state));
    const handler = inspectorBackend(
      current,
      {
        request: () => Effect.die("must remain local"),
        json: () => Effect.die("must remain local"),
      },
      "private-ui",
      { hostname: "127.0.0.1", port: 3210 },
      events,
    );
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (request) => Effect.runPromise(handler(request)),
    });
    try {
      const url = `${server.url}_relkit/v1/stream?cursor=${cursor}`;
      const headers = new Headers({ "x-relkit-inspector-token": "private-ui" });
      const response = await fetch(url, { headers });
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({
        protocol: "relkit.inspector",
        version: 1,
        error: code,
      });
      const failure = await connectStream({
        fetcher: fetch,
        url,
        headers,
        signal: undefined,
        active: () => true,
        connected: () => {},
        event: () => {},
      }).catch((error: InspectorApiError) => error);
      expect(failure).toBeInstanceOf(InspectorApiError);
      expect(failure).toMatchObject({ code, isCursorResetRequired: reset });
      expect(events.stats().subscribers).toBe(0);
    } finally {
      await server.stop(true);
      events.close();
    }
  },
);

test("unexpected stream consumer defects retain their identity", async () => {
  const events = createObservabilityStream();
  const defect = new Error("stream consumer defect");
  const current = await Effect.runPromise(Ref.make(state));
  const handler = inspectorBackend(
    current,
    { request: () => Effect.die("unused"), json: () => Effect.die("unused") },
    "private-ui",
    { hostname: "127.0.0.1", port: 3210 },
    {
      ...events,
      subscribe: () => {
        throw defect;
      },
    },
  );
  try {
    const result = await Effect.runPromiseExit(
      handler(
        new Request("http://localhost/_relkit/v1/stream", {
          headers: { "x-relkit-inspector-token": "private-ui" },
        }),
      ),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      const found = Cause.findDefect(result.cause);
      expect(Result.isSuccess(found)).toBe(true);
      if (Result.isSuccess(found)) expect(found.success).toBe(defect);
    }
  } finally {
    events.close();
  }
});
