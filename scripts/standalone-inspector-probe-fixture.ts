/** Installs exact candidate archives outside the checkout and owns every probe resource. */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit, Layer } from "effect";
import {
  InspectionBridge,
  InspectionBridgeLive,
  InspectionFilesLive,
  InspectionNativeLive,
  InspectionCapture,
} from "@relkit/inspector-api/connection";
import {
  loadReleaseTarballs,
  readManifests,
  startRegistry,
} from "./pack-and-smoke-create-relkit-pack.js";
import { scaffoldNative } from "./scaffold-native.js";
import { scaffoldProcessLayer, ScaffoldProcess } from "./scaffold-process.js";
import { root } from "./release-check-support.js";

/** Owns the independent business listener for the entire external probe. */
const probeApplication = Effect.acquireRelease(
  Effect.sync(() =>
    Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) =>
        new URL(request.url).pathname === "/hello"
          ? new Response("independent backend")
          : Response.json({
              protocol: "relkit.inspector",
              version: 1,
              generationId: "probe-one",
              nodes: [],
              edges: [],
            }),
    }),
  ),
  (server) => Effect.promise(() => server.stop(true)),
);

/** Full fixture cleanup waits for its registry, app and selected tool lifetimes. */
export const standaloneProbeFixture = Effect.fn("StandaloneProbe.fixture")(function* (
  artifacts: string,
) {
  const directory = yield* Effect.acquireRelease(
    scaffoldNative("standalone.temp", () => mkdtemp(join(tmpdir(), "relkit-inspector-external-"))),
    (path, exit) =>
      Exit.isSuccess(exit)
        ? scaffoldNative("standalone.temp-close", () =>
            rm(path, { recursive: true, force: true }),
          ).pipe(Effect.orDie)
        : Effect.logWarning(`Failed standalone fixture retained: ${path}`),
  );
  const tarballs = yield* scaffoldNative("standalone.archives", () =>
    loadReleaseTarballs(artifacts),
  );
  const manifests = yield* scaffoldNative("standalone.manifests", () => readManifests(root));
  const registry = yield* Effect.acquireRelease(
    scaffoldNative("standalone.registry", () => startRegistry(directory, tarballs, manifests)),
    (server) =>
      scaffoldNative("standalone.registry-close", () => server.stop(true)).pipe(Effect.orDie),
  );
  const project = join(directory, "project");
  yield* createProject(project);
  const app = yield* probeApplication;
  const capture = yield* InspectionCapture.make({});
  const connection = yield* InspectionBridge.use((bridge) =>
    bridge.start({
      root: project,
      host: "127.0.0.1",
      port: 0,
      active: () => ({
        endpoint: `http://127.0.0.1:${app.port}`,
        generationId: "probe-one",
        capabilities: ["graph", "records"],
      }),
      records: capture.records,
    }),
  );
  return {
    directory,
    project,
    capture,
    connection,
    registry: `http://127.0.0.1:${registry.port}`,
    backend: `http://127.0.0.1:${app.port}`,
  };
});

/** Installs only published runtime declarations with a private exact-version candidate registry. */
export const installStandaloneProbe = Effect.fn("StandaloneProbe.install")(function* (
  fixture: { directory: string; registry: string },
  name: string,
  version: string,
) {
  const directory = join(fixture.directory, name === "@relkit/inspector" ? "tool" : "cli");
  const cacheDir = join(fixture.directory, "package-cache");
  yield* scaffoldNative("standalone.install-manifest", async () => {
    await mkdir(directory);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "external-inspector-probe",
        private: true,
        type: "module",
        dependencies: { [name]: version },
      }),
    );
  });
  const process = yield* ScaffoldProcess;
  yield* process.run({
    args: ["install", "--ignore-scripts", "--linker=isolated"],
    cwd: directory,
    registry: fixture.registry,
    cacheDir,
  });
  return directory;
});

/** Native authorities are acquired only when the finite probe runs. */
export const standaloneProbeLayer = Layer.merge(
  scaffoldProcessLayer,
  InspectionBridgeLive.pipe(Layer.provide(Layer.merge(InspectionFilesLive, InspectionNativeLive))),
);

/** A config that throws proves discovery never evaluates application source. */
const createProject = (project: string) =>
  scaffoldNative("standalone.project", async () => {
    await mkdir(project);
    await writeFile(
      join(project, "relkit.config.ts"),
      'throw new Error("Tool must not evaluate application config");\n',
    );
  });
