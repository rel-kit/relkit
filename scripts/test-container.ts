/**
 * Waits for machine headroom, then builds an exact standalone image for native
 * container acceptance. The invocation owns its build inputs, image and cleanup.
 */
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect, Exit } from "effect";
import { buildInspectorImage } from "./build-inspector-image.js";
import { prepareInspectorImage } from "./prepare-inspector-image.js";
import { packAll } from "./release-check-artifacts.js";
import { packages } from "./release-check-support.js";
import { awaitConsumerResources, consumerResourceMonitorLayer } from "./consumer-resources.js";
import { scaffoldNative } from "./scaffold-native.js";
import { scaffoldChild, ScaffoldProcess, scaffoldProcessLayer } from "./scaffold-process.js";
import { docker } from "./tests/server-runtime/production-docker-owner.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";
import { snapshotFile, restoreFile } from "./preserve-build-state.js";

const root = resolve(import.meta.dir, "..");

/** Reuses release staging, dependency checks and archive checksums without publishing. */
const imageCandidate = Effect.fn("ContainerGate.candidate")(function* (directory: string) {
  const artifacts = join(directory, "artifacts");
  const items = yield* scaffoldNative("container.packages", packages);
  const archives = yield* scaffoldNative("container.pack", () => packAll(items, artifacts));
  yield* scaffoldNative("container.manifest", () =>
    writeFile(join(artifacts, "manifest.json"), JSON.stringify({ packages: archives }) + "\n", {
      flag: "wx",
    }),
  );
  return artifacts;
});

/** Joins native exit and both output readers before any image or fixture removal. */
const runContainerSuite = Effect.fn("ContainerGate.tests")(function* (image: string) {
  const child = yield* scaffoldChild({
    cwd: root,
    args: ["test", "./tests/container"],
    env: { RELKIT_INSPECTOR_IMAGE: image },
  });
  const [exit, stdout, stderr] = yield* Effect.promise(() => child.settled);
  if (exit.status !== "fulfilled" || stdout.status !== "fulfilled" || stderr.status !== "fulfilled")
    return yield* Effect.fail(new Error("Container test exit/output failed to settle"));
  yield* Effect.sync(() => {
    process.stdout.write(stdout.value);
    process.stderr.write(stderr.value);
  });
  if (exit.value !== 0)
    return yield* Effect.fail(new Error(`Container tests failed (${exit.value})`));
});

/** Preserves editor declarations after the scoped build child has joined. */
const buildPackages = Effect.gen(function* () {
  yield* Effect.acquireRelease(
    scaffoldNative("container.editor-snapshot", () =>
      snapshotFile(join(root, "apps/inspector/next-env.d.ts")),
    ),
    (snapshot) =>
      scaffoldNative("container.editor-restore", () => restoreFile(snapshot)).pipe(Effect.orDie),
  );
  const processes = yield* ScaffoldProcess;
  yield* processes.run({
    cwd: root,
    args: [
      "x",
      "turbo",
      "run",
      "build",
      "--filter=./packages/*",
      "--filter=./integrations/catalog",
      "--filter=./integrations/packages/*",
      "--concurrency=1",
    ],
  });
}).pipe(Effect.scoped);

/** Every build tag, builder, input directory and archive directory belongs to this invocation. */
const main = Effect.gen(function* () {
  const admission = yield* awaitConsumerResources(root);
  if (admission.blocked) return yield* Effect.fail(new Error(admission.blocked));
  yield* buildPackages;
  const directory = yield* Effect.acquireRelease(
    scaffoldNative("container.directory", () => mkdtemp(join(tmpdir(), "relkit-container-gate-"))),
    (path, exit) =>
      Exit.isSuccess(exit)
        ? scaffoldNative("container.directory-close", () =>
            rm(path, { recursive: true, force: true }),
          ).pipe(Effect.orDie)
        : Effect.logWarning(`Failed container candidate retained: ${path}`),
  );
  const artifacts = yield* imageCandidate(directory);
  const identity = randomUUID();
  const input = `.relkit/inspector-image-${identity}`;
  yield* scaffoldNative("container.context-parent", () =>
    mkdir(join(root, ".relkit"), { recursive: true }),
  );
  yield* Effect.acquireRelease(prepareInspectorImage(artifacts, join(root, input)), (path) =>
    scaffoldNative("container.input-close", () => rm(path, { recursive: true, force: true })).pipe(
      Effect.orDie,
    ),
  );
  const image = `relkit-inspector:verify-${identity}`;
  yield* Effect.addFinalizer(() =>
    scaffoldNative("container.image-close", async () => {
      if (await docker(["image", "ls", "--quiet", "--filter", `reference=${image}`]))
        await docker(["image", "rm", image]);
    }).pipe(Effect.orDie),
  );
  yield* buildInspectorImage(image, input);
  yield* Effect.scoped(runContainerSuite(image).pipe(Effect.timeout("10 minutes")));
});

if (import.meta.main)
  await runBenchmarkMain(
    main.pipe(Effect.scoped, Effect.provide([scaffoldProcessLayer, consumerResourceMonitorLayer])),
  );
