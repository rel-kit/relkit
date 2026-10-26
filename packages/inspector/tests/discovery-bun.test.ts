/** Tests real authenticated discovery, ambiguity, stale PIDs, foreign projects and target override. */
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Effect, Layer } from "effect";
import {
  InspectionBridge,
  InspectionBridgeLive,
  InspectionFilesLive,
  InspectionNativeLive,
  connectionAttempt,
} from "@relkit/inspector-api/connection";
import { InspectorDiscovery, InspectorDiscoveryLive } from "../src/discovery.service.js";

const live = Layer.merge(
  InspectorDiscoveryLive,
  InspectionBridgeLive.pipe(Layer.provide(Layer.merge(InspectionFilesLive, InspectionNativeLive))),
);
const options = (projectRoot: string) => ({ projectRoot, hostname: "127.0.0.1", port: 3210 });

/** Every native root is test-owned and is released after its bridges. */
const root = Effect.acquireRelease(
  connectionAttempt("test.discovery-root", () => mkdtemp(join(tmpdir(), "relkit-discovery-"))),
  (root) =>
    connectionAttempt("test.discovery-remove", () =>
      rm(root, { recursive: true, force: true }),
    ).pipe(Effect.orDie),
);

test("zero sessions disconnects, two require explicit choice, and one reconnects after the other closes", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const projectRoot = yield* root;
      const discovery = yield* InspectorDiscovery;
      const bridge = yield* InspectionBridge;
      expect(yield* discovery.select(options(projectRoot))).toEqual({
        state: "disconnected",
        rejected: 0,
      });
      const first = yield* bridge.start({
        root: projectRoot,
        host: "127.0.0.1",
        port: 0,
        active: () => undefined,
      });
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* bridge.start({
            root: projectRoot,
            host: "127.0.0.1",
            port: 0,
            active: () => undefined,
          });
          expect(yield* discovery.select(options(projectRoot))).toMatchObject({
            state: "ambiguous",
          });
          expect(
            yield* discovery.select({ ...options(projectRoot), connectionFile: first.path }),
          ).toMatchObject({ state: "connected", connection: { path: first.path } });
        }),
      );
      expect(yield* discovery.select(options(projectRoot))).toMatchObject({
        state: "connected",
        connection: { path: first.path },
      });
    }).pipe(Effect.scoped, Effect.provide(live)),
  );
});

test("incompatible and stale descriptors with the current PID are rejected without deleting them", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const projectRoot = yield* root;
      const discovery = yield* InspectorDiscovery;
      const bridge = yield* InspectionBridge;
      const first = yield* bridge.start({
        root: projectRoot,
        host: "127.0.0.1",
        port: 0,
        active: () => undefined,
      });
      const incompatible = join(projectRoot, ".relkit/connections", `${randomUUID()}.json`);
      const stale = join(projectRoot, ".relkit/connections", `${randomUUID()}.json`);
      yield* connectionAttempt("test.incompatible", () =>
        writeFile(incompatible, JSON.stringify({ ...first.descriptor, protocol: 2 }), {
          mode: 0o600,
        }),
      );
      yield* connectionAttempt("test.stale", () =>
        writeFile(stale, JSON.stringify({ ...first.descriptor, sessionId: randomUUID() }), {
          mode: 0o600,
        }),
      );
      expect(yield* discovery.select(options(projectRoot))).toMatchObject({
        state: "connected",
        rejected: 2,
      });
      const foreignRoot = yield* root;
      expect(
        yield* discovery.select({ ...options(foreignRoot), connectionFile: first.path }),
      ).toEqual({ state: "disconnected", rejected: 1 });
      expect(
        yield* discovery
          .select({ ...options(projectRoot), connectionFile: incompatible })
          .pipe(Effect.result),
      ).toMatchObject({ _tag: "Failure" });
    }).pipe(Effect.scoped, Effect.provide(live)),
  );
});

test("network target overrides preserve authenticated project/session and original host checks", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const projectRoot = yield* root;
      const discovery = yield* InspectorDiscovery;
      const bridge = yield* InspectionBridge;
      const first = yield* bridge.start({
        root: projectRoot,
        host: "0.0.0.0",
        port: 0,
        active: () => undefined,
      });
      const target = first.descriptor.endpoint.replace("127.0.0.1", "0.0.0.0");
      expect(
        yield* discovery.select({ ...options(projectRoot), connectionFile: first.path, target }),
      ).toMatchObject({
        state: "connected",
        handshake: { projectId: first.descriptor.projectId, sessionId: first.descriptor.sessionId },
      });
    }).pipe(Effect.scoped, Effect.provide(live)),
  );
});
