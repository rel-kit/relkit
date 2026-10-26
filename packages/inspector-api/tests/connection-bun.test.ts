/** Proves real bridge binding, forwarding, reload identity and scoped release. */
import { test, expect } from "bun:test";
import { mkdtemp, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { InspectionBridge, InspectionBridgeLive } from "../src/connection/bridge.service.js";
import { InspectionFilesLive } from "../src/connection/files.service.js";
import { InspectionNativeLive } from "../src/connection/native.service.js";
import type { InspectionDescriptor } from "../src/connection/protocol.types.js";

const live = InspectionBridgeLive.pipe(
  Layer.provide(Layer.merge(InspectionFilesLive, InspectionNativeLive)),
);

/** Sends credentials only as server request headers. */
function headers(descriptor: InspectionDescriptor) {
  return {
    authorization: `Bearer ${descriptor.token}`,
    "x-relkit-project-id": descriptor.projectId,
    "x-relkit-session-id": descriptor.sessionId,
  };
}

test("native bridge keeps session identity across target changes and releases its files/listener", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-native-bridge-"));
  const backend = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (request) =>
      request.method === "POST"
        ? Response.json({ bytes: (await request.arrayBuffer()).byteLength })
        : Response.json({ live: true }),
  });
  let endpoint = "";
  let path = "";
  let generationId = "one";
  try {
    ({ endpoint, path } = await Effect.runPromise(
      probeBridge(root, backend.port!).pipe(Effect.scoped, Effect.provide(live)),
    ));
    expect(
      await access(path).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(
      await fetch(`${endpoint}/_relkit/bridge/v1/handshake`).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  } finally {
    await backend.stop(true);
    await rm(root, { recursive: true, force: true });
  }
});

/** Exercises authenticated forwarding while one bridge changes active generation. */
const probeBridge = Effect.fn("test.nativeBridge")(function* (root: string, backendPort: number) {
  let generationId = "one";
  const bridge = yield* InspectionBridge;
  const connection = yield* bridge.start({
    root,
    host: "127.0.0.1",
    port: 0,
    active: () => ({
      generationId,
      endpoint: `http://127.0.0.1:${backendPort}`,
      capabilities: ["graph"],
    }),
  });
  const endpoint = connection.descriptor.endpoint;
  const path = connection.path;
  const options = { headers: headers(connection.descriptor) };
  const first = yield* Effect.promise(() =>
    fetch(`${endpoint}/_relkit/bridge/v1/handshake`, options).then((r) => r.json()),
  );
  expect(first).toMatchObject({
    generationId: "one",
    sessionId: connection.descriptor.sessionId,
  });
  generationId = "two";
  const second = yield* Effect.promise(() =>
    fetch(`${endpoint}/_relkit/bridge/v1/handshake`, options).then((r) => r.json()),
  );
  expect(second).toMatchObject({
    generationId: "two",
    sessionId: connection.descriptor.sessionId,
  });
  const upload = yield* Effect.promise(() =>
    fetch(`${endpoint}/uploads`, {
      method: "POST",
      headers: { ...options.headers, "x-relkit-generation-id": "two" },
      body: new Uint8Array(1_100_000),
    }),
  );
  expect(upload.status).toBe(200);
  expect(yield* Effect.promise(() => upload.json())).toEqual({ bytes: 1_100_000 });
  for (const path of ["/v1/orders", "/v1/handshake", "/v1/records", "/v1/ack"]) {
    const application = yield* Effect.promise(() => fetch(`${endpoint}${path}`, options));
    expect(application.status).toBe(200);
    expect(yield* Effect.promise(() => application.json())).toEqual({ live: true });
  }
  const response = yield* Effect.promise(() => fetch(`${endpoint}/_relkit/v1/graph`, options));
  expect(yield* Effect.promise(() => response.json())).toEqual({ live: true });
  expect(
    (yield* Effect.promise(() => fetch(`${endpoint}/_relkit/bridge/v1/handshake`))).status,
  ).toBe(401);
  return { endpoint, path };
});
