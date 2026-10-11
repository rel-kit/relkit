/**
 * Creates an installed project exclusively from packed release packages.
 * Existing packing/registry utilities are finite foreign adapters; this scope
 * waits for their settlement and owns the registry. The returned temporary root
 * is retained as benchmark evidence and never resolves framework workspace links.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { readManifests, startRegistry } from "../pack-and-smoke-create-relkit-pack.js";
import { runCommand } from "../pack-and-smoke-create-relkit-support.js";
import { ownedNativePromise } from "@relkit/cli/internal/tooling";
import { packBaselineArtifacts } from "./packed-artifacts.js";

/**
 * Packs the candidate and prepares one fresh installed minimal project.
 * @param repository - Framework checkout used only for producing tarballs.
 * @param examples - Generated route policy; absence uses protected live graph proof.
 * @returns The outside-workspace fixture and registry identity in the caller Scope.
 * @remarks Packing utilities lack cancellation; the adapter joins their physical
 * settlement on interruption rather than detaching writes or children.
 */
export const preparePackedFixture = Effect.fn("ReadinessBenchmark.preparePacked")(function* (
  repository: string,
  examples: "examples" | "no-examples" = "examples",
) {
  const temporary = yield* ownedNativePromise("benchmark.temporary", () =>
    mkdtemp(join(tmpdir(), "relkit-readiness-")),
  );
  const manifests = yield* ownedNativePromise("benchmark.manifests", () =>
    readManifests(repository),
  );
  const tarballs = yield* packBaselineArtifacts(temporary, manifests);
  const server = yield* Effect.acquireRelease(
    ownedNativePromise("benchmark.registry", () => startRegistry(temporary, tarballs, manifests)),
    (server) => Effect.promise(() => server.stop(true)),
  );
  const registry = `http://127.0.0.1:${server.port}`;
  const version = manifests.get("@relkit/app")?.manifest.version;
  if (version === undefined)
    return yield* Effect.die(new Error("Packed application version is absent"));
  yield* installPackedGenerator(temporary, version, registry);
  const projectRoot = yield* createPackedProject(
    temporary,
    registry,
    "readiness-baseline",
    examples,
  );
  return {
    temporary,
    projectRoot,
    version,
    registry,
    examples,
    artifacts: [...tarballs.entries()].map(([name, path]) => ({ name, path })),
  };
});

/**
 * Creates one independently installed project from the already packed registry.
 * @param temporary - Benchmark-owned parent containing the installed generator.
 * @param registry - Scoped private registry serving the candidate tarballs.
 * @param name - Unique project and directory name for this evidence attempt.
 * @param examples - Generated readiness route policy.
 * @returns The absolute outside-workspace project root after preparation succeeds.
 */
export const createPackedProject = Effect.fn("ReadinessBenchmark.createPackedProject")(function* (
  temporary: string,
  registry: string,
  name: string,
  examples: "examples" | "no-examples",
) {
  const cache = join(temporary, "cache");
  yield* ownedNativePromise("benchmark.create", () =>
    runCommand(
      [
        join(temporary, "node_modules/.bin/create-relkit"),
        name,
        "--template",
        "minimal",
        "--cloud",
        "none",
        "--deploy",
        "none",
        "--install",
        "--no-git",
        `--${examples}`,
        "--json",
      ],
      temporary,
      registry,
      cache,
    ),
  );
  return resolve(temporary, name);
});

/**
 * Installs the packed generator with isolated registry resolution and cache.
 * @param temporary - Outside-workspace parent owned by this benchmark.
 * @param version - Verified common first-party release version.
 * @param registry - Owned local registry serving verified tarballs.
 * @returns Completion after finite installation settles, including interruption.
 */
const installPackedGenerator = Effect.fn("ReadinessBenchmark.installGenerator")(function* (
  temporary: string,
  version: string,
  registry: string,
) {
  yield* ownedNativePromise("benchmark.parentManifest", () =>
    writeFile(
      join(temporary, "package.json"),
      JSON.stringify({
        name: "relkit-readiness-parent",
        private: true,
        type: "module",
        dependencies: { "@relkit/cli": version, "create-relkit": version },
      }) + "\n",
    ),
  );
  const cache = join(temporary, "cache");
  yield* ownedNativePromise("benchmark.installGenerator", () =>
    runCommand(
      ["install", "--force", "--no-cache", "--registry", registry],
      temporary,
      registry,
      cache,
    ),
  );
});
