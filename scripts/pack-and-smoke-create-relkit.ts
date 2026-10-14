/** Owns external packed creation, add, migration and live acceptance for publicly certified tuples, retaining all native failures. */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ScaffoldProcess, scaffoldProcessLayer } from "./scaffold-process.js";
import { scaffoldPort } from "./scaffold-http.js";
import { scaffoldNative } from "./scaffold-native.js";
import { exerciseScaffoldRoutes, verifyScaffoldBuild } from "./scaffold-smoke-workflows.js";
import { verifyInteractiveResolver, verifyScaffoldTerminal } from "./scaffold-smoke-terminal.js";
import { addArtifacts } from "./pack-and-smoke-create-relkit-artifacts.js";
import { verifyProject } from "./pack-and-smoke-create-relkit-support.js";
import { authoredProjectSnapshot } from "./scaffold-project-files.js";
import {
  loadReleaseTarballs,
  readManifests,
  startRegistry,
} from "./pack-and-smoke-create-relkit-pack.js";
import { packBaselineArtifacts } from "./dev-readiness/packed-artifacts.js";
import { createPackedScaffolds } from "./packed-scaffold-create.js";
import type { PackedCommand, PackedScaffoldFixture } from "./packed-scaffold.types.js";

/** One finite acceptance invocation captures command authority without granting application resource access. */
class PackedScaffold extends Context.Service<PackedScaffold>()("relkit.scripts.PackedScaffold", {
  make: Effect.gen(function* () {
    const process = yield* ScaffoldProcess;
    return {
      run: () =>
        observeExecution("testing", "scaffold.packed", main(process.run).pipe(Effect.scoped)),
    };
  }),
}) {}

/**
 * Acquires the isolated installed generator and registry in the caller's fixture scope.
 * @param run - Captured native command capability.
 * @returns Exact installed executable/registry authority after installation succeeds.
 */
const fixture = Effect.fn("PackedScaffold.fixture")(function* (run: PackedCommand) {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const temporary = yield* Effect.acquireRelease(
    scaffoldNative("temporary", () => mkdtemp(join(tmpdir(), "relkit-create-smoke-"))),
    (root) =>
      scaffoldNative("temporary.release", () => rm(root, { recursive: true, force: true })).pipe(
        Effect.orDie,
      ),
  );
  const manifests = yield* scaffoldNative("manifests", () => readManifests(repository));
  const artifactIndex = process.argv.indexOf("--artifacts");
  const directory = artifactIndex < 0 ? undefined : process.argv[artifactIndex + 1];
  assert.ok(artifactIndex < 0 || directory !== undefined, "--artifacts requires a directory");
  let tarballs: Map<string, string>;
  if (directory === undefined) tarballs = yield* packBaselineArtifacts(temporary, manifests);
  else tarballs = yield* scaffoldNative("tarballs", () => loadReleaseTarballs(resolve(directory)));
  const server = yield* Effect.acquireRelease(
    scaffoldNative("registry", () => startRegistry(temporary, tarballs, manifests)),
    (server) => Effect.promise(() => server.stop(true)),
  );
  assert.ok(server.port);
  const registry = "http://127.0.0.1:" + server.port;
  const cacheDir = join(temporary, "cache");
  const version = manifests.get("@relkit/app")?.manifest.version;
  assert.ok(version);
  yield* installGenerator(run, temporary, registry, cacheDir, version);
  return {
    temporary,
    registry,
    cacheDir,
    createBin: join(temporary, "node_modules/.bin/create-relkit"),
    relkitBin: join(temporary, "node_modules/.bin/relkit"),
  } satisfies PackedScaffoldFixture;
});

/**
 * Installs the two public packed executables in the scope-owned external parent.
 * @param run - Captured native command capability.
 * @param temporary - Scope-owned parent directory.
 * @param registry - Exact local candidate registry.
 * @param cacheDir - Isolated package-manager cache.
 * @param version - Verified first-party package version.
 * @returns Completion after the native installation child has exited and drained.
 */
const installGenerator = Effect.fn("PackedScaffold.installGenerator")(function* (
  run: PackedCommand,
  temporary: string,
  registry: string,
  cacheDir: string,
  version: string,
) {
  yield* scaffoldNative("parent.manifest", () =>
    writeFile(
      join(temporary, "package.json"),
      JSON.stringify({
        name: "relkit-packed-smoke",
        private: true,
        type: "module",
        dependencies: { "@relkit/cli": version, "create-relkit": version },
      }) + "\n",
    ),
  );
  yield* run({
    args: ["install", "--force", "--no-cache", "--registry", registry],
    cwd: temporary,
    registry,
    cacheDir,
  });
});

/**
 * Exercises additions and native development after byte-identical public creation.
 * @param run - Captured command capability.
 * @returns Completion after every scoped registry and child has shut down.
 */
const main = Effect.fn("PackedScaffold.acceptance")(function* (run: PackedCommand) {
  const candidate = yield* fixture(run);
  process.env.PORT = String(yield* scaffoldPort);
  process.env.RELKIT_INSPECTOR_PORT = String(yield* scaffoldPort);
  Object.assign(process.env, {
    EVENT_BUS_NAME: "relkit-smoke",
    EVENT_ENDPOINT: "http://127.0.0.1:4566",
  });
  yield* scaffoldNative("resolver", () => verifyInteractiveResolver(candidate.temporary));
  const roots = yield* createPackedScaffolds(run, candidate);
  for (const root of roots)
    yield* scaffoldNative("artifacts", () =>
      addArtifacts(candidate.relkitBin, root, candidate.registry, candidate.cacheDir),
    );
  assert.deepEqual(
    yield* authoredProjectSnapshot(roots[0]),
    yield* authoredProjectSnapshot(roots[1]),
  );
  for (const root of roots) yield* verifyConsumer(run, candidate, root);
});

/**
 * Verifies native terminal consent, build policy and uninterrupted development; local Docker reset is scope-owned.
 * @param run - Captured command operation.
 * @param candidate - Exact installed fixture authority.
 * @param root - Generated consumer root with grouped additions.
 * @returns Completion after native tests and local resource cleanup.
 */
const verifyConsumer = Effect.fn("PackedScaffold.consumer")(function* (
  run: PackedCommand,
  candidate: PackedScaffoldFixture,
  root: string,
) {
  yield* Effect.scoped(
    Effect.gen(function* () {
      if (process.env.RELKIT_TEST_DOCKER === "1") {
        yield* Effect.addFinalizer(() =>
          run({
            args: [candidate.relkitBin, "local", "reset", "--yes", "--project-root", root],
            cwd: root,
          }).pipe(Effect.orDie),
        );
        yield* scaffoldNative("terminal", () => verifyScaffoldTerminal(root, candidate.relkitBin));
      }
      yield* scaffoldNative("build", () => verifyScaffoldBuild(root));
      yield* scaffoldNative("development", () =>
        verifyProject(root, candidate.registry, candidate.cacheDir, (port) =>
          exerciseScaffoldRoutes(root, port, candidate.relkitBin),
        ),
      );
    }),
  );
});

if (import.meta.main) {
  const live = Layer.effect(PackedScaffold, PackedScaffold.make).pipe(
    Layer.provide(scaffoldProcessLayer),
  );
  await Effect.runPromise(
    Effect.flatMap(PackedScaffold, (service) => service.run()).pipe(Effect.provide(live)),
  );
}
