/** Proves the built standalone UI reads live graph and committed redacted history without app imports. */
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Layer, Schedule } from "effect";
import {
  InspectionBridge,
  InspectionBridgeLive,
  InspectionFilesLive,
  InspectionNativeLive,
  InspectionCapture,
  connectionAttempt,
} from "@relkit/inspector-api/connection";

const bridgeLayer = InspectionBridgeLive.pipe(
  Layer.provide(Layer.merge(InspectionFilesLive, InspectionNativeLive)),
);

/** Releases ephemeral port allocation before the tool binds it. */
const availablePort = Effect.gen(function* () {
  const allocator = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
  const port = allocator.port!;
  yield* Effect.promise(() => allocator.stop(true));
  return port;
});

/** Owns each probe root, app listener, capture and bridge independently of the tool. */
const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    connectionAttempt("test.root", () => mkdtemp(join(tmpdir(), "relkit-standalone-"))),
    (root) =>
      connectionAttempt("test.root-close", () => rm(root, { recursive: true, force: true })).pipe(
        Effect.orDie,
      ),
  );
  yield* connectionAttempt("test.config", () =>
    writeFile(
      join(root, "relkit.config.ts"),
      'throw new Error("standalone must not evaluate application code");',
    ),
  );
  const backend = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: (request) =>
          new URL(request.url).pathname === "/hello"
            ? new Response("still serving")
            : Response.json({
                protocol: "relkit.inspector",
                version: 1,
                nodes: [],
                generationId: "one",
              }),
      }),
    ),
    (backend) => Effect.promise(() => backend.stop(true)),
  );
  const capture = yield* InspectionCapture.make({});
  const bridge = yield* InspectionBridge;
  const connection = yield* bridge.start({
    root,
    host: "127.0.0.1",
    port: 0,
    active: () => ({
      endpoint: `http://127.0.0.1:${backend.port}`,
      generationId: "one",
      capabilities: ["graph"],
    }),
    records: capture.records,
  });
  const port = yield* availablePort;
  return { root, backend, capture, connection, port };
});

/** Acquires the actual built tool and joins it before test-owned app resources close. */
const launch = Effect.fn("test.launchTool")(function* (root: string, port: number) {
  const entry = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
  return yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.spawn([process.execPath, entry, "--project-root", root, "--port", String(port)], {
        stdout: "inherit",
        stderr: "inherit",
      }),
    ),
    (child) =>
      Effect.gen(function* () {
        if (child.exitCode !== null) return;
        child.kill("SIGTERM");
        yield* Effect.promise(() => child.exited).pipe(
          Effect.timeout(5000),
          Effect.catchTag("TimeoutError", () =>
            Effect.sync(() => child.kill("SIGKILL")).pipe(
              Effect.andThen(Effect.promise(() => child.exited)),
            ),
          ),
        );
      }),
  );
});

/** Waits for a finite real HTTP observation without masking a terminated tool. */
const waitForResponse = Effect.fn("test.waitToolResponse")(function* (
  port: number,
  path: string,
  includes: string,
) {
  const probe = Effect.tryPromise({
    try: () =>
      fetch(`http://127.0.0.1:${port}/_relkit/backend${path}`).then((response) =>
        response.ok ? response.text() : "",
      ),
    catch: () => new Error("UI not ready"),
  }).pipe(
    Effect.catchIf(
      () => true,
      () => Effect.succeed(""),
    ),
  );
  return yield* probe.pipe(
    Effect.repeat({ until: (value) => value.includes(includes), schedule: Schedule.spaced(100) }),
    Effect.timeout(20_000),
  );
});

test("standalone UI connects, persists redacted records, restarts and leaves its app alive", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const { root, backend, capture, connection, port } = yield* fixture;
      yield* capture.append({
        version: 2,
        signal: "log",
        timestamp: "2026-10-23T00:00:00.000Z",
        level: "info",
        component: "app",
        message: "standalone persisted",
        fields: { password: "must-never-reach-browser" },
      });
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* launch(root, port);
          expect(yield* waitForResponse(port, "/_relkit/v1/graph", '"nodes":[]')).not.toContain(
            connection.descriptor.token,
          );
          const logs = yield* waitForResponse(port, "/_relkit/v1/logs", "standalone persisted");
          expect(logs).not.toContain("must-never-reach-browser");
        }),
      );
      expect(
        yield* Effect.promise(() =>
          fetch(`http://127.0.0.1:${backend.port}/hello`).then((response) => response.text()),
        ),
      ).toBe("still serving");
      yield* connectionAttempt("test.descriptor-alive", () => access(connection.path));
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* launch(root, port);
          expect(
            yield* waitForResponse(port, "/_relkit/v1/logs", "standalone persisted"),
          ).not.toContain(connection.descriptor.token);
        }),
      );
    }).pipe(Effect.scoped, Effect.provide(bridgeLayer)),
  );
}, 50_000);
