/** Owns the browser fixture's application and real private inspection bridge. */
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { Cause, Effect, Layer } from "effect";
import {
  InspectionBridge,
  InspectionBridgeLive,
  InspectionFilesLive,
  InspectionNativeLive,
  InspectionCapture,
} from "@relkit/inspector-api/connection";
import { disposeInspectorEndpoints } from "../../packages/inspector-api/src/index.ts";
import { createInspectorFixture, FIXTURE_GENERATION_ID } from "./fixture-backend.ts";

/** Acquires the application before the bridge and releases it after the bridge closes. */
const application = Effect.gen(function* () {
  const fixture = yield* Effect.acquireRelease(Effect.sync(createInspectorFixture), (fixture) =>
    Effect.promise(async () => {
      fixture.stream.close();
      await disposeInspectorEndpoints(fixture.app);
    }),
  );
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        hostname: "127.0.0.1",
        port: Number(process.env.RELKIT_FIXTURE_PORT ?? "3212"),
        idleTimeout: 30,
        fetch: fixture.app.fetch,
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  );
  return { fixture, server };
});

const run = Effect.gen(function* () {
  const root = process.env.RELKIT_FIXTURE_PROJECT;
  if (!root) return yield* Effect.fail(new Error("Browser fixture project is required"));
  yield* Effect.promise(() => mkdir(root, { recursive: true }));
  const { fixture, server } = yield* application;
  const capture = yield* InspectionCapture.make({});
  yield* InspectionBridge.use((bridge) =>
    bridge.start({
      root,
      host: "127.0.0.1",
      port: 0,
      records: capture.records,
      active: () => ({
        endpoint: `http://127.0.0.1:${server.port}`,
        generationId: FIXTURE_GENERATION_ID,
        capabilities: ["graph", "records", "actions"],
      }),
    }),
  );
  console.log(`Inspector fixture backend listening on http://127.0.0.1:${server.port}`);
  let previous = new Set<string>();
  yield* Effect.forever(
    Effect.gen(function* () {
      const current = new Set<string>();
      for (const record of fixture.records()) {
        const key = createHash("sha256").update(JSON.stringify(record)).digest("hex");
        current.add(key);
        if (!previous.has(key)) yield* capture.append(record, { key, origin: "application" });
      }
      previous = current;
      yield* Effect.sleep("100 millis");
    }),
  );
});

const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  await Effect.runPromise(
    run.pipe(
      Effect.scoped,
      Effect.provide(
        InspectionBridgeLive.pipe(
          Layer.provide(Layer.merge(InspectionFilesLive, InspectionNativeLive)),
        ),
      ),
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.failCause(cause),
      ),
    ),
    { signal: controller.signal },
  );
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
