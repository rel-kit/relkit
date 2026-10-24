/** Browser requests cannot select targets/credentials; live errors and stream invalidations retain their protocol. */
import { expect, test, vi } from "vitest";
import { Effect, Ref } from "effect";
import type { InspectionConnectionFile } from "@relkit/inspector-api/connection";
import { inspectorBackend } from "../src/tool-backend.js";
import { InspectorRemote } from "../src/remote.service.js";
import { acquireLiveEvents } from "../src/live-events.js";
import type { InspectorToolState } from "../src/tool-state.types.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";

const connection: InspectionConnectionFile = {
  path: "/private/connection.json",
  descriptor: {
    protocol: 1,
    projectId: `sha256:${"a".repeat(64)}`,
    sessionId: "312b0cb1-81bb-4b99-81b7-5812a720782b",
    endpoint: "http://127.0.0.1:43100",
    token: "a".repeat(43),
    createdAt: "2026-10-23T00:00:00.000Z",
    process: { pid: 1, startedAt: "2026-10-23T00:00:00.000Z" },
  },
};

/** Only authenticated negotiated sessions can become forwarding authority. */
function state(): InspectorToolState {
  return {
    selection: {
      state: "connected",
      connection,
      rejected: 0,
      handshake: {
        protocol: 1,
        projectId: connection.descriptor.projectId,
        sessionId: connection.descriptor.sessionId,
        generationId: "one",
        capabilities: [],
      },
    },
    history: undefined,
    sessionId: undefined,
    through: 0,
    error: undefined,
    incomplete: false,
    droppedRecords: 0,
  };
}

/** The UI server's local credential is unrelated to the application's bridge secret. */
function request(
  path: string,
  headers: HeadersInit = { "x-relkit-inspector-token": "ui-private" },
) {
  return new Request(`http://localhost${path}`, { headers });
}

test("every BFF route rejects missing credentials and browser origins before forwarding", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const current = yield* Ref.make(state());
        const events = yield* acquireLiveEvents;
        const remote: InspectorRemoteOperations = {
          request: () => Effect.die("must not forward"),
          json: () => Effect.die("must not decode"),
        };
        const handler = inspectorBackend(
          current,
          remote,
          "ui-private",
          { hostname: "127.0.0.1", port: 3210 },
          events,
        );
        for (const path of [
          "/_relkit/v1/graph",
          "/_relkit/v1/logs",
          "/_relkit/v1/stream",
          "/health/ready",
        ]) {
          expect((yield* handler(request(path, {}))).status).toBe(401);
          expect(
            (yield* handler(
              request(path, {
                "x-relkit-inspector-token": "ui-private",
                origin: "http://localhost",
              }),
            )).status,
          ).toBe(401);
        }
      }),
    ),
  );
});

test("browser query choices cannot change the trusted target; bridge errors keep status and UI protocol", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const current = yield* Ref.make(state());
        const events = yield* acquireLiveEvents;
        const remote: InspectorRemoteOperations = {
          request: (_connection, _path, _options, target) =>
            Effect.sync(() => {
              expect(target).toBe("http://trusted-host:43100");
              return Response.json({ protocol: 1, error: "generation.stale" }, { status: 409 });
            }),
          json: (response) => Effect.promise(() => response.text()),
        };
        const handler = inspectorBackend(
          current,
          remote,
          "ui-private",
          { hostname: "127.0.0.1", port: 3210, target: "http://trusted-host:43100" },
          events,
        );
        const response = yield* handler(
          request("/_relkit/v1/graph?target=http://foreign.invalid&connectionFile=/etc/private"),
        );
        expect(response.status).toBe(409);
        expect(yield* Effect.promise(() => response.json())).toEqual({
          protocol: "relkit.inspector",
          version: 1,
          error: "generation.stale",
        });
      }),
    ),
  );
});

test("the standalone live stream serves invalidations and releases its subscriber on cancellation", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const current = yield* Ref.make(state());
        const events = yield* acquireLiveEvents;
        const remote: InspectorRemoteOperations = {
          request: () => Effect.die("stream stays in tool"),
          json: () => Effect.die("must not decode"),
        };
        const handler = inspectorBackend(
          current,
          remote,
          "ui-private",
          { hostname: "127.0.0.1", port: 3210 },
          events,
        );
        const response = yield* handler(request("/_relkit/v1/stream"));
        expect(response.headers.get("content-type")).toContain("text/event-stream");
        const reader = response.body!.getReader();
        yield* Effect.promise(() => reader.read());
        events.publish({ type: "log.emitted", data: {} });
        const next = yield* Effect.promise(() => reader.read());
        expect(new TextDecoder().decode(next.value)).toContain("log.emitted");
        yield* Effect.promise(() => reader.cancel());
        expect(events.stats().subscribers).toBe(0);
        expect(events.stats().backlogBytes).toBe(0);
      }),
    ),
  );
});

test("a network-path reference cannot escape the selected target with its credentials", async () => {
  const fetcher = vi.fn(() => Promise.resolve(new Response()));
  vi.stubGlobal("fetch", fetcher);
  try {
    const remote = await Effect.runPromise(InspectorRemote.make);
    const result = await Effect.runPromise(
      Effect.result(remote.request(connection, "//foreign.invalid/steal")),
    );
    expect(result._tag).toBe("Failure");
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
